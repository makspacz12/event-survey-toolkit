/**
 * TEST OF 25 PATHS THROUGH THE SURVEY — submission to the real sheet.
 *
 * The survey has two branching questions (which days attended, and where at
 * 16:00), five question types, and a handful of special values. This script
 * walks through the combinations that could break, and sends them the way a
 * participant's phone would.
 *
 * Run:  npm run test:scenarios
 * Then: open the sheet and compare against the report printed at the end.
 */
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIR = join(__dirname, '..')

/* ---------------------------------------------------------- config --- */

function loadEnv() {
  const file = join(DIR, '.env.local')
  if (!existsSync(file)) return {}
  const env = {}
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const c = line.trim()
    if (!c || c.startsWith('#')) continue
    const i = c.indexOf('=')
    if (i > -1) env[c.slice(0, i).trim()] = c.slice(i + 1).trim()
  }
  return env
}

const env = loadEnv()
const URL = env.VITE_ARKUSZ_URL
const TOKEN = env.VITE_ARKUSZ_TOKEN

if (!URL || !TOKEN) {
  console.error('ERROR: missing VITE_ARKUSZ_URL or VITE_ARKUSZ_TOKEN in .env.local')
  process.exit(1)
}

const survey = JSON.parse(
  readFileSync(join(DIR, 'src', 'data', 'ankieta.json'), 'utf8'),
)

/* --------------------------------------- which section is visible when --- */

function isVisible(section, answers) {
  const c = section.pokaz_jesli
  if (!c) return true
  const value = answers[c.pytanie]
  if (c.rowne != null) return value === c.rowne
  if (c.zawiera != null)
    return typeof value === 'string' && value.includes(c.zawiera)
  return true
}

const allLabels = {}
for (const s of survey.sekcje)
  for (const p of s.pytania) allLabels[p.id] = p.tresc

function fill(base, strategy) {
  const answers = { ...base }
  for (const section of survey.sekcje) {
    if (!isVisible(section, answers)) continue
    for (const p of section.pytania) {
      if (answers[p.id] !== undefined) continue
      const w = strategy(p, section)
      if (w !== undefined) answers[p.id] = w
    }
  }
  return answers
}

const options = (p) =>
  (p.opcje || []).map((o) => (typeof o === 'string' ? o : o.tekst))
const firstOption = (p) => options(p)[0]
const lastOption = (p) => options(p)[options(p).length - 1]

/** Deterministic "random" pick — the same id always gives the same value. */
function seed(text) {
  let s = 0
  for (let i = 0; i < text.length; i++) s = (s * 31 + text.charCodeAt(i)) % 9973
  return s
}

/* -------------- filling strategies (mirroring participant behaviors) --- */

const minimal = (p) => (p.wymagane ? String(p.min ?? 1) : undefined)

/** Realistic: different ratings for different questions, like a real person. */
const realistic = (p) => {
  const z = seed(p.id)
  if (p.typ === 'skala') {
    const min = p.min ?? 1
    const max = p.max ?? 10
    // Distribution skewed upward, like in real surveys.
    const range = max - min
    return String(min + Math.round(range * (0.55 + (z % 45) / 100)))
  }
  if (p.typ === 'tak_nie') return z % 3 === 0 ? 'Nie' : 'Tak'
  if (p.typ === 'jeden_wybor') {
    const list = options(p)
    return list[z % list.length]
  }
  if (p.typ === 'wiele_wyborow') {
    const list = options(p)
    return z % 2 === 0 ? list.join('; ') : list[z % list.length]
  }
  if (p.typ === 'tekst') {
    const variants = [
      'Świetna organizacja, zabrakło tylko przerw między blokami.',
      'Najbardziej zapamiętam rozmowę przy stoliku z mentorem.',
      'Merytorycznie mocne, logistycznie do dopracowania.',
      'Poziom prelegentów wyższy niż się spodziewałem.',
      'Dużo inspiracji, mało czasu na networking.',
    ]
    return variants[z % variants.length]
  }
  return undefined
}

