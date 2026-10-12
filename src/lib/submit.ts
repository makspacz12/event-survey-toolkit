import ankietaJson from '@/data/ankieta.json'
import type { Survey } from '@/data/typy'
import type { SurveyState } from '@/lib/storage'
import { NIEOBECNY, absentLabelFor } from '@/components/survey/AnswerWidgets'
import { cleanRanking } from '@/lib/ranking'
import { visibleQuestionIds } from '@/lib/visibility'

/**
 * SUBMITTING ANSWERS TO THE GOOGLE SHEET
 * =====================================
 * The app has NO Google credentials, and can't have any: everything in the
 * site's code is visible to anyone via "view source". Instead we send data
 * to an Apps Script endpoint that already runs under the sheet owner's
 * account, and it is the one with write access.
 *
 * The `TOKEN` below is not a Google key, just a password for our own
 * endpoint. If it leaked, the worst a stranger could do is append fake
 * rows. They couldn't read anyone else's answers or delete anything.
 *
 * Sending is RESILIENT TO NO NETWORK: the answers sit in a queue on the
 * phone from the moment the send starts until the server confirms it, and
 * whatever is left there is retried the next time the survey opens and
 * whenever the browser reports the connection is back.
 */

const SURVEY = ankietaJson as Survey

const URL = import.meta.env.VITE_ARKUSZ_URL as string | undefined
const TOKEN = import.meta.env.VITE_ARKUSZ_TOKEN as string | undefined

/** Survey content version — makes it easier to tell answers apart after questions change. */
const VERSION = '2026-10-12'

const QUEUE_KEY = 'ctn-kolejka-wysylki-v1'
const SESSION_KEY = 'ctn-sesja-v1'

export type SubmitStatus = 'brak-konfiguracji' | 'gotowe' | 'wysylanie' | 'wyslano' | 'blad'

/** Whether submission is configured at all (URL and token present). */
export const submitConfigured = Boolean(URL && TOKEN)

if (!submitConfigured) {
  // Loud warning, because this is the most dangerous silent failure in this
  // app: the survey looks fine, people fill it in, and the answers never
  // arrive anywhere. One page load after deploy is enough to catch this.
  console.warn(
    '[survey] SUBMISSION DISABLED — missing VITE_ARKUSZ_URL or VITE_ARKUSZ_TOKEN. ' +
      "Answers will only stay in the participant's browser. " +
      'After adding the variables the app needs to be rebuilt (Redeploy).',
  )
}

/**
 * Stable device identifier. Lets us recognize that the same person is
 * filling the survey a second time, without collecting any data about them.
 */
function sessionId(): string {
  try {
    const saved = localStorage.getItem(SESSION_KEY)
    if (saved) return saved
    const fresh =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `s-${Date.now()}-${Math.random().toString(36).slice(2)}`
    localStorage.setItem(SESSION_KEY, fresh)
    return fresh
  } catch {
    return `s-${Date.now()}`
  }
}

/**
 * Forgets the current identifier, so the next submission on this device
 * counts as a separate answer.
 *
 * Called when a survey starts from an empty state (the previous person's
 * answers are gone after a confirmed send), NOT right after that send: a
 * participant who goes back from the final screen to fix one answer and
 * finishes again must still be recognised as the same person.
 */
export function forgetSession() {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    /* no access to storage — fine, the next submission will still work */
  }
}

/** Turns a value into text readable in the sheet. */
function readable(v: unknown, absent: string): string {
  if (v == null || v === '') return ''
  if (v === NIEOBECNY) return absent
  if (Array.isArray(v)) return v.join('; ')
  if (v === 'tak') return 'Tak'
  if (v === 'nie') return 'Nie'
  return String(v)
}

