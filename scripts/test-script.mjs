/**
 * TEST OF THE APPS SCRIPT LOGIC — without Google, on this machine.
 *
 * Substitutes fakes for Google's objects (SpreadsheetApp, LockService,
 * Utilities…) — see scripts/lib/fake-google.mjs — and runs the real code
 * from apps-script/Kod.gs against a fake sheet. This way logic bugs surface here, not after deployment.
 *
 * Run:  npm run test:script
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CODE = join(__dirname, '..', 'apps-script', 'Kod.gs')

import {
  createEnvironment,
  createFile,
  createSheet,
  loadScript,
} from './lib/fake-google.mjs'

/* ------------------------------------------------------ Google environment --- */

// One holder for everything the fakes remember between calls. A test below
// resets the cache by assigning a fresh object, so the environment reads it
// through the holder every time instead of closing over the first one.
const holder = { file: createFile(), cache: {}, consoleErrors: [], loggerEntries: [] }
const file = holder.file
const environment = createEnvironment(holder)

// Run the real script code inside the prepared environment.
const source = readFileSync(CODE, 'utf8')
const { factory, script } = loadScript(source, environment, [
  'doPost', 'testSave', 'prepareColumns', 'clearCache', 'markPrevious',
  'SHEET_NAME', 'TOKEN', 'FIXED_COLUMNS', 'SURVEY_COLUMNS',
])

/* ------------------------------------------------------------- tests --- */

let passed = 0
let failed = 0

function check(desc, condition, detail = '') {
  if (condition) {
    console.log(`  OK   ${desc}`)
    passed++
  } else {
    console.log(`  BŁĄD ${desc}${detail ? ' → ' + detail : ''}`)
    failed++
  }
}

const post = (data) =>
  script.doPost({ postData: { contents: JSON.stringify(data) } })

const result = (resp) => JSON.parse(resp.tresc)

console.log('\n=== Test logiki skryptu Apps Script ===\n')

/* 1. First submission creates the tab and headers */
console.log('1. Pierwsza odpowiedź na pustym arkuszu')
const resp1 = post({
  token: script.TOKEN,
  sesja: 'sesja-A',
  kto: 'anonimowo',
  wersja: '2026-08-13',
  pulapka: '',
  odpowiedzi: { nps: '10', 'org-jedzenie': '7' },
  etykiety: { nps: 'Polecisz znajomemu?', 'org-jedzenie': 'Jak oceniasz jedzenie?' },
})
const sheet = file.getSheetByName(script.SHEET_NAME)
check('odpowiedź ok', result(resp1).ok === true, JSON.stringify(result(resp1)))
check('zakładka powstała', sheet !== null)
check('wiersz 1 to identyfikatory', sheet.data[0][4] === 'nps')
check('wiersz 2 to czytelne nagłówki', sheet.data[1][4] === 'Polecisz znajomemu?')
check('dane zaczynają się w wierszu 3', sheet.data.length === 3)
check('ocena trafiła do właściwej kolumny', sheet.data[2][4] === '10')
check('nagłówki zamrożone', sheet._state().frozen === 2)
check('wiersz techniczny ukryty', sheet._state().hidden.includes(1))

/* 2. Second person, same questions */
console.log('\n2. Druga osoba, te same pytania')
post({
  token: script.TOKEN,
  sesja: 'sesja-B',
  kto: 'Anna Kowalska',
  wersja: '2026-08-13',
  odpowiedzi: { nps: '8', 'org-jedzenie': 'nie było mnie' },
  etykiety: {},
})
check('doszedł jeden wiersz', sheet.data.length === 4)
check('kolumny się nie rozjechały', sheet.data[3][4] === '8')
check('„nie było mnie” zapisane', sheet.data[3][5] === 'nie było mnie')
check('imię w kolumnie „Kto wypełnił”', sheet.data[3][2] === 'Anna Kowalska')

/* 3. New question added mid-collection */
console.log('\n3. Nowe pytanie dodane w trakcie zbierania')
post({
  token: script.TOKEN,
  sesja: 'sesja-C',
  kto: 'anonimowo',
  wersja: '2026-08-20',
  odpowiedzi: { nps: '9', 'org-jedzenie': '8', 'nowe-pytanie': 'Tak' },
  etykiety: { 'nowe-pytanie': 'Czy parking był wystarczający?' },
})
check('doszła kolumna na końcu', sheet.data[0][6] === 'nowe-pytanie')
check('z czytelnym nagłówkiem', sheet.data[1][6] === 'Czy parking był wystarczający?')
check('nowa odpowiedź w nowej kolumnie', sheet.data[4][6] === 'Tak')
check(
  'starsze wiersze mają tam pusto',
  sheet.data[2][6] === undefined || sheet.data[2][6] === '',
)
check('stare odpowiedzi nietknięte', sheet.data[2][4] === '10' && sheet.data[3][4] === '8')

