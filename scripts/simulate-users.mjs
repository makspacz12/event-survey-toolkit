/**
 * A CROWD OF SIMULATED PARTICIPANTS, EACH IN A REAL BROWSER.
 *
 * WHY. Unit tests prove the pieces; a load test proves the server. Neither
 * proves that a hundred different people, tapping through the survey on
 * their phones at the same moment, each end up with THEIR answers in the
 * right cells of the sheet. This script does that: it invents a hundred
 * people with different habits, drives a separate headless Chromium page
 * for each of them, and afterwards compares what every person meant to say
 * with what landed in the (mock) spreadsheet, cell by cell.
 *
 * EVERY PERSON IS DIFFERENT, on purpose. Attendance on one day, the other,
 * both or neither. A name, with awkward characters, or anonymity. Scores,
 * "did not attend" marks, comments full of quotes, emoji and spreadsheet
 * formulas. Rankings picked, un-picked, cleared and picked again. Some go
 * back a section, some reload the page half-way, some try to finish before
 * answering the required question, some change their mind about Friday
 * after rating all of it. Each of those is a path a real participant can
 * take, and each has a precise expected outcome written down here,
 * independently of the application's own code.
 *
 * TWO TARGETS:
 *   --target mock  (default) a local build pointed at scripts/mock-sheet-server.mjs,
 *                  which runs the real Apps Script code on a fake sheet that
 *                  can be read back and checked. No real row is ever written.
 *   --target prod  the public survey URL. The rows land in the real sheet;
 *                  the expected values are saved to a JSON file so they can
 *                  be compared with the sheet afterwards. Every such row is
 *                  labelled as a test in the "Kto wypełnił" column.
 *
 * Run:
 *   node scripts/simulate-users.mjs --users 100 --concurrency 100
 *   node scripts/simulate-users.mjs --target prod --base https://ankieta.masterclassleadership.org --users 10
 *
 * Options: --base URL  --mock URL  --users N  --concurrency N  --seed N
 *          --headful   --light-ratio 0.9   --out plik.json  --label TEKST
 */

import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

