/**
 * Generates a SAMPLE results sheet — to show Mateusz and Marek what the
 * data layout looks like, before we deploy anything.
 *
 * The data inside is made up and marked as such. The real sheet will build
 * itself once the first person fills out the survey.
 *
 * Run:  npm run example-sheet
 */
import * as XLSX from 'xlsx'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIR = join(__dirname, '..')
const survey = JSON.parse(
  readFileSync(join(DIR, 'src', 'data', 'ankieta.json'), 'utf8'),
)

const FIXED_COLUMNS = [
  'Data wysłania',
  'Identyfikator sesji',
  'Kto wypełnił',
  'Wersja ankiety',
]

// Identifiers and readable headers, in the same order.
const questionIds = []
const headers = []
for (const s of survey.sekcje) {
  for (const p of s.pytania) {
    questionIds.push(p.id)
    headers.push(p.tresc)
  }
}

/** Sample responses: different paths through the survey. */
const samples = [
  {
    data: '2026-10-18 19:12:04',
    sesja: 'a7f3c210-...',
    kto: 'anonimowo',
    odp: {
      'obecnosc-dni': 'Piątek (16.10); Sobota (17.10)',
      'sciezka-1600': 'Finał konkursu (Sala Konwersatorium)',
      'pt-debata-otwarcia': '9',
      'pt-koncert': '10',
      'pt-integracja': '8',
      'sb-debata1': '8',
      'sb-debata1-kto': 'kard. Grzegorz Ryś',
      'sb-debata2': '9',
      'sb-debata2-kto': 'prof. Krzysztof Górski (NASA JPL)',
      'sb-debaty-uwagi': 'Najbardziej zapadło mi zdanie o tym, że decyzje zapadają zanim je podejmiemy.',
      'kk-polfinal-format': '7',
      'kk-feedback': '9',
      'kk-prezentacja': 'Nie',
      'kk-prezentacja::komentarz': 'Przy stoliku było gwarno, ciężko się przebić.',
      'kk-zasady': 'Tak',
      'kk-uwagi': 'Więcej czasu na prezentację, 10 minut to mało.',
      'fn-final': '10',
      'org-rekrutacja': '8',
      'org-transport': '9',
      'org-jedzenie': '7',
      'org-jedzenie::komentarz': 'Za mało opcji wegetariańskich.',
      'org-miejsce': '10',
      nps: '10',
      'pod-wartosc-i-poprawa': 'Najcenniejsze były rozmowy przy stolikach. Poprawcie nagłośnienie w Sali Petrus.',
      'pod-wlasnymi-slowami': 'Dwa dni, po których chce się działać.',
      'koniec-dopisek': '',
    },
  },
  {
    data: '2026-10-18 21:47:33',
    sesja: 'b2e9d541-...',
    kto: 'Anna Kowalska (PRZYKŁAD)',
    odp: {
      'obecnosc-dni': 'Sobota (17.10)',
      'sciezka-1600': 'III debata o geopolityce (Sala Petrus)',
      'sb-debata1': '9',
      'sb-debata1-kto': 'Grażyna Kulczyk',
      'sb-debata2': 'nie było mnie',
      'sb-debaty-uwagi': '',
      'sb-debata3': '10',
      'sb-debata3-kto': 'prof. Hanna Suchocka',
      'sb-partnerstwo': '9',
      'kk-polfinal-format': '8',
      'kk-feedback': 'nie było mnie',
      'kk-prezentacja': 'Tak',
      'kk-zasady': 'Nie',
      'kk-zasady::komentarz': 'Nie wiedziałam, kiedy ogłaszają złote bilety.',
      'kk-uwagi': '',
      'org-rekrutacja': '6',
      'org-rekrutacja::komentarz': 'Wideo 2 minuty to za krótko na sensowny projekt.',
      'org-transport': 'nie było mnie',
      'org-jedzenie': '8',
      'org-miejsce': '10',
      nps: '9',
      'pod-wartosc-i-poprawa': 'Debata geopolityczna była najlepsza. Zabrakło przerwy między blokami.',
      'pod-wlasnymi-slowami': '',
      'koniec-dopisek': 'Chętnie pomogę przy przyszłej edycji.',
    },
  },
  {
    data: '2026-10-19 09:03:15',
    sesja: 'c5a1f882-...',
    kto: 'anonimowo',
    odp: {
      'obecnosc-dni': 'Piątek (16.10)',
      'pt-debata-otwarcia': '7',
      'pt-koncert': '9',
      'pt-integracja': '10',
      'org-rekrutacja': '9',
      'org-transport': '5',
      'org-transport::komentarz': 'Autokar spóźnił się 20 minut.',
      'org-jedzenie': '6',
      'org-miejsce': '9',
      nps: '8',
      'pod-wartosc-i-poprawa': 'Klimat Opactwa robi robotę. Jedzenie do poprawy.',
      'pod-wlasnymi-slowami': '',
      'koniec-dopisek': '',
    },
  },
]

const rows = []

// Row 1: identifiers (hidden in the real sheet, kept here so you can see
// where the system knows to write the answer).
rows.push([...FIXED_COLUMNS, ...questionIds])
// Row 2: readable headers.
rows.push([...FIXED_COLUMNS, ...headers])
// Rows 3+: data.
for (const p of samples) {
  rows.push([
    p.data,
    p.sesja,
    p.kto,
    '2026-08-13',
    ...questionIds.map((id) => p.odp[id] ?? ''),
  ])
}

const sheet = XLSX.utils.aoa_to_sheet(rows)
sheet['!cols'] = [
  { wch: 19 },
  { wch: 16 },
  { wch: 24 },
  { wch: 13 },
  ...questionIds.map(() => ({ wch: 26 })),
]
sheet['!freeze'] = { xSplit: 4, ySplit: 2 }

const workbook = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(workbook, sheet, 'Odpowiedzi')

// "Podsumowanie" (Summary) tab — numbers that update themselves.
const ratings = []
for (const s of survey.sekcje) {
  for (const p of s.pytania) {
    if (p.typ === 'skala') ratings.push({ id: p.id, tresc: p.tresc, sekcja: s.tytul })
  }
}
const colLetter = (n) => {
  let s = ''
  n += 1
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}
const summary = [
  ['PODSUMOWANIE (liczy się samo, formułami)'],
  [''],
  ['Liczba odpowiedzi', '=COUNTA(Odpowiedzi!A3:A)'],
  [''],
  ['Sekcja', 'Pytanie', 'Średnia', 'Liczba ocen', 'Nie było mnie'],
]
for (const o of ratings) {
  const col = colLetter(FIXED_COLUMNS.length + questionIds.indexOf(o.id))
  summary.push([
    o.sekcja,
    o.tresc,
    `=IFERROR(ROUND(AVERAGE(Odpowiedzi!${col}3:${col}),2),"brak")`,
    `=COUNT(Odpowiedzi!${col}3:${col})`,
    `=COUNTIF(Odpowiedzi!${col}3:${col},"nie było mnie")`,
  ])
}
const ws2 = XLSX.utils.aoa_to_sheet(summary)
ws2['!cols'] = [{ wch: 24 }, { wch: 62 }, { wch: 10 }, { wch: 12 }, { wch: 14 }]
XLSX.utils.book_append_sheet(workbook, ws2, 'Podsumowanie')

const TARGET = join(DIR, 'przyklad-arkusza-wynikow.xlsx')
XLSX.writeFile(workbook, TARGET)
console.log(`Saved ${TARGET}`)
console.log(`Question columns: ${questionIds.length}, sample rows: ${samples.length}`)
console.log(`Summary tab: ${ratings.length} scale-rated questions`)