/* 4. Same person submits a second time */
console.log('\n4. Ta sama osoba wysyła ponownie')
post({
  token: script.TOKEN,
  sesja: 'sesja-A',
  kto: 'anonimowo',
  wersja: '2026-08-20',
  odpowiedzi: { nps: '6', 'org-jedzenie': '5' },
  etykiety: {},
})
check('nowy wiersz dopisany', sheet.data.length === 6)
check(
  'poprzedni oznaczony jako nieaktualny',
  String(sheet.data[2][2]).startsWith('[nieaktualne]'),
  String(sheet.data[2][2]),
)
check('najnowsza odpowiedź bez dopisku', sheet.data[5][2] === 'anonimowo')
check('nic nie skasowane', sheet.data[2][4] === '10')

/* 5. Wrong password */
console.log('\n5. Zapytanie ze złym hasłem')
const bad = result(post({ token: 'nie-to-haslo', sesja: 'x', odpowiedzi: {} }))
check('odrzucone', bad.ok === false && bad.blad === 'zly-token')
check('nic nie dopisano', sheet.data.length === 6)

/* 6. Bot fills in the honeypot field */
console.log('\n6. Bot wypełnia ukryte pole')
const bot = result(
  post({
    token: script.TOKEN,
    sesja: 'bot',
    pulapka: 'kup tanie zegarki',
    odpowiedzi: { nps: '1' },
  }),
)
check('udajemy sukces', bot.ok === true)
check('ale nic nie zapisano', sheet.data.length === 6)

/* 7. Running doPost manually from the editor */
console.log('\n7. Ręczne uruchomienie doPost z edytora')
holder.consoleErrors = []
const manual = result(script.doPost(undefined))
check('zwraca błąd zamiast się wysypać', manual.ok === false)
check(
  'komunikat podpowiada testSave',
  String(manual.blad).includes('testSave'),
  String(manual.blad).slice(0, 80),
)

/* 8. testSave from the editor */
console.log('\n8. Funkcja testSave (przycisk Uruchom w edytorze)')
script.testSave()
check('dopisała wiersz', sheet.data.length === 7)
check('oznaczony jako testowy', String(sheet.data[6][2]).includes('TEST'))

/* 9. Header holder.cache */
console.log('\n9. Pamięć podręczna nagłówków')
check(
  'nagłówki wylądowały w pamięci podręcznej',
  Object.keys(holder.cache).length > 0,
  Object.keys(holder.cache).join(', '),
)
const cached = JSON.parse(Object.values(holder.cache)[0] || '[]')
check(
  'zapamiętana lista zgadza się z arkuszem',
  cached.length === sheet.data[0].length && cached[4] === 'nps',
  `${cached.length} vs ${sheet.data[0].length}`,
)
// The nastiest holder.cache bug: a stale list after a column was appended. We swap
// in a shortened list and check whether the script detects it and still
// writes the answer to the right columns anyway.
const cacheKey = Object.keys(holder.cache)[0]
holder.cache[cacheKey] = JSON.stringify(cached.slice(0, 3))
const afterStale = result(
  post({
    token: script.TOKEN,
    sesja: 'sesja-holder.cache',
    kto: 'anonimowo',
    odpowiedzi: { nps: '4', 'org-jedzenie': '4' },
    etykiety: { nps: 'Polecisz znajomemu?', 'org-jedzenie': 'Jak oceniasz jedzenie?' },
  }),
)
check('zapis mimo nieaktualnej pamięci podręcznej', afterStale.ok === true)
const lastRow = sheet.data[sheet.data.length - 1]
check('odpowiedź trafiła do właściwej kolumny', lastRow[4] === '4', String(lastRow[4]))
check(
  'kolumny się nie rozmnożyły',
  sheet.data[0].length === cached.length,
  `${sheet.data[0].length} vs ${cached.length}`,
)

/* 10. Second deployment path: standalone project with SPREADSHEET_ID */
console.log('\n10. Projekt samodzielny (wpisany SPREADSHEET_ID)')
// The instructions support two variants and both must work. Here we swap the
// empty constant in the source for an ID and cut off getActiveSpreadsheet —
// exactly the situation of a script created outside the sheet.
const standaloneFile = createFile()
const sourceWithId = source.replace(
  /const SPREADSHEET_ID = ''/,
  "const SPREADSHEET_ID = '1AbCdEf_przykladowy_identyfikator'",
)
check(
  'stała SPREADSHEET_ID jest domyślnie pusta',
  sourceWithId !== source,
  'nie znaleziono wzorca — sprawdź wartość domyślną w Kod.gs',
)
const standaloneEnvironment = {
  ...environment,
  SpreadsheetApp: {
    openById: () => standaloneFile,
    getActiveSpreadsheet: () => null, // script is not bound to a sheet
  },
}
const standaloneScript = new Function(
  ...Object.keys(standaloneEnvironment),
  `${sourceWithId}\n;return { doPost, SHEET_NAME };`,
)(...Object.values(standaloneEnvironment))
holder.cache = {}
const standalone = result(
  standaloneScript.doPost({
    postData: {
      contents: JSON.stringify({
        token: script.TOKEN,
        sesja: 'sesja-samodzielna',
        kto: 'anonimowo',
        odpowiedzi: { nps: '10' },
        etykiety: { nps: 'Polecisz znajomemu?' },
      }),
    },
  }),
)
check('zapis działa też w tym wariancie', standalone.ok === true, JSON.stringify(standalone))
const standaloneSheet = standaloneFile.tabs.get(standaloneScript.SHEET_NAME)
check('powstała zakładka w otwartym pliku', Boolean(standaloneSheet))
check(
  'odpowiedź zapisana',
  Boolean(standaloneSheet) && standaloneSheet.data.length === 3,
  standaloneSheet ? String(standaloneSheet.data.length) : 'brak zakładki',
)