/* ------------------------------------------------------------- options --- */

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) {
      const next = all[i + 1]
      acc.push([a.slice(2), next === undefined || next.startsWith('--') ? 'true' : next])
    }
    return acc
  }, []),
)
const TARGET = args.target ?? 'mock'
const BASE = (args.base ?? (TARGET === 'mock' ? 'http://127.0.0.1:4199' : 'https://ankieta.masterclassleadership.org')).replace(/\/$/, '')
const MOCK = args.mock ?? 'http://127.0.0.1:8787'
const USERS = Number(args.users ?? 20)
const CONCURRENCY = Number(args.concurrency ?? USERS)
const SEED = Number(args.seed ?? 2026)
const HEADFUL = args.headful === 'true'
const LIGHT_RATIO = Number(args['light-ratio'] ?? 0.9)
/** On the real sheet every row must be recognisable as a test, so the name carries this label. */
const LABEL = args.label ?? (TARGET === 'prod' ? 'TEST-SYMULACJA' : '')
const OUT = args.out ?? join(ROOT, `symulacja-${TARGET}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
const VERSION = '2026-10-12'
/** Mock only: make the next N submissions fail, to rehearse the error path. */
const FAIL_NEXT = Number(args['fail-next'] ?? 0)
/** With --no-manual-retry nobody taps "Spróbuj teraz": the app has to recover by itself. */
const MANUAL_RETRY = args['no-manual-retry'] !== 'true'
/**
 * Browser identity. Headless Chromium announces itself as "HeadlessChrome",
 * and a hundred of those from one address in two seconds is exactly what a
 * hosting provider's bot mitigation is built to challenge (Vercel answered
 * such a run with 403 for everyone). Against the public site the personas
 * therefore present themselves as ordinary phones.
 */
const USER_AGENT =
  args.ua ??
  (TARGET === 'prod'
    ? 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'
    : undefined)

/* --------------------------------------------------------------- survey --- */

const survey = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'ankieta.json'), 'utf8'))
const sections = survey.sekcje
const START = sections[0]
const ABSENT_DEFAULT = 'Nie brałem(-am) udziału'
const absentLabel = (q) => q.nieobecnosc_tekst ?? ABSENT_DEFAULT
const optionText = (o) => (typeof o === 'string' ? o : o.tekst)
const places = (q) => q.max ?? 3
const allQuestions = sections.flatMap((s) => s.pytania.map((q) => ({ ...q, section: s })))
const byId = Object.fromEntries(allQuestions.map((q) => [q.id, q]))
const REQUIRED_TEXT = allQuestions.find((q) => q.typ === 'tekst' && q.wymagane)
if (!REQUIRED_TEXT) throw new Error('the survey has no required text question to carry the row marker')
/** An optional text question in the always-visible last section, edited after a confirmed send. */
const FIX_TEXT = sections[sections.length - 1].pokaz_jesli
  ? null
  : sections[sections.length - 1].pytania.find((q) => q.typ === 'tekst' && !q.wymagane) ?? null

/* ------------------------------------------------------------ randomness --- */

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const NAMES = [
  'Anna Kowalska', 'Jan Nowak-Wiśniewski', "José O'Brien", 'Zofia 🌟 Testowa',
  '  Michał   Zieliński  ', 'Łucja Żółć-Gęślak', '<b>Marek</b> Lis', '=HYPERLINK("x")',
  'Katarzyna Maria Anna Kowalska-Nowakowska-Wiśniewska z Zakrzewa Wielkiego',
  'Ola "Cudzysłów" Mała', 'Piotr; Średnik', 'Ewa\tTabulator',
]
const COMMENTS = [
  'Było super.', 'Za mało przerw między blokami.', 'Cudzysłowy: "polskie" i „typograficzne”, apostrof: O\'Brien.',
  '=SUMA(A1:A9)', '-5', '00:30', 'Wiele linii:\nDruga linia.\nTrzecia.', '🎉👏 Robot 🤖 zrobił wrażenie ⭐⭐⭐⭐⭐',
  '<script>alert("x")</script> <b>pogrubienie</b>', 'Średnik; przecinek, tabulator\ti koniec.',
  'Bardzo długa wypowiedź. '.repeat(40).trim(), 'zażółć gęślą jaźń ĄĆĘŁŃÓŚŹŻ', '+1 dla prowadzącego', '-1+1', '@wszyscy',
]
const SENTENCES = [
  'Dwa dni, po których wracasz z planem.', 'Intensywnie, ale warto.', 'Najlepsza rozmowa przy stoliku.',
  'Więcej takich spotkań.', 'Inspiracja i konkret w jednym.',
]

/* -------------------------------------------------------------- persona --- */

function makePersona(nr, rnd) {
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)]
  const chance = (p) => rnd() < p
  const marker = `#${String(nr).padStart(3, '0')}`

  const r = rnd()
  const attendance = r < 0.55 ? ['tak', 'tak'] : r < 0.7 ? ['tak', 'nie'] : r < 0.95 ? ['nie', 'tak'] : ['nie', 'nie']
  const withName = LABEL ? true : chance(0.4)
  const name = withName ? `${LABEL ? LABEL + ' ' : ''}${pick(NAMES)} ${marker}` : null

  const plans = {}
  for (const q of allQuestions) {
    if (q.section === START) continue
    if (q.typ === 'skala') {
      const absent = Boolean(q.nieobecnosc) && chance(0.15)
      plans[q.id] = {
        kind: 'skala',
        value: absent ? 'absent' : 1 + Math.floor(rnd() * (q.max ?? 10)),
        comment: q.komentarz && chance(0.35) ? pick(COMMENTS) : null,
        // Writes a comment first, then marks the thing as not attended: the
        // comment must vanish with it.
        commentThenAbsent: absent && Boolean(q.komentarz) && chance(0.5),
      }
    } else if (q.typ === 'tak_nie') {
      const value = chance(0.6) ? 'tak' : 'nie'
      plans[q.id] = {
        kind: 'tak_nie',
        value,
        // On "nie" the comment box opens by itself; most people then type.
        comment: q.komentarz && (value === 'nie' ? chance(0.7) : chance(0.3)) ? pick(COMMENTS) : null,
      }
    } else if (q.typ === 'ranking') {
      const names = (q.opcje ?? []).map(optionText)
      const shuffled = [...names].sort(() => rnd() - 0.5)
      const count = Math.floor(rnd() * (places(q) + 1)) // 0..places
      const picks = shuffled.slice(0, count)
      plans[q.id] = {
        kind: 'ranking',
        picks,
        // A wrong tap, undone: pick someone extra first, then remove them.
        mistake: picks.length > 0 && picks.length < names.length && chance(0.25) ? shuffled[picks.length] : null,
        // Start over with the Clear link, then pick again.
        clearFirst: picks.length > 0 && chance(0.15),
        pickThenAbsent: false,
      }
    } else if (q.typ === 'tekst') {
      plans[q.id] = {
        kind: 'tekst',
        value: q.wymagane ? `${pick(SENTENCES)} ${marker}` : chance(0.5) ? pick(COMMENTS) : null,
      }
    }
  }

  // Debate marked "did not attend" after a speaker was already ranked: the
  // ranking card must disappear and nothing from it may be sent.
  for (const q of allQuestions) {
    if (q.typ !== 'ranking' || !q.ukryj_jesli) continue
    const parent = plans[q.ukryj_jesli.pytanie]
    if (parent?.value === 'absent' && chance(0.5)) {
      plans[q.id].pickThenAbsent = true
      if (plans[q.id].picks.length === 0) plans[q.id].picks = [optionText(q.opcje[0])]
    }
  }

  const quirks = {
    light: chance(LIGHT_RATIO),
    reloadAfterFirst: chance(0.2), // reload the page after filling the first section
    goBackOnce: chance(0.15), // from the second section: back, then forward again
    tryFinishEarly: chance(0.2),
    // After rating Friday, change the Friday answer to "nie" (and maybe back).
    toggleFriday: attendance[0] === 'tak' ? (chance(0.1) ? 'off' : chance(0.1) ? 'off-on' : null) : null,
    // Sees the summary on the final screen, goes back, fixes one answer and
    // finishes again: the sheet must show ONE person who changed their mind.
    fixAfterSend: Boolean(FIX_TEXT) && chance(0.1),
  }

  return { nr, marker, name, attendance, plans, quirks }
}

