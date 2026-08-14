/**
 * TEST LOGIKI SKRYPTU APPS SCRIPT — bez Google, na tym komputerze.
 *
 * Podstawia atrapy obiektów Google (SpreadsheetApp, LockService, Utilities…)
 * i uruchamia prawdziwy kod z apps-script/Kod.gs na udawanym arkuszu.
 * Dzięki temu błędy logiczne wychodzą tutaj, a nie po wdrożeniu.
 *
 * Uruchomienie:  npm run test-skryptu
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const KOD = join(__dirname, '..', 'apps-script', 'Kod.gs')

/* ---------------------------------------------- atrapa arkusza Google --- */

function utworzArkusz(nazwa) {
  const dane = [] // tablica wierszy, każdy to tablica komórek
  let zamrozone = 0
  const ukryte = []

  const komorka = (w, k) => {
    while (dane.length < w) dane.push([])
    const wiersz = dane[w - 1]
    while (wiersz.length < k) wiersz.push('')
    return wiersz
  }

  return {
    nazwa,
    dane,
    _stan: () => ({ zamrozone, ukryte }),
    getName: () => nazwa,
    getLastRow: () => dane.length,
    getLastColumn: () => dane.reduce((m, w) => Math.max(m, w.length), 0),
    appendRow: (wiersz) => dane.push([...wiersz]),
    setFrozenRows: (n) => {
      zamrozone = n
    },
    hideRows: (n) => ukryte.push(n),
    getRange: (w, k, liczbaW = 1, liczbaK = 1) => ({
      getValues: () => {
        const wynik = []
        for (let i = 0; i < liczbaW; i++) {
          const wiersz = []
          for (let j = 0; j < liczbaK; j++) {
            const r = dane[w - 1 + i] || []
            wiersz.push(r[k - 1 + j] === undefined ? '' : r[k - 1 + j])
          }
          wynik.push(wiersz)
        }
        return wynik
      },
      getValue: () => {
        const r = dane[w - 1] || []
        return r[k - 1] === undefined ? '' : r[k - 1]
      },
      setValue: function (v) {
        const wiersz = komorka(w, k)
        wiersz[k - 1] = v
        return this // pozwala łańcuchować .setFontColor()
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

function utworzPlik() {
  const zakladki = new Map()
  return {
    zakladki,
    getSheetByName: (n) => zakladki.get(n) || null,
    insertSheet: (n) => {
      const a = utworzArkusz(n)
      zakladki.set(n, a)
      return a
    },
  }
}

/* ------------------------------------------------- środowisko Google --- */

const plik = utworzPlik()
let bledyKonsoli = []

const srodowisko = {
  SpreadsheetApp: {
    openById: () => plik,
    getActiveSpreadsheet: () => null, // jak w projekcie samodzielnym
  },
  LockService: {
    getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }),
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
    error: (m) => bledyKonsoli.push(String(m)),
  },
}

// Uruchamiamy prawdziwy kod skryptu w przygotowanym środowisku.
const zrodlo = readFileSync(KOD, 'utf8')
const nazwy = Object.keys(srodowisko)
const wartosci = Object.values(srodowisko)
const fabryka = new Function(
  ...nazwy,
  `${zrodlo}\n;return { doPost, testZapisu, ARKUSZ, TOKEN };`,
)
const skrypt = fabryka(...wartosci)

/* ----------------------------------------------------------- testy --- */

let zdane = 0
let oblane = 0

function sprawdz(opis, warunek, szczegol = '') {
  if (warunek) {
    console.log(`  OK   ${opis}`)
    zdane++
  } else {
    console.log(`  BŁĄD ${opis}${szczegol ? ' → ' + szczegol : ''}`)
    oblane++
  }
}

const post = (dane) =>
  skrypt.doPost({ postData: { contents: JSON.stringify(dane) } })

const wynik = (odp) => JSON.parse(odp.tresc)

console.log('\n=== Test logiki skryptu Apps Script ===\n')

/* 1. Pierwszy zapis tworzy zakładkę i nagłówki */
console.log('1. Pierwsza odpowiedź na pustym arkuszu')
const odp1 = post({
  token: skrypt.TOKEN,
  sesja: 'sesja-A',
  kto: 'anonimowo',
  wersja: '2026-08-13',
  pulapka: '',
  odpowiedzi: { nps: '10', 'org-jedzenie': '7' },
  etykiety: { nps: 'Polecisz znajomemu?', 'org-jedzenie': 'Jak oceniasz jedzenie?' },
})
const arkusz = plik.getSheetByName(skrypt.ARKUSZ)
sprawdz('odpowiedź ok', wynik(odp1).ok === true, JSON.stringify(wynik(odp1)))
sprawdz('zakładka powstała', arkusz !== null)
sprawdz('wiersz 1 to identyfikatory', arkusz.dane[0][4] === 'nps')
sprawdz('wiersz 2 to czytelne nagłówki', arkusz.dane[1][4] === 'Polecisz znajomemu?')
sprawdz('dane zaczynają się w wierszu 3', arkusz.dane.length === 3)
sprawdz('ocena trafiła do właściwej kolumny', arkusz.dane[2][4] === '10')
sprawdz('nagłówki zamrożone', arkusz._stan().zamrozone === 2)
sprawdz('wiersz techniczny ukryty', arkusz._stan().ukryte.includes(1))

/* 2. Druga osoba, te same pytania */
console.log('\n2. Druga osoba, te same pytania')
post({
  token: skrypt.TOKEN,
  sesja: 'sesja-B',
  kto: 'Anna Kowalska',
  wersja: '2026-08-13',
  odpowiedzi: { nps: '8', 'org-jedzenie': 'nie było mnie' },
  etykiety: {},
})
sprawdz('doszedł jeden wiersz', arkusz.dane.length === 4)
sprawdz('kolumny się nie rozjechały', arkusz.dane[3][4] === '8')
sprawdz('„nie było mnie” zapisane', arkusz.dane[3][5] === 'nie było mnie')
sprawdz('imię w kolumnie „Kto wypełnił”', arkusz.dane[3][2] === 'Anna Kowalska')

/* 3. Nowe pytanie w trakcie zbierania */
console.log('\n3. Nowe pytanie dodane w trakcie zbierania')
post({
  token: skrypt.TOKEN,
  sesja: 'sesja-C',
  kto: 'anonimowo',
  wersja: '2026-08-20',
  odpowiedzi: { nps: '9', 'org-jedzenie': '8', 'nowe-pytanie': 'Tak' },
  etykiety: { 'nowe-pytanie': 'Czy parking był wystarczający?' },
})
sprawdz('doszła kolumna na końcu', arkusz.dane[0][6] === 'nowe-pytanie')
sprawdz('z czytelnym nagłówkiem', arkusz.dane[1][6] === 'Czy parking był wystarczający?')
sprawdz('nowa odpowiedź w nowej kolumnie', arkusz.dane[4][6] === 'Tak')
sprawdz(
  'starsze wiersze mają tam pusto',
  arkusz.dane[2][6] === undefined || arkusz.dane[2][6] === '',
)
sprawdz('stare odpowiedzi nietknięte', arkusz.dane[2][4] === '10' && arkusz.dane[3][4] === '8')

/* 4. Ta sama osoba wypełnia drugi raz */
console.log('\n4. Ta sama osoba wysyła ponownie')
post({
  token: skrypt.TOKEN,
  sesja: 'sesja-A',
  kto: 'anonimowo',
  wersja: '2026-08-20',
  odpowiedzi: { nps: '6', 'org-jedzenie': '5' },
  etykiety: {},
})
sprawdz('nowy wiersz dopisany', arkusz.dane.length === 6)
sprawdz(
  'poprzedni oznaczony jako nieaktualny',
  String(arkusz.dane[2][2]).startsWith('[nieaktualne]'),
  String(arkusz.dane[2][2]),
)
sprawdz('najnowsza odpowiedź bez dopisku', arkusz.dane[5][2] === 'anonimowo')
sprawdz('nic nie skasowane', arkusz.dane[2][4] === '10')

/* 5. Złe hasło */
console.log('\n5. Zapytanie ze złym hasłem')
const zle = wynik(post({ token: 'nie-to-haslo', sesja: 'x', odpowiedzi: {} }))
sprawdz('odrzucone', zle.ok === false && zle.blad === 'zly-token')
sprawdz('nic nie dopisano', arkusz.dane.length === 6)

/* 6. Bot wypełnił pole pułapkę */
console.log('\n6. Bot wypełnia ukryte pole')
const bot = wynik(
  post({
    token: skrypt.TOKEN,
    sesja: 'bot',
    pulapka: 'kup tanie zegarki',
    odpowiedzi: { nps: '1' },
  }),
)
sprawdz('udajemy sukces', bot.ok === true)
sprawdz('ale nic nie zapisano', arkusz.dane.length === 6)

/* 7. Uruchomienie doPost ręcznie z edytora */
console.log('\n7. Ręczne uruchomienie doPost z edytora')
bledyKonsoli = []
const reczne = wynik(skrypt.doPost(undefined))
sprawdz('zwraca błąd zamiast się wysypać', reczne.ok === false)
sprawdz(
  'komunikat podpowiada testZapisu',
  String(reczne.blad).includes('testZapisu'),
  String(reczne.blad).slice(0, 80),
)

/* 8. testZapisu z edytora */
console.log('\n8. Funkcja testZapisu (przycisk Uruchom w edytorze)')
skrypt.testZapisu()
sprawdz('dopisała wiersz', arkusz.dane.length === 7)
sprawdz('oznaczony jako testowy', String(arkusz.dane[6][2]).includes('TEST'))

/* ------------------------------------------------------- podsumowanie --- */

console.log(`\n=== Wynik: ${zdane} zdanych, ${oblane} oblanych ===\n`)

if (oblane === 0) {
  console.log('Podgląd udawanego arkusza (pierwsze 7 kolumn):\n')
  arkusz.dane.forEach((w, i) => {
    const etykieta = i === 0 ? 'id ' : i === 1 ? 'nag' : `w${i - 1} `
    console.log(
      `${etykieta} | ` +
        w
          .slice(0, 7)
          .map((c) => String(c === undefined ? '' : c).slice(0, 17).padEnd(17))
          .join(' | '),
    )
  })
  console.log('')
}

process.exit(oblane === 0 ? 0 : 1)