/* 11. Setting up all columns up front — the `prepareColumns` function */
console.log('\n11. Zakładanie kolumn przed zebraniem odpowiedzi')

// Fresh file, to avoid mixing with the sheet from earlier tests.
const columnsFile = createFile()
const columnsScript = factory(
  ...Object.values({ ...environment, SpreadsheetApp: {
    openById: () => columnsFile,
    getActiveSpreadsheet: () => columnsFile,
  } }),
)

const report1 = columnsScript.prepareColumns()
const columnsSheet = columnsFile.tabs.get(columnsScript.SHEET_NAME)
const expectedWidth =
  columnsScript.FIXED_COLUMNS.length + columnsScript.SURVEY_COLUMNS.length

check(
  'zakładka powstała bez ani jednej odpowiedzi',
  Boolean(columnsSheet),
)
check(
  `arkusz ma wszystkie ${expectedWidth} kolumn`,
  Boolean(columnsSheet) && columnsSheet.data[0].length === expectedWidth,
  columnsSheet ? String(columnsSheet.data[0].length) : 'brak',
)
check(
  'wiersz 1 zawiera identyfikatory w kolejności ankiety',
  Boolean(columnsSheet) &&
    columnsSheet.data[0]
      .slice(columnsScript.FIXED_COLUMNS.length)
      .join('|') ===
      columnsScript.SURVEY_COLUMNS.map((p) => p[0]).join('|'),
)
check(
  'wiersz 2 zawiera treści pytań',
  Boolean(columnsSheet) &&
    columnsSheet.data[1]
      .slice(columnsScript.FIXED_COLUMNS.length)
      .join('|') ===
      columnsScript.SURVEY_COLUMNS.map((p) => p[1]).join('|'),
)
check(
  'raport nie zgłasza kolumn spoza ankiety',
  report1.includes('Spoza ankiety:         brak'),
  report1.split('\n').pop(),
)

/* 12. Running it a second time breaks nothing */
console.log('\n12. Drugie uruchomienie na gotowym arkuszu')
const widthBefore = columnsSheet.data[0].length
const report2 = columnsScript.prepareColumns()
check(
  'kolumny się nie zdublowały',
  columnsSheet.data[0].length === widthBefore,
  `${widthBefore} → ${columnsSheet.data[0].length}`,
)
check(
  'raport mówi, że nie było nic do założenia',
  report2.includes('Zalozone teraz:        brak'),
)

/* 13. Fixes the header when a question's wording changed */
console.log('\n13. Zmieniona treść pytania i kolumna po skasowanym pytaniu')
const firstQuestion = columnsScript.SURVEY_COLUMNS[0][0]
const firstQuestionCol = columnsSheet.data[0].indexOf(firstQuestion)
columnsSheet.data[1][firstQuestionCol] = 'STARA TREŚĆ PYTANIA'
// Two columns left over from questions that no longer exist: one that
// already collected an answer, one that never did.
columnsSheet.data[0].push('nps', 'fn-jury')
columnsSheet.data[1].push('Na ile prawdopodobne, że polecisz…', 'Czy sposób oceniania…')
const npsCol = columnsSheet.data[0].indexOf('nps')
const rowWithAnswer = []
rowWithAnswer[npsCol] = 9
columnsSheet.data.push(rowWithAnswer)
const widthBeforeCleanup = columnsSheet.data[0].length

const report3 = columnsScript.prepareColumns()
check(
  'nagłówek wrócił do aktualnej treści pytania',
  columnsSheet.data[1][firstQuestionCol] === columnsScript.SURVEY_COLUMNS[0][1],
  columnsSheet.data[1][firstQuestionCol],
)
check(
  'raport wypisał kolumnę po skasowanym pytaniu',
  report3.includes('Spoza ankiety:         nps'),
)
check(
  'kolumna z odpowiedziami NIE została usunięta',
  columnsSheet.data[0].indexOf('nps') !== -1,
)
check(
  'jej odpowiedź została na miejscu',
  columnsSheet.data[2][columnsSheet.data[0].indexOf('nps')] === 9,
)
check(
  'pusta kolumna po skasowanym pytaniu zniknęła',
  columnsSheet.data[0].indexOf('fn-jury') === -1,
)
check(
  'raport wypisał usuniętą kolumnę',
  report3.includes('Usuniete puste:        fn-jury'),
)
check(
  'arkusz zwęził się dokładnie o jedną kolumnę',
  columnsSheet.data[0].length === widthBeforeCleanup - 1,
  `${widthBeforeCleanup} → ${columnsSheet.data[0].length}`,
)

