/**
 * EXCEL → JSON. Wciąga pytania z `ankieta.xlsx` do `src/data/ankieta.json`.
 *
 * Dzięki temu treść ankiety powstaje w Excelu (Mateusz, Marek), a aplikacja
 * tylko ją renderuje. Skrypt WALIDUJE dane i przy błędzie nie nadpisuje
 * niczego — lepiej zatrzymać się z komunikatem niż wgrać popsutą ankietę.
 *
 * Uruchomienie:  npm run pytania:z-excela
 */
import * as XLSX from 'xlsx'
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const KATALOG = join(__dirname, '..')
const ZRODLO = join(KATALOG, 'ankieta.xlsx')
const CEL = join(KATALOG, 'src', 'data', 'ankieta.json')

const TYPY = ['skala', 'tak_nie', 'jeden_wybor', 'wiele_wyborow', 'tekst']

if (!existsSync(ZRODLO)) {
  console.error(`BŁĄD: nie znaleziono pliku ${ZRODLO}`)
  console.error('Najpierw wygeneruj szablon:  npm run pytania:do-excela')
  process.exit(1)
}

// XLSX.readFile() nie istnieje w buildzie ESM (brak dostępu do fs) —
// wczytujemy plik Nodem i podajemy bufor.
const skoroszyt = XLSX.read(readFileSync(ZRODLO), { type: 'buffer' })
const arkusz = skoroszyt.Sheets['Pytania'] ?? skoroszyt.Sheets[skoroszyt.SheetNames[0]]
const wiersze = XLSX.utils.sheet_to_json(arkusz, { defval: '' })

const bledy = []
const ostrzezenia = []
const widzianeId = new Set()

const tekst = (v) => String(v ?? '').trim()
const boolTak = (v) => tekst(v).toLowerCase() === 'tak'
const liczbaLubBrak = (v) => {
  const s = tekst(v)
  if (s === '') return undefined
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}
/** Lista opcji — puste pozycje odpadają („a | b |" to dwie opcje). */
const rozdziel = (v) =>
  tekst(v)
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)

/**
 * Lista zdjęć — puste pozycje MUSZĄ zostać, bo pozycja w liście wiąże zdjęcie
 * z opcją. Gdy ktoś ma zdjęcie, a ktoś inny nie („foto1 |  | foto3"), usunięcie
 * pustego miejsca przesunęłoby wszystkie zdjęcia o jedno i podmieniło ludziom
 * twarze.
 */
const rozdzielZPustymi = (v) => {
  const s = tekst(v)
  if (s === '') return []
  return s.split('|').map((x) => x.trim())
}

// Sekcje budujemy w kolejności pojawiania się w arkuszu.
const sekcjeMap = new Map()