/* ------------------------------------------------------ expected outcome --- */

/** What the sheet must contain for this persona — independent of the app's code. */
function expectedRow(p) {
  const fridayFinal = p.quirks.toggleFriday === 'off' ? 'nie' : p.attendance[0]
  const answers = { 'obecnosc-piatek': fridayFinal, 'obecnosc-sobota': p.attendance[1] }
  const visibleSection = (s) => !s.pokaz_jesli || answers[s.pokaz_jesli.pytanie] === s.pokaz_jesli.rowne
  const out = {}
  for (const s of sections) {
    const shown = visibleSection(s)
    for (const q of s.pytania) {
      const plan = p.plans[q.id]
      if (s === START) {
        out[q.id] = answers[q.id] === 'tak' ? 'Tak' : 'Nie'
        continue
      }
      if (q.typ === 'ranking') {
        const parentAbsent = Boolean(q.ukryj_jesli) && p.plans[q.ukryj_jesli.pytanie]?.value === 'absent'
        const picks = shown && !parentAbsent ? plan.picks : []
        for (let i = 1; i <= places(q); i++) out[`${q.id}::${i}`] = picks[i - 1] ?? ''
        continue
      }
      let value = ''
      let comment = ''
      if (shown) {
        if (plan.kind === 'skala') {
          value = plan.value === 'absent' ? absentLabel(q) : String(plan.value)
          comment = plan.value === 'absent' ? '' : (plan.comment ?? '')
        } else if (plan.kind === 'tak_nie') {
          value = plan.value === 'tak' ? 'Tak' : 'Nie'
          comment = plan.comment ?? ''
        } else if (plan.kind === 'tekst') {
          value = plan.value ?? ''
        }
      }
      out[q.id] = value
      if (q.komentarz) out[`${q.id}::komentarz`] = comment
    }
  }
  if (p.quirks.fixAfterSend) out[FIX_TEXT.id] = `Poprawka po wysłaniu ${p.marker}`
  return {
    'Kto wypełnił': p.name ? p.name.trim() : 'anonimowo',
    'Wersja ankiety': VERSION,
    ...out,
  }
}

/** Which sections this persona sees, in order, given the final attendance answers. */
function visibleSections(p) {
  const fridayFinal = p.quirks.toggleFriday === 'off' ? 'nie' : p.attendance[0]
  const answers = { 'obecnosc-piatek': fridayFinal, 'obecnosc-sobota': p.attendance[1] }
  return sections.slice(1).filter((s) => !s.pokaz_jesli || answers[s.pokaz_jesli.pytanie] === s.pokaz_jesli.rowne)
}

/* ------------------------------------------------------------- browser --- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const THANKS = 'Dziękujemy'
const INTRO_TITLE = START.tytul

/**
 * Waits until exactly one screen heading is on the page and it satisfies
 * `want` ({ is } or { not }). The app animates sections out before the next
 * one comes in, so right after a tap the OLD heading is still there — a plain
 * "wait for h2" would read the screen that is leaving.
 */
async function waitForScreen(page, want = {}, timeout = 20000) {
  const handle = await page.waitForFunction(
    (want) => {
      const hs = document.querySelectorAll('h2')
      if (hs.length !== 1) return false
      const t = hs[0].textContent.trim()
      if (want.is != null && t !== want.is) return false
      if (want.not != null && t === want.not) return false
      return t
    },
    want,
    { timeout },
  )
  return handle.jsonValue()
}

async function gone(locator, timeout = 10000) {
  return locator.waitFor({ state: 'detached', timeout }).then(() => true).catch(() => false)
}

async function setScale(card, value) {
  const slider = card.locator('[role="slider"]')
  await slider.press('Home')
  for (let i = 1; i < value; i++) await slider.press('ArrowRight')
  const now = await slider.getAttribute('aria-valuenow')
  if (now !== String(value)) throw new Error(`suwak pokazuje ${now}, oczekiwano ${value}`)
}

async function openComment(card, text) {
  await card.getByRole('button', { name: 'Dodaj komentarz' }).click()
  await card.locator('textarea').fill(text)
}