/* 14. After setting up columns, a submission lands in existing ones, adds none */
console.log('\n14. Odpowiedź na przygotowanym arkuszu')
const fullAnswers = {}
const fullLabels = {}
columnsScript.SURVEY_COLUMNS.forEach((pair) => {
  fullAnswers[pair[0]] = 'x'
  fullLabels[pair[0]] = pair[1]
})
const widthBeforeSubmit = columnsSheet.data[0].length
const fullResp = JSON.parse(
  columnsScript
    .doPost({
      postData: {
        contents: JSON.stringify({
          token: columnsScript.TOKEN,
          sesja: 'sesja-pelna',
          kto: 'anonimowo',
          wersja: '2026-08-25',
          pulapka: '',
          odpowiedzi: fullAnswers,
          etykiety: fullLabels,
        }),
      },
    })
    .tresc,
)
check('odpowiedź przyjęta', fullResp.ok === true, JSON.stringify(fullResp))
check(
  'żadna kolumna nie doszła',
  columnsSheet.data[0].length === widthBeforeSubmit,
  `${widthBeforeSubmit} → ${columnsSheet.data[0].length}`,
)
const fullRow = columnsSheet.data[columnsSheet.data.length - 1]
check(
  'każde pytanie ma swoją wartość we właściwej kolumnie',
  columnsScript.SURVEY_COLUMNS.every((pair) => {
    const k = columnsSheet.data[0].indexOf(pair[0])
    return k !== -1 && fullRow[k] === 'x'
  }),
)

/* 15. Column list matches what the app sends */
console.log('\n15. Zgodność listy kolumn z ankietą')
// This loop is DELIBERATELY rewritten by hand rather than imported from the
// generator: if the generator got it wrong, importing it would repeat the
// same bug and the test would catch nothing. It mirrors the loop in
// `src/lib/submit.ts` exactly.
const surveySource = JSON.parse(
  readFileSync(join(__dirname, '..', 'src', 'data', 'ankieta.json'), 'utf8'),
)
const expected = []
for (const section of surveySource.sekcje) {
  for (const question of section.pytania) {
    // A ranking is one column per place (see buildPayload in submit.ts).
    if (question.typ === 'ranking') {
      for (let place = 1; place <= (question.max ?? 3); place += 1) {
        expected.push([
          `${question.id}::${place}`,
          `${question.tresc} [${place}. miejsce]`,
        ])
      }
    } else {
      expected.push([question.id, question.tresc])
    }
    if (question.komentarz) {
      expected.push([
        `${question.id}::komentarz`,
        `${question.tresc} [komentarz]`,
      ])
    }
  }
}
check(
  `liczba kolumn zgadza się z ankietą (${expected.length})`,
  columnsScript.SURVEY_COLUMNS.length === expected.length,
  `skrypt ma ${columnsScript.SURVEY_COLUMNS.length}`,
)
const mismatch = expected.findIndex(
  (pair, i) =>
    !columnsScript.SURVEY_COLUMNS[i] ||
    columnsScript.SURVEY_COLUMNS[i][0] !== pair[0] ||
    columnsScript.SURVEY_COLUMNS[i][1] !== pair[1],
)
check(
  'identyfikatory i nagłówki zgadzają się co do znaku',
  mismatch === -1,
  mismatch === -1 ? '' : `pierwsza różnica: ${expected[mismatch][0]}`,
)
const duplicates = expected
  .map((p) => p[0])
  .filter((id, i, list) => list.indexOf(id) !== i)
check(
  'żaden identyfikator nie powtarza się dwa razy',
  duplicates.length === 0,
  duplicates.join(', '),
)