const average = (p) => {
  if (p.typ === 'skala') return String(Math.round(((p.min ?? 1) + (p.max ?? 10)) / 2))
  if (p.typ === 'tak_nie') return 'Tak'
  if (p.typ === 'jeden_wybor') return firstOption(p)
  if (p.typ === 'wiele_wyborow') return firstOption(p)
  if (p.typ === 'tekst') return 'Odpowiedź testowa.'
  return undefined
}

const lowest = (p) => {
  if (p.typ === 'skala') return String(p.min ?? 1)
  if (p.typ === 'tak_nie') return 'Nie'
  if (p.typ === 'jeden_wybor') return lastOption(p)
  if (p.typ === 'wiele_wyborow') return lastOption(p)
  if (p.typ === 'tekst') return 'Wszystko do poprawy.'
  return undefined
}

const highest = (p) => {
  if (p.typ === 'skala') return String(p.max ?? 10)
  if (p.typ === 'tak_nie') return 'Tak'
  if (p.typ === 'jeden_wybor') return firstOption(p)
  if (p.typ === 'wiele_wyborow') return options(p).join('; ')
  if (p.typ === 'tekst') return 'Rewelacja od początku do końca.'
  return undefined
}

const absent = (p) => {
  if (p.typ === 'skala') return p.nieobecnosc ? 'nie było mnie' : String(p.min ?? 1)
  if (p.typ === 'tekst') return ''
  return average(p)
}

/** Ratings only, no free-text answers — a typical participant in a hurry. */
const noText = (p) => (p.typ === 'tekst' ? '' : realistic(p))

/** Free-text only, ratings skipped — someone who'd rather write than click. */
const textOnly = (p) => {
  if (p.typ === 'tekst') return realistic(p)
  return p.wymagane ? String(p.min ?? 1) : ''
}

const HARD_TEXT = [
  'Cudzysłowy: "polskie" i „typograficzne”, apostrof: O\'Brien.',
  'Średnik; przecinek, tabulator\ti nowa linia:',
  'Druga linia tekstu.',
  'Znaki: <tag> & ampersand, =FORMUŁA(), 100% i 5+5.',
  'Polskie: zażółć gęślą jaźń ĄĆĘŁŃÓŚŹŻ.',
].join('\n')

const hard = (p) => (p.typ === 'tekst' ? HARD_TEXT : realistic(p))

const long = (p) =>
  p.typ === 'tekst'
    ? 'Bardzo długa wypowiedź uczestnika. '.repeat(120).trim()
    : realistic(p)

/** Strings sheets like to turn into numbers, dates, or formulas. */
const AUTO_CONVERT = [
  '0001',
  '+48 500 100 200',
  '2026-10-16',
  '1/2',
  '=SUMA(A1:A9)',
  '-5',
  '3,14',
  '1E5',
  '00:30',
  '#REF!',
].join(' | ')

const conversions = (p) => (p.typ === 'tekst' ? AUTO_CONVERT : realistic(p))

const HTML = '<script>alert("test")</script> <b>pogrubienie</b> <a href="#">link</a>'
const html = (p) => (p.typ === 'tekst' ? HTML : realistic(p))

const EMOJI = 'Super wydarzenie 🎉👏 Robot 🤖 zrobił wrażenie. Ocena: ⭐⭐⭐⭐⭐'
const emoji = (p) => (p.typ === 'tekst' ? EMOJI : realistic(p))

const short = (p) => {
  if (p.typ === 'tekst') return '.'
  return realistic(p)
}

const empty = (p) => (p.wymagane ? String(p.max ?? 10) : '')

/* ----------------------------------------------------- 25 scenarios --- */