/** Answers one question card according to its plan; records what was checked. */
async function answerCard(page, id, p, checks) {
  const card = page.locator(`#pytanie-${id}`)
  const q = byId[id]
  const plan = p.plans[id]
  if (!plan) return

  if ((await card.count()) === 0) {
    // The only card allowed to be missing is one whose own condition hides it.
    const hidden = Boolean(q.ukryj_jesli) && p.plans[q.ukryj_jesli.pytanie]?.value === 'absent'
    checks.push(['karta znika tylko wtedy, gdy ukrywa ją nieobecność na debacie', hidden, id])
    return
  }

  if (plan.kind === 'skala') {
    if (plan.value === 'absent') {
      if (plan.commentThenAbsent) await openComment(card, 'ten komentarz ma zniknąć')
      // A ranking tied to this debate is picked BEFORE the absence, so the
      // absence has something to cancel.
      const kto = allQuestions.find((x) => x.ukryj_jesli?.pytanie === id)
      if (kto && p.plans[kto.id]?.pickThenAbsent) {
        const ktoCard = page.locator(`#pytanie-${kto.id}`)
        for (const name of p.plans[kto.id].picks) await ktoCard.locator('button', { hasText: name }).first().click()
        checks.push(['miejsca przyznane przed oznaczeniem nieobecności', (await ktoCard.locator('button[aria-pressed="true"]').count()) === p.plans[kto.id].picks.length, kto.id])
      }
      await card.getByRole('button', { name: absentLabel(q), exact: true }).click()
      if (plan.commentThenAbsent) checks.push(['komentarz znika po „nie brałem udziału”', await gone(card.locator('textarea')), id])
      checks.push(['bez przycisku komentarza przy nieobecności', await gone(card.getByRole('button', { name: 'Dodaj komentarz' })), id])
      if (kto) checks.push(['pytanie „kto wniósł najwięcej” znika po nieobecności', await gone(page.locator(`#pytanie-${kto.id}`)), kto.id])
    } else {
      await setScale(card, plan.value)
      if (plan.comment) await openComment(card, plan.comment)
    }
  } else if (plan.kind === 'tak_nie') {
    await card.getByRole('button', { name: plan.value === 'tak' ? 'Tak' : 'Nie', exact: true }).click()
    if (plan.value === 'nie' && q.komentarz) {
      const ta = card.locator('textarea')
      await ta.waitFor({ timeout: 4000 })
      checks.push(['„Nie” samo otwiera pole komentarza z właściwą podpowiedzią', (await ta.getAttribute('placeholder')) === 'Powiedz nam, co moglibyśmy zrobić lepiej', id])
      if (plan.comment) await ta.fill(plan.comment)
    } else if (plan.comment) {
      await openComment(card, plan.comment)
    }
  } else if (plan.kind === 'ranking') {
    if (plan.pickThenAbsent) return // handled from the debate card
    const chip = (name) => card.locator('button', { hasText: name }).first()
    if (plan.clearFirst) {
      await chip(plan.picks[0]).click()
      await card.getByRole('button', { name: 'Wyczyść' }).click()
      checks.push(['„Wyczyść” zdejmuje wszystkie miejsca', (await card.locator('button[aria-pressed="true"]').count()) === 0, id])
    }
    if (plan.mistake) {
      // The wrong person first, the intended ones after, then the mistake is
      // noticed and removed. When every place is taken by then, the last
      // intended pick has to wait for the removal, exactly as it does for a
      // real thumb: the remaining chips are greyed out until a place frees.
      await chip(plan.mistake).click()
      const before = plan.picks.length >= places(q) ? plan.picks.slice(0, -1) : plan.picks
      for (const name of before) await chip(name).click()
      await chip(plan.mistake).click() // un-pick
      checks.push(['cofnięte błędne dotknięcie nie zostawia luki w numeracji', (await chip(plan.picks[0]).getAttribute('aria-label')) === `${plan.picks[0]}, miejsce 1`, id])
      for (const name of plan.picks.slice(before.length)) await chip(name).click()
    } else {
      for (const name of plan.picks) await chip(name).click()
    }
    for (let i = 0; i < plan.picks.length; i++) {
      const label = await chip(plan.picks[i]).getAttribute('aria-label')
      checks.push([`miejsce ${i + 1} przypisane właściwej osobie`, label === `${plan.picks[i]}, miejsce ${i + 1}`, `${id}: ${label}`])
    }
    if (plan.picks.length >= places(q)) {
      const inert = await card.locator('button[aria-pressed="false"][disabled]').count()
      const free = await card.locator('button[aria-pressed="false"]:not([disabled])').count()
      checks.push(['po zapełnieniu miejsc reszta osób jest nieaktywna', inert > 0 && free === 0, id])
    }
  } else if (plan.kind === 'tekst') {
    if (plan.value != null) await card.locator('textarea').fill(plan.value)
  }
}

