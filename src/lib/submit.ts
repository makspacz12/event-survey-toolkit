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
 * Sending is RESILIENT TO NO NETWORK: a failed attempt lands in an
 * in-memory queue on the phone and is retried the next time the page opens
 * and whenever the browser reports the connection is back.
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

/** Saves the payload to the queue (when submission failed). */
function enqueue(payload: unknown) {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    const queue: unknown[] = raw ? JSON.parse(raw) : []
    queue.push(payload)
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
  } catch {
    // out of storage space — fine, the user still has the file download
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
async function submitOnce(payload: unknown): Promise<boolean> {
  if (!URL) return false
  try {
    const res = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
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
    // Usually no connection. The payload goes into the queue and we'll try
    // again once the network is back.
    return false
  }
}

/** Identifies a payload in the queue, so the right entry can be removed. */
function payloadKey(payload: unknown): string {
  const d = payload as { sesja?: string; wersja?: string }
  return `${d?.sesja ?? ''}|${d?.wersja ?? ''}`
}

/**
 * Sends the answers. If it fails, they land in the queue and are retried
 * later. Returns `true` on success.
 *
 * After a successful send, we remove earlier attempts from the same session
 * from the queue. Without this, a manual "Try again" would leave an old
 * copy in the queue, which would go out on the next page load and create a
 * second, poorer row for the same person in the sheet.
 */
export async function submitAnswers(state: SurveyState): Promise<boolean> {
  if (!submitConfigured) return false
  const payload = buildPayload(state)

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

  if (ok) removeFromQueue(payloadKey(payload))
  else enqueue(payload)
  return ok
}

function removeFromQueue(key: string) {
  const queue = readQueue()
  const remaining = queue.filter((d) => payloadKey(d) !== key)
  if (remaining.length !== queue.length) writeQueue(remaining)
}

/**
 * Whether draining is already in progress. Without this flag two parallel
 * runs (app start + "online" event) would read the same queue and send
 * everything twice.
 */
let isDraining = false

/**
 * Tries to send everything waiting in the queue. Called on app start and
 * when the connection comes back.
 *
 * IMPORTANT: we only remove entries from the queue that actually went
 * through — re-reading it right before writing. An earlier version
 * overwrote the queue with a list computed BEFORE the loop, so a survey
 * added mid-loop (a participant finishing up just as the network came back)
 * got wiped without being sent.
 */
export async function drainQueue(): Promise<number> {
  if (!submitConfigured || isDraining) return 0
  isDraining = true
  try {
    const toSend = readQueue()
    if (toSend.length === 0) return 0

    let sent = 0
    for (const payload of toSend) {
      const ok = await submitOnce(payload)
      if (!ok) continue
      sent++
      // Re-read: while waiting for the response, the queue may have grown
      // with a freshly finished survey.
      const current = readQueue()
      writeQueue(
        current.filter((d) => d !== payload && payloadKey(d) !== payloadKey(payload)),
      )
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