wiersze.forEach((w, i) => {
  const nrWiersza = i + 2 // +1 nagłówek, +1 bo Excel liczy od 1
  const idSekcji = tekst(w['ID sekcji'])
  const idPytania = tekst(w['ID pytania'])
  const typ = tekst(w['Typ'])
  const tresc = tekst(w['Treść pytania'])

  if (!idSekcji) bledy.push(`wiersz ${nrWiersza}: brak „ID sekcji"`)
  if (!idPytania) bledy.push(`wiersz ${nrWiersza}: brak „ID pytania"`)
  if (!tresc) bledy.push(`wiersz ${nrWiersza}: brak treści pytania`)
  if (!TYPY.includes(typ))
    bledy.push(
      `wiersz ${nrWiersza}: nieznany typ „${typ}" (dozwolone: ${TYPY.join(', ')})`,
    )
  if (idPytania && widzianeId.has(idPytania))
    bledy.push(`wiersz ${nrWiersza}: ID pytania „${idPytania}" już istnieje`)
  if (idPytania) widzianeId.add(idPytania)

  const opcjeTeksty = rozdziel(w['Opcje (oddziel |)'])
  const opcjeZdjecia = rozdzielZPustymi(w['Zdjęcia opcji (oddziel |)'])

  if ((typ === 'jeden_wybor' || typ === 'wiele_wyborow') && opcjeTeksty.length === 0)
    bledy.push(`wiersz ${nrWiersza}: typ „${typ}" wymaga listy opcji`)
  if (opcjeZdjecia.length > 0 && opcjeZdjecia.length !== opcjeTeksty.length)
    ostrzezenia.push(
      `wiersz ${nrWiersza}: liczba zdjęć (${opcjeZdjecia.length}) nie zgadza się z liczbą opcji (${opcjeTeksty.length}) — zdjęcia pominięte`,
    )

  if (!sekcjeMap.has(idSekcji)) {
    let pokaz
    const surowy = tekst(w['Pokaż sekcję gdy'])
    if (surowy) {
      try {
        pokaz = JSON.parse(surowy)
      } catch {
        bledy.push(
          `wiersz ${nrWiersza}: „Pokaż sekcję gdy" nie jest poprawnym JSON-em: ${surowy}`,
        )
      }
    }
    sekcjeMap.set(idSekcji, {
      id: idSekcji,
      tytul: tekst(w['Sekcja (tytuł)']) || idSekcji,
      ...(tekst(w['Sekcja (skrót)']) ? { tytul_krotki: tekst(w['Sekcja (skrót)']) } : {}),
      ...(tekst(w['Kiedy']) ? { kiedy: tekst(w['Kiedy']) } : {}),
      ...(tekst(w['Opis sekcji']) ? { opis: tekst(w['Opis sekcji']) } : {}),
      ...(pokaz ? { pokaz_jesli: pokaz } : {}),
      pytania: [],
    })
  }

  const uzyjZdjec =
    opcjeZdjecia.length === opcjeTeksty.length && opcjeZdjecia.some(Boolean)
  const opcje = opcjeTeksty.map((t, idx) =>
    uzyjZdjec && opcjeZdjecia[idx] ? { tekst: t, zdjecie: opcjeZdjecia[idx] } : t,
  )

  // Warunek pokazania pojedynczego pytania (np. o jury pytamy tylko tego,
  // kto był na finale). Format taki sam jak warunek sekcji.
  let pokazPytanie
  const surowyWarunek = tekst(w['Pokaż pytanie gdy'])
  if (surowyWarunek) {
    try {
      pokazPytanie = JSON.parse(surowyWarunek)
    } catch {
      bledy.push(
        `wiersz ${nrWiersza}: „Pokaż pytanie gdy" nie jest poprawnym JSON-em: ${surowyWarunek}`,
      )
    }
  }

  const min = liczbaLubBrak(w['Min'])
  const max = liczbaLubBrak(w['Max'])
  if (typ === 'skala' && (min === undefined || max === undefined))
    ostrzezenia.push(
      `wiersz ${nrWiersza}: skala bez Min/Max — użyję domyślnych 1–10`,
    )

  sekcjeMap.get(idSekcji).pytania.push({
    id: idPytania,
    typ,
    tresc,
    ...(opcje.length ? { opcje } : {}),
    ...(min !== undefined ? { min } : {}),
    ...(max !== undefined ? { max } : {}),
    ...(boolTak(w['Wymagane (tak/nie)']) ? { wymagane: true } : {}),
    ...(boolTak(w['Nieobecność (tak/nie)']) ? { nieobecnosc: true } : {}),
    ...(tekst(w['Tekst nieobecności'])
      ? { nieobecnosc_tekst: tekst(w['Tekst nieobecności']) }
      : {}),
    ...(boolTak(w['Komentarz (tak/nie)']) ? { komentarz: true } : {}),
    ...(tekst(w['Zdjęcie pytania']) ? { zdjecie: tekst(w['Zdjęcie pytania']) } : {}),
    ...(pokazPytanie ? { pokaz_jesli: pokazPytanie } : {}),
    ...(tekst(w['Podpowiedź']) ? { placeholder: tekst(w['Podpowiedź']) } : {}),
  })
})

if (bledy.length > 0) {
  console.error(`\nZNALEZIONO ${bledy.length} BŁĄD(ÓW) — plik NIE został zmieniony:\n`)
  bledy.forEach((b) => console.error(`  • ${b}`))
  console.error('\nPopraw arkusz i uruchom ponownie.\n')
  process.exit(1)
}

// Zachowaj nagłówek ankiety z dotychczasowego JSON-a (tytuł/podtytuł).
const stary = JSON.parse(readFileSync(CEL, 'utf8'))
const nowa = {
  tytul: stary.tytul,
  podtytul: stary.podtytul,
  sekcje: [...sekcjeMap.values()],
}

// Kopia zapasowa poprzedniej wersji — gdyby import okazał się nietrafiony.
copyFileSync(CEL, `${CEL}.bak`)
writeFileSync(CEL, JSON.stringify(nowa, null, 2) + '\n', 'utf8')

const liczbaPytan = nowa.sekcje.reduce((s, x) => s + x.pytania.length, 0)
console.log(`Zapisano ${CEL}`)
console.log(`Sekcji: ${nowa.sekcje.length}, pytań: ${liczbaPytan}`)
console.log(`Kopia poprzedniej wersji: ${CEL}.bak`)
if (ostrzezenia.length > 0) {
  console.log(`\nOstrzeżenia (${ostrzezenia.length}):`)
  ostrzezenia.forEach((o) => console.log(`  • ${o}`))
}
