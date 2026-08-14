/**
 * Generuje PRZYKŁADOWY arkusz wyników — do pokazania Mateuszowi i Markowi,
 * żeby zobaczyli układ danych, zanim cokolwiek wdrożymy.
 *
 * Dane w środku są zmyślone i tak oznaczone. Prawdziwy arkusz powstanie sam,
 * gdy pierwsza osoba wypełni ankietę.
 *
 * Uruchomienie:  npm run przyklad-arkusza
 */
import * as XLSX from 'xlsx'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const KATALOG = join(__dirname, '..')
const ankieta = JSON.parse(
  readFileSync(join(KATALOG, 'src', 'data', 'ankieta.json'), 'utf8'),
)

const KOLUMNY_STALE = [
  'Data wysłania',
  'Identyfikator sesji',
  'Kto wypełnił',
  'Wersja ankiety',
]

// Identyfikatory i czytelne nagłówki w tej samej kolejności.
const idPytan = []
const naglowki = []
for (const s of ankieta.sekcje) {
  for (const p of s.pytania) {
    idPytan.push(p.id)
    naglowki.push(p.tresc)
  }
}

/** Przykładowe wypełnienia: różne ścieżki przez ankietę. */
const przyklady = [
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
      'fn-jury': 'Tak',
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

const wiersze = []

// Wiersz 1: identyfikatory (w prawdziwym arkuszu ukryty, tu zostawiony,
// żeby było widać, skąd system wie, gdzie wpisać odpowiedź).
wiersze.push([...KOLUMNY_STALE, ...idPytan])
// Wiersz 2: czytelne nagłówki.
wiersze.push([...KOLUMNY_STALE, ...naglowki])
// Wiersze 3+: dane.
for (const p of przyklady) {
  wiersze.push([
    p.data,
    p.sesja,
    p.kto,
    '2026-08-13',
    ...idPytan.map((id) => p.odp[id] ?? ''),
  ])
}

const arkusz = XLSX.utils.aoa_to_sheet(wiersze)
arkusz['!cols'] = [
  { wch: 19 },
  { wch: 16 },
  { wch: 24 },
  { wch: 13 },
  ...idPytan.map(() => ({ wch: 26 })),
]
arkusz['!freeze'] = { xSplit: 4, ySplit: 2 }

const skoroszyt = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(skoroszyt, arkusz, 'Odpowiedzi')

// Zakładka „Podsumowanie” — liczby, które same się aktualizują.
const oceny = []
for (const s of ankieta.sekcje) {
  for (const p of s.pytania) {
    if (p.typ === 'skala') oceny.push({ id: p.id, tresc: p.tresc, sekcja: s.tytul })
  }
}
const litera = (n) => {
  let s = ''
  n += 1
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}
const podsumowanie = [
  ['PODSUMOWANIE (liczy się samo, formułami)'],
  [''],
  ['Liczba odpowiedzi', '=COUNTA(Odpowiedzi!A3:A)'],
  [''],
  ['Sekcja', 'Pytanie', 'Średnia', 'Liczba ocen', 'Nie było mnie'],
]
for (const o of oceny) {
  const kol = litera(KOLUMNY_STALE.length + idPytan.indexOf(o.id))
  podsumowanie.push([
    o.sekcja,
    o.tresc,
    `=IFERROR(ROUND(AVERAGE(Odpowiedzi!${kol}3:${kol}),2),"brak")`,
    `=COUNT(Odpowiedzi!${kol}3:${kol})`,
    `=COUNTIF(Odpowiedzi!${kol}3:${kol},"nie było mnie")`,
  ])
}
const ws2 = XLSX.utils.aoa_to_sheet(podsumowanie)
ws2['!cols'] = [{ wch: 24 }, { wch: 62 }, { wch: 10 }, { wch: 12 }, { wch: 14 }]
XLSX.utils.book_append_sheet(skoroszyt, ws2, 'Podsumowanie')

const CEL = join(KATALOG, 'przyklad-arkusza-wynikow.xlsx')
XLSX.writeFile(skoroszyt, CEL)
console.log(`Zapisano ${CEL}`)
console.log(`Kolumn z pytaniami: ${idPytan.length}, przykładowych wierszy: ${przyklady.length}`)
console.log(`Zakładka Podsumowanie: ${oceny.length} pytań ocenianych w skali`)