/** Builds the payload sent to the script. */
function buildPayload(state: SurveyState) {
  const odpowiedzi: Record<string, string> = {}
  const etykiety: Record<string, string> = {}

  // ORDER MATTERS: we send EVERY question and EVERY allowed comment, even
  // empty ones. A sheet column is created on the first occurrence of a key,
  // so skipping empty values would push comments to the end of the sheet,
  // away from the questions they belong to. Empty fields cost nothing, and
  // the column layout then matches the survey's layout.
  // Only what the participant could see counts. A Friday rating given before
  // the person changed the attendance answer to "Nie", or a speaker picked
  // before the debate was marked "did not attend", is sent as blank — the
  // key still goes, the value does not.
  const visible = visibleQuestionIds(SURVEY, state.odpowiedzi)

  for (const sekcja of SURVEY.sekcje) {
    for (const p of sekcja.pytania) {
      const shown = visible.has(p.id)
      const absent = absentLabelFor(p)
      /* A ranking gets ONE COLUMN PER PLACE, not one column holding
       * "A; B; C".
       *
       * The order is the answer here, and a single joined cell hides it
       * behind text splitting: counting first places would mean parsing every
       * row. One column per place makes it a COUNTIF. The suffixed key and the
       * decorated header follow the convention comments already use, so the
       * sheet keeps one shape.
       *
       * Empty places are still sent, for the same reason every other empty
       * answer is: a column appears on its first occurrence, so a place left
       * blank by the first respondent must not move the later columns. */
      if (p.typ === 'ranking') {
        const miejsca = p.max ?? 3
        // The same cleaning the widget applies, so what is sent is what was
        // on screen even if the cached answer predates a change to the list.
        const lista = shown
          ? cleanRanking(state.odpowiedzi[p.id], p.opcje ?? [], miejsca)
          : []
        for (let i = 0; i < miejsca; i += 1) {
          odpowiedzi[`${p.id}::${i + 1}`] = readable(lista[i], absent)
          etykiety[`${p.id}::${i + 1}`] = `${p.tresc} [${i + 1}. miejsce]`
        }
      } else {
        odpowiedzi[p.id] = shown ? readable(state.odpowiedzi[p.id], absent) : ''
        etykiety[p.id] = p.tresc
      }

      if (p.komentarz) {
        const kom = state.odpowiedzi[`${p.id}::komentarz`]
        odpowiedzi[`${p.id}::komentarz`] = shown && typeof kom === 'string' ? kom : ''
        etykiety[`${p.id}::komentarz`] = `${p.tresc} [komentarz]`
      }
    }
  }

  return {
    token: TOKEN,
    sesja: sessionId(),
    kto:
      state.intro.przedstawienie === 'imie' && state.intro.imieNazwisko.trim()
        ? state.intro.imieNazwisko.trim()
        : 'anonimowo',
    wersja: VERSION,
    pulapka: '', // only bots will fill this in
    odpowiedzi,
    etykiety,
  }
}

/**
 * Saves the payload to the queue. ONE ENTRY PER PERSON: an entry already
 * waiting under the same key is replaced by the newer answers, not joined by
 * them. Before this, every "Spróbuj teraz" tapped without signal added one
 * more copy of the same answers, and when the connection came back each copy
 * became a row in the sheet — seen on the live site as three rows for one
 * participant.
 */
function enqueue(payload: unknown) {
  try {
    const key = payloadKey(payload)
    const queue = readQueue().filter((d) => payloadKey(d) !== key)
    queue.push(payload)
    writeQueue(queue)
  } catch {
    // out of storage space — fine, the answers are still on screen
  }
}

function readQueue(): unknown[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function writeQueue(queue: unknown[]) {
  try {
    if (queue.length === 0) localStorage.removeItem(QUEUE_KEY)
    else localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
  } catch {
    /* see above */
  }
}

/**
 * A single submission attempt.
 *
 * `Content-Type: text/plain` MUST stay here. Apps Script does not respond to
 * CORS preflight requests, and `application/json` forces one. Plain text
 * sidesteps the problem, and the script parses the JSON anyway.
 *
 * WHY NOT `mode: 'no-cors'`
 * =========================
 * Earlier this used `no-cors`, on the assumption that the browser wouldn't
 * let us read Google's response. Verified in a real browser: it does.
 * Google redirects to `script.googleusercontent.com`, but that response
 * carries a header allowing the read, so a plain `fetch` returns a normal
 * `{"ok":true}`.
 *
 * The difference matters a lot. In `no-cors` mode the response is "opaque",
 * and EVERY failure on Google's side looked like success: the participant
 * saw a green "Sent to the organizer" message, and nothing showed up in the
 * sheet. A load test showed that with 50 people at once, more than half the
 * answers were silently lost this way. Now a failed write is visible: it
 * lands in the queue and gets retried.
 */
/**
 * How long one attempt may take before it counts as failed. A phone that
 * drops off the network mid-request can otherwise hang on "Wysyłanie…" for
 * as long as the browser cares to wait — minutes, with no retry and no
 * message. The server itself waits up to 120 s for its turn to write, so
 * most slow-but-successful writes still make it under this limit; one that
 * does not gets retried, and the sheet marks the older copy as superseded.
 */
const ATTEMPT_TIMEOUT = 90000

async function submitOnce(payload: unknown): Promise<boolean> {
  if (!URL) return false
  // AbortController rather than AbortSignal.timeout(): the latter is missing
  // on phones a few years old, and a missing function here would make EVERY
  // send fail — straight into the queue, for good.
  const controller =
    typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = controller
    ? setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT)
    : null
  try {
    const res = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
      ...(controller ? { signal: controller.signal } : {}),
    })
    const text = await res.text()
    try {
      return (JSON.parse(text) as { ok?: boolean }).ok === true
    } catch {
      // Got HTML instead of JSON — usually Google's sign-in page, meaning
      // the deployment isn't set to "access: anyone".
      console.warn('[survey] server responded with non-JSON:', text.slice(0, 120))
      return false
    }
  } catch {
    // Usually no connection, or the attempt ran out of time. The payload is
    // already in the queue and will be tried again.
    return false
  } finally {
    if (timer !== null) clearTimeout(timer)
  }
}