async function currentCardIds(page) {
  return page.locator('[id^="pytanie-"]').evaluateAll((els) => els.map((e) => e.id.replace('pytanie-', '')))
}

async function answerSection(page, p, checks) {
  await page.locator('[id^="pytanie-"]').first().waitFor()
  const ids = await currentCardIds(page)
  for (const id of ids) await answerCard(page, id, p, checks)
  return ids
}

/** A sample rated question on the current screen, to verify persistence. */
function sampleRated(ids, p) {
  return ids.find((id) => p.plans[id]?.kind === 'skala' && p.plans[id].value !== 'absent')
}

async function sliderValue(page, id) {
  return page.locator(`#pytanie-${id}`).locator('[role="slider"]').getAttribute('aria-valuenow')
}

async function runPersona(p, browser) {
  const started = Date.now()
  const checks = []
  const errors = []
  let retries = 0
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'pl-PL',
    ...(USER_AGENT ? { userAgent: USER_AGENT } : {}),
  })
  const page = await context.newPage()
  page.setDefaultTimeout(30000)
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`)
  })
  // The console line for a failed request has no address in it; this one does.
  page.on('requestfailed', (r) => errors.push(`request: ${r.failure()?.errorText ?? '?'} ${r.url().slice(0, 120)}`))

  try {
    await page.goto(`${BASE}/${p.quirks.light ? '?lekki=1' : ''}`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'Rozpocznij' }).click()
    await waitForScreen(page, { is: INTRO_TITLE })

    // --- welcome screen: identity + attendance ---
    const kontynuuj = page.getByRole('button', { name: 'Kontynuuj' })
    if (p.quirks.tryFinishEarly) {
      checks.push(['„Kontynuuj” nieaktywne, zanim wybrano imię lub anonimowość', await kontynuuj.isDisabled(), 'intro'])
    }
    if (p.name) {
      await page.getByRole('button', { name: 'Tak, przedstawię się' }).click()
      if (p.quirks.tryFinishEarly) {
        checks.push(['„Kontynuuj” nieaktywne, gdy imię jest puste', await kontynuuj.isDisabled(), 'intro'])
      }
      await page.locator('#imie-nazwisko').fill(p.name)
    } else {
      await page.getByRole('button', { name: 'Nie, wypełniam anonimowo' }).click()
    }
    if (p.quirks.tryFinishEarly) {
      // Continue without the attendance answers: must be refused, with a message.
      await kontynuuj.click()
      const msg = page.getByText('Uzupełnij jeszcze')
      checks.push(['przejście dalej bez odpowiedzi o obecności jest zatrzymane', await msg.waitFor({ timeout: 4000 }).then(() => true).catch(() => false), 'intro'])
      checks.push(['nadal na ekranie startowym', (await waitForScreen(page, {})) === INTRO_TITLE, 'intro'])
    }
    const setAttendance = async (fri, sat) => {
      await page.locator('#pytanie-obecnosc-piatek').getByRole('button', { name: fri === 'tak' ? 'Tak' : 'Nie', exact: true }).click()
      await page.locator('#pytanie-obecnosc-sobota').getByRole('button', { name: sat === 'tak' ? 'Tak' : 'Nie', exact: true }).click()
    }
    await setAttendance(p.attendance[0], p.attendance[1])
    await kontynuuj.click()
    let heading = await waitForScreen(page, { not: INTRO_TITLE })

    const expectedTitles = visibleSections(p).map((s) => s.tytul)
    const answered = new Set()
    let visited = 0
    let fridayToggled = false
    let wentBack = false

    // --- sections ---
    for (let guard = 0; guard < 12; guard++) {
      if (heading === THANKS) break
      let ids = []
      if (!answered.has(heading)) {
        ids = await answerSection(page, p, checks)
        answered.add(heading)
      }
      visited++

      if (p.quirks.reloadAfterFirst && visited === 1) {
        await sleep(800) // the app writes to storage 400 ms after the last change
        await page.reload({ waitUntil: 'domcontentloaded' })
        const after = await waitForScreen(page, {})
        checks.push(['po odświeżeniu wraca ta sama sekcja', after === heading, `${heading} → ${after}`])
        await page.locator('[id^="pytanie-"]').first().waitFor()
        const sample = sampleRated(ids, p)
        if (sample) checks.push(['po odświeżeniu ocena jest na swoim miejscu', (await sliderValue(page, sample)) === String(p.plans[sample].value), sample])
      }

      if (p.quirks.toggleFriday && !fridayToggled && heading === sections[1].tytul) {
        fridayToggled = true
        await page.getByRole('button', { name: `Przejdź do: ${INTRO_TITLE}` }).click()
        await waitForScreen(page, { is: INTRO_TITLE })
        await page.locator('#pytanie-obecnosc-piatek').getByRole('button', { name: 'Nie', exact: true }).click()
        if (p.quirks.toggleFriday === 'off-on') {
          await page.locator('#pytanie-obecnosc-piatek').getByRole('button', { name: 'Tak', exact: true }).click()
        }
        await kontynuuj.click()
        const back = await waitForScreen(page, { not: INTRO_TITLE })
        if (p.quirks.toggleFriday === 'off') {
          checks.push(['po zmianie piątku na „Nie” sekcja otwarcia znika', back !== sections[1].tytul, back])
        } else {
          checks.push(['po powrocie do „Tak” sekcja otwarcia wraca', back === sections[1].tytul, back])
          const sample = sampleRated(ids, p)
          if (sample) checks.push(['oceny piątku przetrwały zmianę zdania', (await sliderValue(page, sample)) === String(p.plans[sample].value), sample])
        }
        heading = back
        continue // answer whatever screen we are on now (or move on if already done)
      }

      // Only from a section that has one before it: "Wstecz" on the first
      // section leads to the welcome screen, which has no "Dalej".
      if (p.quirks.goBackOnce && !wentBack && expectedTitles.indexOf(heading) > 0) {
        wentBack = true
        await page.getByRole('button', { name: 'Wstecz' }).click()
        const prev = await waitForScreen(page, { not: heading })
        await page.getByRole('button', { name: 'Dalej' }).click()
        const again = await waitForScreen(page, { not: prev })
        checks.push(['„Wstecz” i „Dalej” wracają do tej samej sekcji', again === heading, `${heading} / ${prev} / ${again}`])
      }

      const finish = page.getByRole('button', { name: 'Zakończ ankietę' })
      if ((await finish.count()) > 0) {
        checks.push(['„Zakończ ankietę” pojawia się dopiero na ostatniej sekcji', heading === expectedTitles[expectedTitles.length - 1], heading])
        if (p.quirks.tryFinishEarly) {
          // Blank the required answer, try to finish, expect a refusal.
          const req = page.locator(`#pytanie-${REQUIRED_TEXT.id} textarea`)
          await req.fill('')
          await finish.click()
          const msg = page.getByText('Uzupełnij jeszcze')
          checks.push(['zakończenie bez pytania wymaganego jest zatrzymane', await msg.waitFor({ timeout: 4000 }).then(() => true).catch(() => false), 'required'])
          checks.push(['podświetlona jest brakująca karta', (await page.locator(`#pytanie-${REQUIRED_TEXT.id}`).getAttribute('class'))?.includes('border-[#C9A14A]') ?? false, 'required'])
          await req.fill(p.plans[REQUIRED_TEXT.id].value)
        }
        await finish.click()
        heading = await waitForScreen(page, { is: THANKS })
        break
      }
      await page.getByRole('button', { name: 'Dalej' }).click()
      heading = await waitForScreen(page, { not: heading })
    }
    checks.push(['odwiedzone sekcje to dokładnie te, które wynikają z obecności', JSON.stringify([...answered]) === JSON.stringify(expectedTitles) || (p.quirks.toggleFriday === 'off' && expectedTitles.every((t) => answered.has(t))), `${[...answered].join(' | ')} vs ${expectedTitles.join(' | ')}`])

    // --- thank-you screen ---
    const sent = page.getByText('Wysłano do organizatora')
    const retry = page.getByRole('button', { name: 'Spróbuj teraz' })
    const errorNote = page.getByText('Zostaw tę stronę otwartą')
    let sawError = false
    const waitForSent = async () => {
      const t0 = Date.now()
      const deadline = t0 + 240000
      while (Date.now() < deadline) {
        if ((await sent.count()) > 0) return Date.now() - t0
        if ((await errorNote.count()) > 0) sawError = true
        if (MANUAL_RETRY && (await retry.count()) > 0) {
          retries++
          await retry.click()
          await sleep(1500)
          continue
        }
        await sleep(250)
      }
      return -1
    }
    const sentAfter = await waitForSent()
    checks.push(['potwierdzenie „Wysłano do organizatora”', sentAfter >= 0, retries ? `${retries} ponowień` : `${(sentAfter / 1000).toFixed(1)} s`])
    if (FAIL_NEXT > 0 && !MANUAL_RETRY) {
      checks.push(['po nieudanej wysyłce pokazuje się uczciwy komunikat (zostaw stronę otwartą)', sawError, ''])
      checks.push(['aplikacja sama ponawia wysyłkę bez dotykania ekranu', sentAfter >= 0 && retries === 0, `${(sentAfter / 1000).toFixed(1)} s`])
    }
    const cleared = await page
      .waitForFunction(() => !localStorage.getItem('ctn-ankieta-mlodzi-v1') && !localStorage.getItem('ctn-kolejka-wysylki-v1'), null, { timeout: 10000 })
      .then(() => true)
      .catch(() => false)
    checks.push(['po potwierdzonej wysyłce pamięć telefonu jest czysta', cleared, 'storage'])
    const bodyText = await page.evaluate(() => document.body.innerText)
    checks.push(['ekran końcowy nie pokazuje imienia', !p.name || !bodyText.includes(p.name.trim()), 'name'])
    const summaryCount = Number((bodyText.match(/TWOJE ODPOWIEDZI\s*(\d+)/i) || [])[1] || 0)
    checks.push(['podsumowanie odpowiedzi na ekranie końcowym', summaryCount > 0, String(summaryCount)])

    if (p.quirks.fixAfterSend) {
      // The phone's back gesture from "Thank you" returns to the last section.
      await page.goBack()
      const back = await waitForScreen(page, { not: THANKS })
      checks.push(['„wstecz” z ekranu końcowego wraca do ostatniej sekcji', back === expectedTitles[expectedTitles.length - 1], back])
      await page.locator(`#pytanie-${FIX_TEXT.id} textarea`).fill(`Poprawka po wysłaniu ${p.marker}`)
      await page.getByRole('button', { name: 'Zakończ ankietę' }).click()
      await waitForScreen(page, { is: THANKS })
      const again = await waitForSent()
      checks.push(['poprawka po wysłaniu też dochodzi do organizatora', again >= 0, `${(again / 1000).toFixed(1)} s`])
    }

    checks.push(['konsola przeglądarki bez błędów', errors.length === 0, errors.slice(0, 3).join(' | ')])

    return { nr: p.nr, ok: checks.every((c) => c[1]), checks, errors, retries, ms: Date.now() - started }
  } catch (err) {
    let shot = null
    try {
      shot = join(ROOT, `symulacja-blad-${p.marker.slice(1)}.png`)
      await page.screenshot({ path: shot, fullPage: true })
    } catch {
      shot = null
    }
    return { nr: p.nr, ok: false, checks, errors: [...errors, `fatal: ${err.message.split('\n')[0]}${shot ? ` (zrzut: ${shot})` : ''}`], retries, ms: Date.now() - started }
  } finally {
    await context.close().catch(() => {})
  }
}