/* 16. The tab is deleted while the holder.cache is warm */
console.log('\n16. Usunięta zakładka „Odpowiedzi” przy ciepłej pamięci podręcznej')
const file16 = createFile()
const script16 = factory(
  ...Object.values({ ...environment, SpreadsheetApp: {
    openById: () => file16,
    getActiveSpreadsheet: () => file16,
  } }),
)
const fullSubmission = (nr) => {
  const odpowiedzi = {}
  const etykiety = {}
  script16.SURVEY_COLUMNS.forEach(([id, label]) => {
    odpowiedzi[id] = `odp-${nr}`
    etykiety[id] = label
  })
  return { token: script16.TOKEN, sesja: `sesja-${nr}`, kto: 'anonimowo', wersja: 'x', pulapka: '', odpowiedzi, etykiety }
}
// The first response builds the tab and warms the holder.cache with its layout.
script16.doPost({ postData: { contents: JSON.stringify(fullSubmission(1)) } })
const widthBeforeDelete = file16.tabs.get(script16.SHEET_NAME).data[0].length
check('pierwsza odpowiedź zbudowała komplet kolumn', widthBeforeDelete === 4 + script16.SURVEY_COLUMNS.length)
// Someone deletes the tab. The holder.cache still remembers all those columns.
file16.tabs.delete(script16.SHEET_NAME)
const afterDelete = JSON.parse(
  script16.doPost({ postData: { contents: JSON.stringify(fullSubmission(2)) } }).tresc,
)
const rebuilt = file16.tabs.get(script16.SHEET_NAME)
check('odpowiedź przyjęta po odtworzeniu zakładki', afterDelete.ok === true, JSON.stringify(afterDelete))
check(
  'odtworzona zakładka ma komplet kolumn, każda z nagłówkiem',
  rebuilt.data[0].length === widthBeforeDelete &&
    rebuilt.data[1].filter((v) => v !== '').length === widthBeforeDelete,
  `${rebuilt.data[0].length} kolumn, ${rebuilt.data[1].filter((v) => v !== '').length} nagłówków`,
)
check(
  'każda wartość leży pod swoją kolumną, nie pod widmem starej',
  script16.SURVEY_COLUMNS.every(([id]) => rebuilt.data[2][rebuilt.data[0].indexOf(id)] === 'odp-2'),
)

/* 17. A new spreadsheet does not inherit the old one's cached layout */
console.log('\n17. Nowy arkusz nie dziedziczy pamięci podręcznej starego')
const file17 = createFile()
const script17 = factory(
  ...Object.values({ ...environment, SpreadsheetApp: {
    openById: () => file17,
    getActiveSpreadsheet: () => file17,
  } }),
)
const only3 = JSON.parse(
  script17.doPost({
    postData: {
      contents: JSON.stringify({
        token: script17.TOKEN, sesja: 'nowy-1', kto: 'anonimowo', wersja: 'x', pulapka: '',
        odpowiedzi: { 'org-jedzenie': '7', 'org-miejsce': '9' },
        etykiety: { 'org-jedzenie': 'Jedzenie', 'org-miejsce': 'Miejsce' },
      }),
    },
  }).tresc,
)
const sheet17 = file17.tabs.get(script17.SHEET_NAME)
check('zapis do nowego arkusza przyjęty', only3.ok === true)
check(
  'nowy arkusz ma tylko swoje kolumny, nie 54 z poprzedniego',
  sheet17.data[0].length === 6,
  `${sheet17.data[0].length} kolumn: ${sheet17.data[0].join(', ')}`,
)
check(
  'wartości pod właściwymi nagłówkami',
  sheet17.data[2][sheet17.data[0].indexOf('org-jedzenie')] === '7' &&
    sheet17.data[2][sheet17.data[0].indexOf('org-miejsce')] === '9',
)

/* 18. clearCache forgets the current tab's layout */
console.log('\n18. clearCache zapomina układ bieżącej zakładki')
const keysBefore = Object.keys(holder.cache).length
script17.clearCache()
check('wpis dla bieżącej zakładki usunięty', Object.keys(holder.cache).length === keysBefore - 1, `${keysBefore} → ${Object.keys(holder.cache).length}`)

