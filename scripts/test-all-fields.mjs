/**
 * SENDS SUBMISSIONS IN WHICH EVERY FIELD HAS A VALUE.
 *
 * WHY THIS EXISTS
 * After changing the questions, there's one thing to check: does the answer
 * to question 30 really land in column 30, and not 29. A regular test won't
 * catch this, because empty fields look the same regardless of where they landed.
 *
 * That's why the first row is a "marker" row: every column gets the value
 * `K30 fn-final`, i.e. its own number and identifier. Just look at the
 * sheet — if column 30 has `K30`, everything is in place. A one-column shift
 * is visible immediately, no counting needed.
 *
 * The second row is realistic: ratings are numbers, Yes/No is Tak/Nie.
 * This one shows what the sheet will actually look like.
 *
 * Run:  npm run test-pol
 *
 * NOTE: appends rows to the REAL sheet. Both are marked in the "Kto
 * wypełnił" column as TEST — delete them before the survey goes out to
 * participants.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const DIR = dirname(fileURLToPath(import.meta.url))
const ROOT = join(DIR, '..')

/* ---------------------------------------------------------- config --- */

function fromEnv() {
  let content
  try {
    content = readFileSync(join(ROOT, '.env.local'), 'utf8')
  } catch {
    console.error('No .env.local file — don\'t know where to send to.')
    process.exit(1)
  }
  const get = (key) => {
    const m = content.match(new RegExp(`^${key}=(.*)$`, 'm'))
    return m ? m[1].trim() : ''
  }
  return { url: get('VITE_ARKUSZ_URL'), token: get('VITE_ARKUSZ_TOKEN') }
}

const { url, token } = fromEnv()
if (!url || !token) {
  console.error('.env.local is missing VITE_ARKUSZ_URL or VITE_ARKUSZ_TOKEN.')
  process.exit(1)
}

/* --------------------------------------------- list of fields to send --- */

const survey = JSON.parse(
  readFileSync(join(ROOT, 'src/data/ankieta.json'), 'utf8'),
)

// This loop is identical to the one in `src/lib/submit.ts`. If it drifted,
// the test would stop checking what the app actually does.
const fields = []
for (const section of survey.sekcje) {
  for (const p of section.pytania) {
    fields.push({ id: p.id, tresc: p.tresc, typ: p.typ, pytanie: p })
    if (p.komentarz) {
      fields.push({
        id: `${p.id}::komentarz`,
        tresc: `${p.tresc} [komentarz]`,
        typ: 'komentarz',
        pytanie: p,
      })
    }
  }
}

const FIXED = 4 // Data wysłania, Identyfikator sesji, Kto wypełnił, Wersja

/** Value that makes it obvious at a glance whether columns have shifted. */
function marker(field, i) {
  const nr = String(i + 1 + FIXED).padStart(2, '0')
  return `K${nr} ${field.id}`
}

/** The value a participant would actually type in. */
function realistic(field) {
  const p = field.pytanie
  switch (field.typ) {
    case 'skala':
      return String(p.max ?? 10)
    case 'tak_nie':
      return 'Tak'
    case 'jeden_wybor': {
      const first = (p.opcje ?? [])[0]
      return typeof first === 'string' ? first : (first?.tekst ?? '')
    }
    case 'wiele_wyborow':
      return (p.opcje ?? [])
        .map((o) => (typeof o === 'string' ? o : o.tekst))
        .join('; ')
    case 'komentarz':
      return `Komentarz do: ${p.tresc.slice(0, 40)}…`
    default:
      return 'Odpowiedź opisowa uczestnika.'
  }
}

/* ---------------------------------------------------------- submission --- */

function buildPayload(kto, valueFn) {
  const answers = {}
  const labels = {}
  fields.forEach((field, i) => {
    answers[field.id] = valueFn(field, i)
    labels[field.id] = field.tresc
  })
  return {
    token,
    sesja: `test-pol-${Date.now()}-${kto}`,
    kto,
    wersja: 'test-pol',
    pulapka: '',
    odpowiedzi: answers,
    etykiety: labels,
  }
}

async function send(data) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(data),
    redirect: 'follow',
  })
  const text = await resp.text()
  try {
    return JSON.parse(text)
  } catch {
    return { ok: false, blad: text.slice(0, 200) }
  }
}

console.log('\n=== Test: wartość w każdym polu ===\n')
console.log(`Adres:   ${url.slice(0, 58)}…`)
console.log(`Pól:     ${fields.length} (+ ${FIXED} stałe = ${fields.length + FIXED} kolumn)\n`)

const runs = [
  { kto: 'TEST ZNACZNIKI (do skasowania)', wartosc: marker },
  { kto: 'TEST REALISTYCZNY (do skasowania)', wartosc: (p) => realistic(p) },
]

// `--sucho` (dry run) builds everything and shows it, but sends nothing.
// Useful before the sheet is ready — you can see the content without adding
// junk to the sheet.
const dryRun = process.argv.includes('--sucho')

let errors = 0
for (const run of runs) {
  const data = buildPayload(run.kto, run.wartosc)

  if (dryRun) {
    console.log(`— „${run.kto}” — ${Object.keys(data.odpowiedzi).length} pól:`)
    const keys = Object.keys(data.odpowiedzi)
    keys.forEach((k, i) => {
      const nr = String(i + 1 + FIXED).padStart(2, ' ')
      const value = String(data.odpowiedzi[k])
      console.log(
        `  ${nr}. ${k.padEnd(32)} = ${value.length > 46 ? value.slice(0, 46) + '…' : value}`,
      )
    })
    const empty = keys.filter((k) => data.odpowiedzi[k] === '')
    console.log(
      empty.length
        ? `  UWAGA: puste pola → ${empty.join(', ')}`
        : '  Żadne pole nie jest puste.',
    )
    console.log('')
    continue
  }

  process.stdout.write(`Wysyłam „${run.kto}”… `)
  const result = await send(data)
  if (result.ok === true) {
    console.log('OK')
  } else {
    console.log('BŁĄD → ' + JSON.stringify(result))
    errors++
  }
}

/* --------------------------------------------------- cheat sheet to check --- */

const rows = [
  ['Nr kolumny', 'Litera', 'Identyfikator', 'Wiersz ZNACZNIKI', 'Wiersz REALISTYCZNY'],
]
const colLetter = (i) => {
  let n = i
  let s = ''
  do {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return s
}
fields.forEach((field, i) => {
  rows.push([
    String(i + 1 + FIXED),
    colLetter(i + FIXED),
    field.id,
    marker(field, i),
    realistic(field),
  ])
})

const cheatSheet = join(ROOT, 'sciaga-do-sprawdzenia.txt')
writeFileSync(
  cheatSheet,
  rows.map((w) => w.join('\t')).join('\n') + '\n',
  'utf8',
)

console.log(`\nŚciąga do porównania z arkuszem: ${cheatSheet}`)
console.log('\nCo sprawdzić w arkuszu:')
console.log('  1. W wierszu ZNACZNIKI kolumna E ma zaczynać się od "K05",')
console.log('     kolumna F od "K06" i tak dalej aż do "K48" w kolumnie AV.')
console.log('  2. Jeśli którakolwiek się nie zgadza — kolumny są przesunięte.')
console.log('  3. Żadne pole w tych dwóch wierszach nie może być puste.')
console.log('\nPo sprawdzeniu skasuj oba wiersze testowe.\n')

process.exit(errors === 0 ? 0 : 1)