/* -------------------------------------------------------- verification --- */

async function verifyAgainstMock(personas) {
  const res = await fetch(`${MOCK}/rows`)
  const sheet = await res.json()
  const col = (id) => sheet.headers.indexOf(id)
  const problems = []
  const markerCol = col(REQUIRED_TEXT.id)
  for (const p of personas) {
    const expected = expectedRow(p)
    const rows = sheet.rows.filter((r) => String(r[markerCol] ?? '').includes(p.marker))
    if (rows.length === 0) {
      problems.push({ nr: p.nr, missing: 'brak wiersza w arkuszu' })
      continue
    }
    const diffs = []
    const wantRows = p.quirks.fixAfterSend ? 2 : 1
    if (rows.length !== wantRows) diffs.push({ key: '(wiersze)', want: wantRows, got: rows.length })
    if (p.quirks.fixAfterSend && rows.length === 2) {
      // One person, two rows: the first superseded, the second clean.
      const kto = col('Kto wypełnił')
      const first = String(rows[0][kto] ?? '')
      const second = String(rows[1][kto] ?? '')
      if (!first.startsWith('[nieaktualne] ')) diffs.push({ key: '(pierwszy wiersz)', want: '[nieaktualne] …', got: first })
      if (second.startsWith('[nieaktualne]')) diffs.push({ key: '(drugi wiersz)', want: 'bez dopisku', got: second })
    }
    const row = rows[rows.length - 1]
    for (const [key, want] of Object.entries(expected)) {
      const c = col(key)
      const got = c === -1 ? '(brak kolumny)' : typeof row[c] === 'object' && row[c] ? `FORMUŁA ${JSON.stringify(row[c])}` : String(row[c] ?? '')
      if (got !== String(want)) diffs.push({ key, want, got })
    }
    if (diffs.length) problems.push({ nr: p.nr, diffs })
  }
  // Column layout: every key the app sends, in survey order, each with its label.
  const expectedOrder = []
  for (const s of sections) {
    for (const q of s.pytania) {
      if (q.typ === 'ranking') for (let i = 1; i <= places(q); i++) expectedOrder.push(`${q.id}::${i}`)
      else expectedOrder.push(q.id)
      if (q.komentarz) expectedOrder.push(`${q.id}::komentarz`)
    }
  }
  const layoutOk = JSON.stringify(sheet.headers.slice(4)) === JSON.stringify(expectedOrder)
  const labelsOk = sheet.labels.length === sheet.headers.length && sheet.labels.every((l) => typeof l === 'string' && l !== '')
  const formulas = sheet.rows.flat().filter((v) => typeof v === 'object' && v).length
  return { problems, layoutOk, labelsOk, formulas, rows: sheet.rows.length, columns: sheet.headers.length, stats: sheet.stats, scriptErrors: sheet.consoleErrors }
}