/* 19. A participant's text never becomes a formula in the organiser's sheet */
console.log('\n19. Tekst uczestnika nigdy nie staje się formułą')
const file19 = createFile()
const script19 = factory(
  ...Object.values({ ...environment, SpreadsheetApp: {
    openById: () => file19,
    getActiveSpreadsheet: () => file19,
  } }),
)
const injected = {
  'org-jedzenie': '7',
  'org-jedzenie::komentarz': '=HYPERLINK("http://zly.example";"kliknij")',
  'org-miejsce': '-5',
  'org-miejsce::komentarz': '+1+1',
  'pod-wrazenie': '-1+1',
  'pod-wartosc-i-poprawa': '@IMPORT',
  'pod-wlasnymi-slowami': '  =SUMA(A1:A9)',
  'sb-debaty-uwagi': "'cytat w apostrofach'",
}
const r19 = JSON.parse(
  script19.doPost({
    postData: {
      contents: JSON.stringify({
        token: script19.TOKEN, sesja: 'inj-1', kto: '=1+1', wersja: 'x', pulapka: '',
        odpowiedzi: injected,
        etykiety: Object.fromEntries(Object.keys(injected).map((k) => [k, k === 'org-jedzenie' ? '=zla etykieta' : k])),
      }),
    },
  }).tresc,
)
const sheet19 = file19.tabs.get(script19.SHEET_NAME)
const row19 = sheet19.data[2]
const cell19 = (id) => row19[sheet19.data[0].indexOf(id)]
check('zapis przyjęty', r19.ok === true, JSON.stringify(r19))
check(
  'żadna komórka wiersza nie jest formułą',
  row19.every((v) => typeof v !== 'object'),
  JSON.stringify(row19.filter((v) => typeof v === 'object')),
)
check('komentarz z „=” trafia do arkusza jako tekst, bez zmian', cell19('org-jedzenie::komentarz') === injected['org-jedzenie::komentarz'])
check('imię zaczynające się od „=” zostaje tekstem', cell19('Kto wypełnił') === '=1+1')
check('„+1+1” i „-1+1” zostają tekstem', cell19('org-miejsce::komentarz') === '+1+1' && cell19('pod-wrazenie') === '-1+1')
check('„@” na początku zostaje tekstem', cell19('pod-wartosc-i-poprawa') === '@IMPORT')
check('spacje przed „=” nie omijają zabezpieczenia', cell19('pod-wlasnymi-slowami') === '  =SUMA(A1:A9)')
check('ocena „7” i liczba „-5” nie dostają apostrofu (liczby zostają liczbami)', cell19('org-jedzenie') === '7' && cell19('org-miejsce') === '-5')
check('etykieta nagłówka z „=” też zostaje tekstem', typeof sheet19.data[1][sheet19.data[0].indexOf('org-jedzenie')] === 'string')
check('apostrof na początku wypowiedzi nie znika', cell19('sb-debaty-uwagi') === "'cytat w apostrofach'", String(cell19('sb-debaty-uwagi')))

/* 20. Under load, marking earlier submissions must never touch somebody else's — or our own — row */
console.log('\n20. Oznaczanie poprzednich wpisów przy równoczesnych wysyłkach')
const file20 = createFile()
const script20 = factory(
  ...Object.values({ ...environment, SpreadsheetApp: {
    openById: () => file20,
    getActiveSpreadsheet: () => file20,
  } }),
)
const send20 = (sesja, kto) =>
  JSON.parse(script20.doPost({ postData: { contents: JSON.stringify({
    token: script20.TOKEN, sesja, kto, wersja: 'x', pulapka: '',
    odpowiedzi: { 'org-jedzenie': '5' }, etykiety: { 'org-jedzenie': 'Jedzenie' },
  }) } }).tresc)
send20('sesja-A', 'Ala')
send20('sesja-B', 'Bartek')
const sheet20 = file20.tabs.get(script20.SHEET_NAME)
const kto20 = () => sheet20.data.slice(2).map((w) => w[2])
// The situation the lock cannot prevent: A's row is written, the lock is
// released, B's row lands underneath, and only THEN A's marking runs.
script20.markPrevious(sheet20, 'sesja-A')
check('własny wiersz nie dostaje dopisku, choć pod nim leży już cudzy', kto20()[0] === 'Ala', JSON.stringify(kto20()))
check('cudzy wiersz nietknięty', kto20()[1] === 'Bartek')
send20('sesja-A', 'Ala')
check('prawdziwa poprawka: starszy wiersz tej samej osoby oznaczony', kto20()[0] === '[nieaktualne] Ala', JSON.stringify(kto20()))
check('najnowszy wiersz tej osoby czysty', kto20()[2] === 'Ala')
check('wiersz innej osoby wciąż nietknięty', kto20()[1] === 'Bartek')

/* 21. prepareColumns re-writes headers as text, even ones that look like formulas */
console.log('\n21. prepareColumns przepisuje nagłówki jako tekst')
const r21 = JSON.parse(script20.doPost({ postData: { contents: JSON.stringify({
  token: script20.TOKEN, sesja: 'sesja-C', kto: 'anonimowo', wersja: 'x', pulapka: '',
  odpowiedzi: { 'org-jedzenie': '6', '=zly-id': 'x' },
  etykiety: { 'org-jedzenie': 'Jedzenie', '=zly-id': '=IMPORTRANGE("x")' },
}) } }).tresc)
check('odpowiedź z podejrzanym identyfikatorem przyjęta', r21.ok === true)
script20.prepareColumns()
const col21 = sheet20.data[0].indexOf('=zly-id')
check('osierocona kolumna z danymi została (nie skasowano cudzych danych)', col21 !== -1, JSON.stringify(sheet20.data[0]))
check('po prepareColumns żaden nagłówek nie jest formułą', sheet20.data[0].every((v) => typeof v === 'string') && sheet20.data[1].every((v) => typeof v === 'string'), JSON.stringify([sheet20.data[0][col21], sheet20.data[1][col21]]))
check('treść podejrzanego nagłówka zachowana jako tekst', sheet20.data[1][col21] === '=IMPORTRANGE("x")')