const DAY_FRI = 'Piątek (16.10)'
const DAY_SAT = 'Sobota (17.10)'
const BOTH_DAYS = `${DAY_FRI}; ${DAY_SAT}`
const FINAL = 'Finał konkursu (Sala Konwersatorium)'
const DEBATE3 = 'III debata o geopolityce (Sala Petrus)'
const NOT_THERE = 'Nie było mnie wtedy'

const scenarios = [
  // --- branches ------------------------------------------------------
  { nr: 1, nazwa: 'Tylko piątek, anonimowo, minimum', sprawdza: 'sekcje sobotnie puste',
    kto: 'anonimowo', baza: { 'obecnosc-dni': DAY_FRI }, strategia: minimal },
  { nr: 2, nazwa: 'Tylko sobota + finał, z imieniem', sprawdza: 'gałąź finału, piątek pusty',
    kto: 'Anna Kowalska', baza: { 'obecnosc-dni': DAY_SAT, 'sciezka-1600': FINAL }, strategia: realistic },
  { nr: 3, nazwa: 'Tylko sobota + III debata', sprawdza: 'gałąź geopolityczna',
    kto: 'anonimowo', baza: { 'obecnosc-dni': DAY_SAT, 'sciezka-1600': DEBATE3 }, strategia: realistic },
  { nr: 4, nazwa: 'Oba dni + finał', sprawdza: 'najszersza ścieżka',
    kto: 'Jan Nowak', baza: { 'obecnosc-dni': BOTH_DAYS, 'sciezka-1600': FINAL }, strategia: realistic },
  { nr: 5, nazwa: 'Oba dni + III debata', sprawdza: 'komplet, druga gałąź',
    kto: 'anonimowo', baza: { 'obecnosc-dni': BOTH_DAYS, 'sciezka-1600': DEBATE3 }, strategia: realistic },
  { nr: 6, nazwa: 'Oba dni, o 16:00 nieobecny', sprawdza: 'obie gałęzie 16:00 puste',
    kto: 'anonimowo', baza: { 'obecnosc-dni': BOTH_DAYS, 'sciezka-1600': NOT_THERE }, strategia: realistic },
  { nr: 7, nazwa: 'Tylko piątek, ale zaznaczony finał', sprawdza: 'sprzeczność logiczna: finał był w sobotę',
    kto: 'anonimowo', baza: { 'obecnosc-dni': DAY_FRI, 'sciezka-1600': FINAL }, strategia: realistic },
  { nr: 8, nazwa: 'Oba dni, pytanie o 16:00 pominięte', sprawdza: 'brak odpowiedzi w pytaniu nieobowiązkowym',
    kto: 'anonimowo', baza: { 'obecnosc-dni': BOTH_DAYS }, strategia: realistic },

  // --- extreme values ---------------------------------------------------
  { nr: 9, nazwa: 'Same najniższe oceny, NPS = 0', sprawdza: 'ZERO nie może zniknąć',
    kto: 'anonimowo', baza: { 'obecnosc-dni': BOTH_DAYS, 'sciezka-1600': FINAL, nps: '0' }, strategia: lowest },
  { nr: 10, nazwa: 'Same najwyższe, wszystkie opcje', sprawdza: 'wiele wartości w jednej komórce',
    kto: 'Maria Wiśniewska', baza: { 'obecnosc-dni': BOTH_DAYS, 'sciezka-1600': FINAL, nps: '10' }, strategia: highest },
  { nr: 11, nazwa: 'Wszędzie „nie było mnie”', sprawdza: 'wartość specjalna zamiast liczby',
    kto: 'anonimowo', baza: { 'obecnosc-dni': BOTH_DAYS, 'sciezka-1600': NOT_THERE }, strategia: absent },
  { nr: 12, nazwa: 'NPS = 1 przy wysokich ocenach', sprawdza: 'niespójna, ale możliwa odpowiedź',
    kto: 'anonimowo', baza: { 'obecnosc-dni': BOTH_DAYS, 'sciezka-1600': FINAL, nps: '1' }, strategia: highest },

  // --- filling styles --------------------------------------------------
  { nr: 13, nazwa: 'Same oceny, zero wypowiedzi', sprawdza: 'puste kolumny tekstowe',
    kto: 'anonimowo', baza: { 'obecnosc-dni': BOTH_DAYS, 'sciezka-1600': FINAL }, strategia: noText },
  { nr: 14, nazwa: 'Same wypowiedzi, oceny pominięte', sprawdza: 'puste kolumny liczbowe',
    kto: 'Piotr Lewandowski', baza: { 'obecnosc-dni': BOTH_DAYS, 'sciezka-1600': DEBATE3 }, strategia: textOnly },
  { nr: 15, nazwa: 'Tylko wymagane, reszta pusta', sprawdza: 'ankieta wypełniona po łebkach',
    kto: 'anonimowo', baza: { 'obecnosc-dni': BOTH_DAYS, 'sciezka-1600': FINAL }, strategia: empty },
  { nr: 16, nazwa: 'Jednoznakowe odpowiedzi', sprawdza: 'kropka jako cała wypowiedź',
    kto: 'anonimowo', baza: { 'obecnosc-dni': DAY_SAT, 'sciezka-1600': FINAL }, strategia: short },

  // --- content dangerous for the sheet ------------------------------------
  { nr: 17, nazwa: 'Znaki specjalne i cudzysłowy', sprawdza: 'nowe linie, ĄĆĘŁŃÓŚŹŻ, =FORMUŁA()',
    kto: 'O\'Brien "Tester"', baza: { 'obecnosc-dni': DAY_SAT, 'sciezka-1600': DEBATE3 }, strategia: hard, dopisek: HARD_TEXT },
  { nr: 18, nazwa: 'Ciągi mylone z liczbami i datami', sprawdza: '0001, +48…, 2026-10-16, 1/2, =SUMA(), 1E5, #REF!',
    kto: 'anonimowo', baza: { 'obecnosc-dni': BOTH_DAYS, 'sciezka-1600': FINAL }, strategia: conversions, dopisek: AUTO_CONVERT },
  { nr: 19, nazwa: 'HTML i skrypt w treści', sprawdza: 'znaczniki mają zostać zwykłym tekstem',
    kto: 'anonimowo', baza: { 'obecnosc-dni': DAY_SAT, 'sciezka-1600': FINAL }, strategia: html, dopisek: HTML },
  { nr: 20, nazwa: 'Emoji w wypowiedziach', sprawdza: 'znaki spoza podstawowego zakresu',
    kto: 'Zofia 🌟 Testowa', baza: { 'obecnosc-dni': BOTH_DAYS, 'sciezka-1600': DEBATE3 }, strategia: emoji, dopisek: EMOJI },
  { nr: 21, nazwa: 'Bardzo długie wypowiedzi', sprawdza: 'około 3500 znaków w komórce',
    kto: 'anonimowo', baza: { 'obecnosc-dni': BOTH_DAYS, 'sciezka-1600': FINAL }, strategia: long },
  { nr: 22, nazwa: 'Bardzo długie imię i nazwisko', sprawdza: 'przepełnienie kolumny „Kto wypełnił”',
    kto: 'Katarzyna Maria Anna Kowalska-Nowakowska-Wiśniewska z Zakrzewa Wielkiego', baza: { 'obecnosc-dni': DAY_SAT, 'sciezka-1600': FINAL }, strategia: realistic },

  // --- resubmissions by the same person -------------------------------------
  { nr: 23, nazwa: 'Poprawka odpowiedzi (2. podejście)', sprawdza: 'scenariusz 2 dostaje [nieaktualne]',
    kto: 'Anna Kowalska (poprawka 1)', baza: { 'obecnosc-dni': DAY_SAT, 'sciezka-1600': FINAL }, strategia: highest, sesjaZ: 2 },
  { nr: 24, nazwa: 'Kolejna poprawka (3. podejście)', sprawdza: 'dwa starsze wiersze oznaczone, najnowszy czysty',
    kto: 'Anna Kowalska (poprawka 2)', baza: { 'obecnosc-dni': BOTH_DAYS, 'sciezka-1600': DEBATE3 }, strategia: realistic, sesjaZ: 2 },
  { nr: 25, nazwa: 'Zmiana zdania: anonimowo → imię', sprawdza: 'ta sama sesja, inny sposób podpisu',
    kto: 'Tomasz Zieliński (był anonimowy)', baza: { 'obecnosc-dni': BOTH_DAYS, 'sciezka-1600': FINAL }, strategia: realistic, sesjaZ: 6 },
]