/* ----------------------------------------------------------------- main --- */

const rnd = mulberry32(SEED)
const everyone = Array.from({ length: USERS }, (_, i) => makePersona(i + 1, rnd))
/** --only 3,17 reruns just those people from the same seed, for chasing one failure. */
const only = args.only ? new Set(args.only.split(',').map(Number)) : null
const personas = only ? everyone.filter((p) => only.has(p.nr)) : everyone
if (args.dry === 'true') {
  for (const p of personas) console.log(JSON.stringify({ nr: p.nr, name: p.name, attendance: p.attendance, quirks: p.quirks, plans: p.plans }))
  process.exit(0)
}

console.log(`\n=== Symulacja: ${USERS} osób, ${CONCURRENCY} naraz, cel: ${TARGET} (${BASE}) ===\n`)
if (TARGET === 'mock') {
  const r = await fetch(`${MOCK}/reset`).then((x) => x.json()).catch(() => null)
  if (!r?.ok) {
    console.error(`Mock-serwer nie odpowiada pod ${MOCK}. Uruchom: node scripts/mock-sheet-server.mjs`)
    process.exit(2)
  }
  await fetch(`${MOCK}/control?failNext=${FAIL_NEXT}&mode=html`)
}

const browser = await chromium.launch({ headless: !HEADFUL })
const results = []
let next = 0
const t0 = Date.now()
async function worker() {
  while (next < personas.length) {
    const p = personas[next++]
    const r = await runPersona(p, browser)
    results.push(r)
    const failed = r.checks.filter((c) => !c[1])
    console.log(
      `${r.ok ? 'OK  ' : 'BŁĄD'} ${p.marker} ${(r.ms / 1000).toFixed(1).padStart(5)}s  ${p.attendance.join('/')} ${p.name ? 'imię  ' : 'anonim'}${p.quirks.light ? '   ' : ' 3D'}` +
        (failed.length ? `  ← ${failed.map((c) => `${c[0]} [${c[2]}]`).join('; ')}` : '') +
        (r.errors.length ? `  ! ${r.errors[0].slice(0, 160)}` : ''),
    )
  }
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, personas.length) }, worker))
await browser.close()