/* 22–24. Maintenance commands over HTTP */
console.log('\n22. Polecenia administracyjne: hasło')
const file22 = createFile()
const holder22 = { file: file22, cache: {}, consoleErrors: [], loggerEntries: [] }
const script22 = loadScript(
  source.replace(/const ADMIN_TOKEN = '[^']*'/, "const ADMIN_TOKEN = 'admin-test'"),
  createEnvironment(holder22),
  ['doPost', 'SHEET_NAME', 'TOKEN', 'SURVEY_COLUMNS', 'FIXED_COLUMNS'],
).script
const admin = (body) => JSON.parse(script22.doPost({ postData: { contents: JSON.stringify({ token: script22.TOKEN, pulapka: '', ...body }) } }).tresc)
check('bez hasła admina odrzucone', admin({ akcja: 'status' }).blad === 'zly-token-admina')
check('ze złym hasłem admina odrzucone', admin({ akcja: 'status', adminToken: 'nie' }).blad === 'zly-token-admina')
check('nieznane polecenie odrzucone', admin({ akcja: 'wysadz', adminToken: 'admin-test' }).blad === 'nieznana-akcja')
const scriptNoAdmin = loadScript(source, createEnvironment({ file: createFile(), cache: {}, consoleErrors: [], loggerEntries: [] }), ['doPost', 'TOKEN']).script
const noAdmin = JSON.parse(scriptNoAdmin.doPost({ postData: { contents: JSON.stringify({ token: scriptNoAdmin.TOKEN, pulapka: '', akcja: 'status', adminToken: '' }) } }).tresc)
check('przy pustym ADMIN_TOKEN polecenia są wyłączone', noAdmin.blad === 'zly-token-admina')

console.log('\n23. Polecenia administracyjne: status i prepareColumns')
const st0 = admin({ akcja: 'status', adminToken: 'admin-test' })
check('status na pustym arkuszu', st0.ok === true && st0.wierszy === 0 && st0.kolumn === 4 && st0.zakladka === 'Odpowiedzi', JSON.stringify(st0))
check('status podaje wersję skryptu', /^\d{4}-\d{2}-\d{2}/.test(String(st0.wersjaSkryptu)), String(st0.wersjaSkryptu))
const pc = admin({ akcja: 'prepareColumns', adminToken: 'admin-test' })
check('prepareColumns przez HTTP zakłada komplet kolumn', pc.ok === true && /Kolumn w arkuszu:\s+54/.test(pc.raport), String(pc.raport).slice(0, 80))
admin({ sesja: 'adm-1', kto: 'Ala', wersja: 'x', odpowiedzi: { 'org-jedzenie': '8' }, etykiety: { 'org-jedzenie': 'Jedzenie' } })
const st1 = admin({ akcja: 'status', adminToken: 'admin-test' })
check('status liczy wiersze i kolumny', st1.wierszy === 1 && st1.kolumn === 54 && st1.ostatniWpis !== '', JSON.stringify(st1))

console.log('\n24. Polecenia administracyjne: archiwizacja zakładki')
const arch = admin({ akcja: 'archiwizuj', adminToken: 'admin-test' })
check('archiwizacja przyjęta', arch.ok === true && arch.zarchiwizowano.startsWith('Odpowiedzi-'), JSON.stringify(arch).slice(0, 120))
const stara = file22.tabs.get(arch.zarchiwizowano)
const nowa = file22.tabs.get('Odpowiedzi')
check('stara zakładka zachowana razem z danymi', stara && stara.data.length === 3 && stara.data[2][2] === 'Ala')
check('nowa zakładka ma komplet kolumn i brak wierszy', nowa && nowa.data[0].length === 54 && nowa.data.length === 2)
check('nowa zakładka: wiersze nagłówków zamrożone, wiersz 1 ukryty', nowa._state().frozen === 2 && nowa._state().hidden.includes(1))
admin({ sesja: 'adm-2', kto: 'Bartek', wersja: 'x', odpowiedzi: { 'org-jedzenie': '9' }, etykiety: { 'org-jedzenie': 'Jedzenie' } })
check('kolejna odpowiedź trafia do nowej zakładki, pod swoją kolumnę', nowa.data.length === 3 && nowa.data[2][nowa.data[0].indexOf('org-jedzenie')] === '9' && stara.data.length === 3)
const st2 = admin({ akcja: 'status', adminToken: 'admin-test' })
check('status wymienia obie zakładki', st2.zakladki.includes('Odpowiedzi') && st2.zakladki.includes(arch.zarchiwizowano), JSON.stringify(st2.zakladki))
const arch2 = admin({ akcja: 'archiwizuj', adminToken: 'admin-test' })
check('druga archiwizacja w tej samej minucie dostaje inną nazwę', arch2.ok === true && arch2.zarchiwizowano !== arch.zarchiwizowano, arch2.zarchiwizowano)