/* ---------------------------------------------------------- submission --- */

const sessions = {}
const results = []

console.log(`\n=== Test ${scenarios.length} ścieżek przez ankietę ===`)
console.log(`Cel: ${URL.slice(0, 55)}…\n`)

for (const s of scenarios) {
  const session = s.sesjaZ ? sessions[s.sesjaZ] : `test-${s.nr}-${Date.now()}`
  sessions[s.nr] = session

  const answers = fill(s.baza, s.strategia)

  // Comments: we send EVERY key, even empty ones — same as the app, so
  // columns are created in the order matching the survey.
  for (const section of survey.sekcje) {
    for (const p of section.pytania) {
      if (!p.komentarz) continue
      const filled =
        isVisible(section, answers) &&
        answers[p.id] !== undefined &&
        answers[p.id] !== ''
      answers[`${p.id}::komentarz`] = filled
        ? `Komentarz ze ścieżki ${s.nr}.`
        : ''
    }
  }
  answers['koniec-dopisek'] = s.dopisek ?? ''

  const labels = { ...allLabels }
  for (const key of Object.keys(answers)) {
    if (key.endsWith('::komentarz')) {
      const base = key.replace('::komentarz', '')
      labels[key] = `${allLabels[base] || base} [komentarz]`
    }
  }
  labels['koniec-dopisek'] = 'Dodatkowy komentarz na koniec'

  const payload = {
    token: TOKEN,
    sesja: session,
    kto: s.kto,
    wersja: `test-${s.nr}`,
    pulapka: '',
    odpowiedzi: answers,
    etykiety: labels,
  }

  const filledCount = Object.values(answers).filter(
    (v) => v !== '' && v !== undefined,
  ).length

  process.stdout.write(`${String(s.nr).padStart(2)}. ${s.nazwa.padEnd(42)} `)

  try {
    const resp = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
    })
    const text = await resp.text()
    let ok = false
    try {
      ok = JSON.parse(text).ok === true
    } catch {
      ok = false
    }
    console.log(ok ? `OK  (${String(filledCount).padStart(2)} pól)` : `BŁĄD: ${text.slice(0, 50)}`)
    results.push({ ...s, ok, filledCount })
  } catch (err) {
    console.log(`BŁĄD sieci: ${err.message}`)
    results.push({ ...s, ok: false, filledCount })
  }

  await new Promise((r) => setTimeout(r, 700))
}

/* -------------------------------------------------------------- summary --- */

const succeeded = results.filter((w) => w.ok).length
console.log(`\n=== Wysłano: ${succeeded} z ${scenarios.length} ===\n`)
console.log('CO SPRAWDZIĆ W ARKUSZU (kolumna „Wersja ankiety” = test-N):\n')
for (const w of results) {
  console.log(`${String(w.nr).padStart(2)}. ${w.nazwa}`)
  console.log(`    → ${w.sprawdza}`)
}
console.log('')

// process.exit() can cut off output that hasn't flushed yet. We just set the
// exit code and let Node finish normally once everything is printed.
process.exitCode = succeeded === scenarios.length ? 0 : 1