const uiOk = results.filter((r) => r.ok).length
const totalChecks = results.reduce((s, r) => s + r.checks.length, 0)
const failedChecks = results.reduce((s, r) => s + r.checks.filter((c) => !c[1]).length, 0)
const retriesTotal = results.reduce((s, r) => s + r.retries, 0)
console.log(`\nPrzeglądarki: ${uiOk}/${personas.length} osób bez zastrzeżeń, ${totalChecks - failedChecks}/${totalChecks} sprawdzeń OK, ponowień wysyłki: ${retriesTotal}, czas ${((Date.now() - t0) / 1000).toFixed(0)} s`)

let sheetReport = null
if (TARGET === 'mock') {
  sheetReport = await verifyAgainstMock(personas)
  console.log(`Arkusz (mock): ${sheetReport.rows} wierszy, ${sheetReport.columns} kolumn; układ kolumn ${sheetReport.layoutOk ? 'OK' : 'ZŁY'}; nagłówki ${sheetReport.labelsOk ? 'OK' : 'ZŁE'}; komórek-formuł: ${sheetReport.formulas}; osób ze złymi komórkami: ${sheetReport.problems.length}`)
  for (const pr of sheetReport.problems.slice(0, 15)) {
    console.log(`  ${String(pr.nr).padStart(3, '0')}: ${pr.missing ?? pr.diffs.map((d) => `${d.key}: chciano „${String(d.want).slice(0, 40)}”, jest „${String(d.got).slice(0, 40)}”`).join('; ')}`)
  }
  if (sheetReport.scriptErrors.length) console.log('Błędy skryptu:', sheetReport.scriptErrors.slice(0, 5))
}

writeFileSync(
  OUT,
  JSON.stringify(
    { target: TARGET, base: BASE, users: USERS, concurrency: CONCURRENCY, seed: SEED, expected: personas.map((p) => ({ nr: p.nr, marker: p.marker, name: p.name, attendance: p.attendance, quirks: p.quirks, row: expectedRow(p) })), results, sheetReport },
    null,
    1,
  ),
)
console.log(`Raport: ${OUT}`)
const allOk = uiOk === personas.length && (!sheetReport || (sheetReport.problems.length === 0 && sheetReport.layoutOk && sheetReport.labelsOk && sheetReport.formulas === 0))
console.log(allOk ? '\nWSZYSTKO OK' : '\nSĄ BŁĘDY')
// Not process.exit(): on Windows that trips a libuv assertion while
// Playwright's pipes are still closing. The process ends on its own.
process.exitCode = allOk ? 0 : 1