/* 25–27. Hostile and oversized input on the freshly archived tab */
console.log('\n25. Bardzo długi tekst nie wysadza wiersza')
const tab25 = file22.tabs.get('Odpowiedzi')
const rowsBefore25 = tab25.data.length
const kolKom25 = tab25.data[0].indexOf('org-jedzenie::komentarz')
const dlugi = 'x'.repeat(60000)
const r25 = admin({ sesja: 'sesja-dlugi', kto: 'Długopis', wersja: 'x', odpowiedzi: { 'org-jedzenie': '8', 'org-jedzenie::komentarz': dlugi }, etykiety: {} })
check('odpowiedź z komentarzem na 60 000 znaków przyjęta', r25.ok === true, JSON.stringify(r25).slice(0, 100))
const row25 = tab25.data[tab25.data.length - 1]
const kom25 = String(row25[kolKom25])
check('komentarz przycięty do limitu komórki i oznaczony', kom25.length < 50000 && kom25.endsWith(' […]') && kom25.startsWith('xxx'), String(kom25.length))
check('reszta wiersza nietknięta', tab25.data.length === rowsBefore25 + 1 && String(row25[tab25.data[0].indexOf('org-jedzenie')]) === '8')

console.log('\n26. Identyfikatory jako tekst, sufit szerokości')
const r26 = admin({ sesja: '=HYPERLINK("x")', kto: 'Hak', wersja: '+1+1', odpowiedzi: { 'org-jedzenie': '5' }, etykiety: {} })
check('odpowiedź przyjęta', r26.ok === true, JSON.stringify(r26).slice(0, 100))
const row26 = tab25.data[tab25.data.length - 1]
check('identyfikator sesji od „=” zostaje tekstem', row26[1] === '=HYPERLINK("x")', JSON.stringify(row26[1]))
check('wersja od „+” zostaje tekstem', row26[3] === '+1+1', JSON.stringify(row26[3]))
const zaDuzo = {}
for (let i = 0; i < 400; i++) zaDuzo['wymyslone-' + i] = 'x'
const widthBefore26 = tab25.data[0].length
const rows26 = tab25.data.length
const r26b = admin({ sesja: 'sesja-szeroka', kto: 'Szerokopis', wersja: 'x', odpowiedzi: zaDuzo, etykiety: {} })
check('400 wymyślonych pól odrzucone w całości', r26b.ok === false && /za-duzo-kolumn/.test(String(r26b.blad)), JSON.stringify(r26b).slice(0, 100))
check('arkusz nie poszerzył się ani o kolumnę, ani o wiersz', tab25.data[0].length === widthBefore26 && tab25.data.length === rows26, `${widthBefore26}→${tab25.data[0].length}, ${rows26}→${tab25.data.length}`)

console.log('\n27. Nowe pytanie w trakcie zbierania dostaje kolumnę z opisem')
const widthBefore27 = tab25.data[0].length
const r27 = admin({ sesja: 'sesja-nowe', kto: 'Nowak', wersja: 'x', odpowiedzi: { 'org-jedzenie': '6', 'nowe-pytanie': 'tak', 'nowe-pytanie::komentarz': '-uwaga' }, etykiety: { 'nowe-pytanie': '=Nowe pytanie?', 'nowe-pytanie::komentarz': 'Nowe pytanie? [komentarz]' } })
check('odpowiedź przyjęta', r27.ok === true, JSON.stringify(r27).slice(0, 100))
check('dwie nowe kolumny na końcu, w kolejności z odpowiedzi', tab25.data[0].slice(widthBefore27).join('|') === 'nowe-pytanie|nowe-pytanie::komentarz', tab25.data[0].slice(widthBefore27).join('|'))
check('opisy nowych kolumn zapisane jako tekst, nawet od „=”', tab25.data[1][widthBefore27] === '=Nowe pytanie?' && tab25.data[1][widthBefore27 + 1] === 'Nowe pytanie? [komentarz]', JSON.stringify(tab25.data[1].slice(widthBefore27)))
const row27 = tab25.data[tab25.data.length - 1]
check('wartość od „-” w nowej kolumnie zostaje tekstem', row27[widthBefore27 + 1] === '-uwaga', JSON.stringify(row27[widthBefore27 + 1]))
check('siatka arkusza poszerzona na nowe kolumny', tab25.getMaxColumns() >= tab25.data[0].length, `${tab25.getMaxColumns()} vs ${tab25.data[0].length}`)

/* ------------------------------------------------------------- summary --- */

console.log(`\n=== Wynik: ${passed} zdanych, ${failed} oblanych ===\n`)

if (failed === 0) {
  console.log('Podgląd udawanego arkusza (pierwsze 7 kolumn):\n')
  sheet.data.forEach((w, i) => {
    const label = i === 0 ? 'id ' : i === 1 ? 'nag' : `w${i - 1} `
    console.log(
      `${label} | ` +
        w
          .slice(0, 7)
          .map((c) => String(c === undefined ? '' : c).slice(0, 17).padEnd(17))
          .join(' | '),
    )
  })
  console.log('')
}

process.exit(failed === 0 ? 0 : 1)
