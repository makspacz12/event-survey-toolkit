/**
 * TEST OF THE APPS SCRIPT LOGIC — without Google, on this machine.
 *
 * Substitutes fakes for Google's objects (SpreadsheetApp, LockService,
 * Utilities…) and runs the real code from apps-script/Kod.gs against a fake
 * sheet. This way logic bugs surface here, not after deployment.
 *
 * Run:  npm run test:script
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CODE = join(__dirname, '..', 'apps-script', 'Kod.gs')

/* -------------------------------------------------- fake Google sheet --- */

function createSheet(name) {
  const data = [] // array of rows, each an array of cells
  let frozen = 0
  const hidden = []

  const cell = (r, c) => {
    while (data.length < r) data.push([])
    const row = data[r - 1]
    while (row.length < c) row.push('')
    return row
  }

  return {
    name,
    data,
    _state: () => ({ frozen, hidden }),
    getName: () => name,
    getLastRow: () => data.length,
    getLastColumn: () => data.reduce((m, w) => Math.max(m, w.length), 0),
    appendRow: (row) => data.push([...row]),
    setFrozenRows: (n) => {
      frozen = n
    },
    hideRows: (n) => hidden.push(n),
    getRange: (r, c, rowCount = 1, colCount = 1) => ({
      getValues: () => {
        const result = []
        for (let i = 0; i < rowCount; i++) {
          const row = []
          for (let j = 0; j < colCount; j++) {
            const src = data[r - 1 + i] || []
            row.push(src[c - 1 + j] === undefined ? '' : src[c - 1 + j])
          }
          result.push(row)
        }
        return result
      },
      getValue: () => {
        const src = data[r - 1] || []
        return src[c - 1] === undefined ? '' : src[c - 1]
      },
      setValue: function (v) {
        const row = cell(r, c)
        row[c - 1] = v
        return this // allows chaining .setFontColor()
      },
      // Writes a whole row at once — that's how `prepareColumns` does it,
      // because at 48 columns individual setValue calls would be 48 round
      // trips to Google.
      setValues: function (matrix) {
        matrix.forEach((row, i) => {
          row.forEach((v, j) => {
            const dst = cell(r + i, c + j)
            dst[c - 1 + j] = v
          })
        })
        return this
      },
      setFontColor: function () {
        return this
      },
      setFontWeight: function () {
        return this
      },
    }),
  }
}

function createFile() {
  const tabs = new Map()
  return {
    tabs,
    getSheetByName: (n) => tabs.get(n) || null,
    insertSheet: (n) => {
      const a = createSheet(n)
      tabs.set(n, a)
      return a
    },
  }
}

/* ------------------------------------------------------ Google environment --- */

const file = createFile()
let consoleErrors = []
let cache = {}
let loggerEntries = []

const environment = {
  SpreadsheetApp: {
    // Default path from the instructions: the script was created from
    // inside the sheet (Extensions → Apps Script), so it's bound to it and
    // the SPREADSHEET_ID constant stays empty. A separate test below checks the
    // other path, i.e. a standalone project with the ID filled in.
    openById: () => file,
    getActiveSpreadsheet: () => file,
  },
  LockService: {
    // `tryLock` returns true/false instead of throwing — the script relies
    // on this version so that under contention it responds with an error
    // instead of crashing.
    getScriptLock: () => ({
      tryLock: () => true,
      waitLock: () => {},
      releaseLock: () => {},
    }),
  },
  // Header cache. The fake has to behave like the real thing: keep a value
  // between calls, since that's the whole point of the savings we're testing.
  CacheService: {
    getScriptCache: () => ({
      get: (k) => (k in cache ? cache[k] : null),
      put: (k, v) => {
        cache[k] = v
      },
      remove: (k) => {
        delete cache[k]
      },
    }),
  },
  Utilities: {
    formatDate: () => '2026-10-18 19:12:04',
  },
  ContentService: {
    MimeType: { JSON: 'json' },
    createTextOutput: (t) => ({ setMimeType: () => ({ tresc: t }) }),
  },
  console: {
    log: () => {},
    error: (m) => consoleErrors.push(String(m)),
  },
  Logger: {
    log: (m) => loggerEntries.push(String(m)),
  },
}

// Run the real script code inside the prepared environment.
const source = readFileSync(CODE, 'utf8')
const names = Object.keys(environment)
const values = Object.values(environment)
const factory = new Function(
  ...names,
  `${source}\n;return { doPost, testSave, prepareColumns, clearCache, SHEET_NAME, TOKEN, FIXED_COLUMNS, SURVEY_COLUMNS };`,
)
const script = factory(...values)

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
consoleErrors = []
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

/* 9. Header cache */
console.log('\n9. Pamięć podręczna nagłówków')
check(
  'nagłówki wylądowały w pamięci podręcznej',
  Object.keys(cache).length > 0,
  Object.keys(cache).join(', '),
)
const cached = JSON.parse(Object.values(cache)[0] || '[]')
check(
  'zapamiętana lista zgadza się z arkuszem',
  cached.length === sheet.data[0].length && cached[4] === 'nps',
  `${cached.length} vs ${sheet.data[0].length}`,
)
// The nastiest cache bug: a stale list after a column was appended. We swap
// in a shortened list and check whether the script detects it and still
// writes the answer to the right columns anyway.
const cacheKey = Object.keys(cache)[0]
cache[cacheKey] = JSON.stringify(cached.slice(0, 3))
const afterStale = result(
  post({
    token: script.TOKEN,
    sesja: 'sesja-cache',
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
cache = {}
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
// Add a column after a question that no longer exists in the survey.
columnsSheet.data[0].push('nps')
columnsSheet.data[1].push('Na ile prawdopodobne, że polecisz…')

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
  'kolumna spoza ankiety NIE została usunięta',
  columnsSheet.data[0].indexOf('nps') !== -1,
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
    expected.push([question.id, question.tresc])
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