/** Identifies a person's answers in the queue (one entry per person, see `enqueue`). */
function payloadKey(payload: unknown): string {
  const d = payload as { sesja?: string; wersja?: string }
  return `${d?.sesja ?? ''}|${d?.wersja ?? ''}`
}

/**
 * Sends the answers. Returns `true` once the server has confirmed the write.
 *
 * WRITE-AHEAD: the answers go into the queue BEFORE the request leaves, and
 * the confirmation takes them out. The queue used to be written only after
 * a failure — but a page closed while "Wysyłanie…" was showing fails
 * nothing, it simply vanishes, and with it the answers. Now whatever is not
 * confirmed is still on the phone for the next visit to send.
 */
export async function submitAnswers(state: SurveyState): Promise<boolean> {
  if (!submitConfigured) return false
  const payload = buildPayload(state)
  enqueue(payload)
  return sendWithRetry(payload)
}

/**
 * Sends in progress, by person. Shared by `submitAnswers` and `drainQueue`,
 * so the same answers never travel twice at once. At app start both the
 * final screen (repeating its own send) and the queue drain reach for the
 * same payload; without this each made its own request — two rows for one
 * person. An IDENTICAL payload joins the request already running. A
 * DIFFERENT one for the same person (they went back and changed an answer
 * while the first send was still out) waits for it to finish, so the rows
 * reach the sheet in the order they were made and the "superseded" mark
 * lands on the older one, never on the newer.
 */
const inFlight = new Map<string, { body: string; promise: Promise<boolean> }>()

async function sendWithRetry(payload: unknown): Promise<boolean> {
  const key = payloadKey(payload)
  const body = JSON.stringify(payload)
  const running = inFlight.get(key)
  if (running) {
    if (running.body === body) return running.promise
    await running.promise
    return sendWithRetry(payload)
  }

  const promise = (async () => {
    let ok = await submitOnce(payload)
    if (!ok) {
      // One retry after a short delay. The most common failure cause is a
      // rush in the first minutes after the survey link goes out — a second
      // attempt then hits a less crowded queue. We wait long enough not to
      // add to the peak, but short enough that the participant is still
      // looking at the screen.
      await new Promise((r) => setTimeout(r, 2500))
      ok = await submitOnce(payload)
    }
    if (ok) removeFromQueue(key, body)
    return ok
  })()
  inFlight.set(key, { body, promise })
  try {
    return await promise
  } finally {
    if (inFlight.get(key)?.promise === promise) inFlight.delete(key)
  }
}

/**
 * Takes a confirmed payload out of the queue — and only that one. An entry
 * under the same key with different contents is newer (the person changed an
 * answer meanwhile) and still has to go.
 */
function removeFromQueue(key: string, body: string) {
  const queue = readQueue()
  const remaining = queue.filter(
    (d) => payloadKey(d) !== key || JSON.stringify(d) !== body,
  )
  if (remaining.length !== queue.length) writeQueue(remaining)
}

/**
 * Whether draining is already in progress. Without this flag two parallel
 * runs (app start + "online" event) would read the same queue and send
 * everything twice.
 */
let isDraining = false

/**
 * Tries to send everything waiting in the queue. Called when the survey
 * opens and when the connection comes back.
 *
 * Only a confirmed entry leaves the queue, and `sendWithRetry` removes
 * exactly the entry it sent — so a survey finished while the drain was
 * running (a participant tapping "Zakończ" just as the network came back)
 * is neither wiped nor sent twice. Each entry is checked against the queue
 * again right before its turn: the final screen's own send may have
 * confirmed it in the meantime.
 */
export async function drainQueue(): Promise<number> {
  if (!submitConfigured || isDraining) return 0
  isDraining = true
  try {
    let sent = 0
    for (const payload of readQueue()) {
      const body = JSON.stringify(payload)
      const stillWaiting = readQueue().some((d) => JSON.stringify(d) === body)
      if (!stillWaiting) continue
      if (await sendWithRetry(payload)) sent++
    }
    return sent
  } finally {
    isDraining = false
  }
}

/** How many payloads are waiting to be sent. */
export function queueLength(): number {
  return readQueue().length
}

/**
 * Whether THIS device's current answers are still waiting in the queue. The
 * final screen asks after a queue drain: if nothing is left for this person,
 * the drain confirmed their answers and the screen can say so — instead of
 * keeping its failure message and sending the same answers once more on the
 * next automatic retry.
 */
export function pendingForThisDevice(): boolean {
  const key = `${sessionId()}|${VERSION}`
  return readQueue().some((d) => payloadKey(d) === key)
}
