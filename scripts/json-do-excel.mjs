/**
 * JSON → EXCEL. Generuje `ankieta.xlsx` z aktualnych pytań.
 *
 * Po co: Mateusz i Marek mają edytować pytania, nie kod. Ten skrypt tworzy
 * arkusz z obecną treścią ankiety — wysyłasz im plik, oni poprawiają teksty
 * w Excelu, odsyłają, a `excel-do-json.mjs` wciąga zmiany z powrotem.
 *
 * Uruchomienie:  npm run pytania:do-excela
 */
import * as XLSX from 'xlsx'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const KATALOG = join(__dirname, '..')
const ZRODLO = join(KATALOG, 'src', 'data', 'ankieta.json')
const CEL = join(KATALOG, 'ankieta.xlsx')

const ankieta = JSON.parse(readFileSync(ZRODLO, 'utf8'))

const opcjaTekst = (o) => (typeof o === 'string' ? o : o.tekst)
const opcjaZdjecie = (o) => (typeof o === 'string' ? '' : (o.zdjecie ?? ''))

const wiersze = []

for (const sekcja of ankieta.sekcje) {
  for (const p of sekcja.pytania) {
    wiersze.push({
      'ID sekcji': sekcja.id,
      'Sekcja (tytuł)': sekcja.tytul,
      'Sekcja (skrót)': sekcja.tytul_krotki ?? '',
      Kiedy: sekcja.kiedy ?? '',
      'Opis sekcji': sekcja.opis ?? '',
      'Pokaż sekcję gdy': sekcja.pokaz_jesli
        ? JSON.stringify(sekcja.pokaz_jesli)
        : '',
      'ID pytania': p.id,
      Typ: p.typ,
      'Treść pytania': p.tresc,
      'Opcje (oddziel |)': (p.opcje ?? []).map(opcjaTekst).join(' | '),
      'Zdjęcia opcji (oddziel |)': (p.opcje ?? []).some(opcjaZdjecie)
        ? (p.opcje ?? []).map(opcjaZdjecie).join(' | ')
        : '',
      'Zdjęcie pytania': p.zdjecie ?? '',
      'Pokaż pytanie gdy': p.pokaz_jesli ? JSON.stringify(p.pokaz_jesli) : '',
      Min: p.min ?? '',
      Max: p.max ?? '',
      'Wymagane (tak/nie)': p.wymagane ? 'tak' : 'nie',
      'Nieobecność (tak/nie)': p.nieobecnosc ? 'tak' : 'nie',
      'Tekst nieobecności': p.nieobecnosc_tekst ?? '',
      'Komentarz (tak/nie)': p.komentarz ? 'tak' : 'nie',
      Podpowiedź: p.placeholder ?? '',
    })
  }
}

const arkusz = XLSX.utils.json_to_sheet(wiersze)
arkusz['!cols'] = [
  { wch: 16 }, { wch: 22 }, { wch: 14 }, { wch: 26 }, { wch: 40 }, { wch: 34 },
  { wch: 22 }, { wch: 14 }, { wch: 60 }, { wch: 50 }, { wch: 40 }, { wch: 28 },
  { wch: 34 }, { wch: 6 }, { wch: 6 }, { wch: 18 }, { wch: 20 }, { wch: 22 },
  { wch: 18 }, { wch: 30 },
]
arkusz['!freeze'] = { xSplit: 0, ySplit: 1 }

const skoroszyt = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(skoroszyt, arkusz, 'Pytania')

// Druga zakładka: instrukcja dla osoby nietechnicznej.
const pomoc = XLSX.utils.aoa_to_sheet([
  ['JAK EDYTOWAĆ TĘ ANKIETĘ'],
  [''],
  ['1.', 'Zmieniaj treść pytań, opcje, kolejność wierszy — normalnie, jak w każdym arkuszu.'],
  ['2.', 'NIE ZMIENIAJ kolumny „ID pytania". To jak PESEL pytania — po nim wiążą się zapisane odpowiedzi.'],
  ['', 'Nowe pytanie = nowy, własny ID (małe litery, myślniki, np. "org-parking").'],
  ['3.', 'Kolumna „Typ" przyjmuje tylko: skala, tak_nie, jeden_wybor, wiele_wyborow, tekst.'],
  ['4.', 'Opcje odpowiedzi oddzielaj znakiem | (pionowa kreska), np: Tak | Nie | Nie wiem'],
  ['5.', 'Pytania z tej samej sekcji muszą mieć to samo „ID sekcji" i leżeć obok siebie.'],
  ['6.', 'Zapisz plik jako ankieta.xlsx w głównym katalogu aplikacji i uruchom: npm run pytania:z-excela'],
  [''],
  ['TYPY PYTAŃ'],
  ['skala', 'suwak liczbowy — wypełnij kolumny Min i Max (np. 1 i 10)'],
  ['tak_nie', 'dwa przyciski Tak / Nie'],
  ['jeden_wybor', 'lista opcji, można wybrać jedną'],
  ['wiele_wyborow', 'lista opcji, można wybrać kilka'],
  ['tekst', 'pole na dłuższą wypowiedź'],
  [''],
  ['KOLUMNY DODATKOWE'],
  ['Wymagane', '„tak" = nie da się zakończyć ankiety bez odpowiedzi'],
  ['Nieobecność', '„tak" = przy pytaniu pojawi się przycisk „nie było mnie na tym"'],
  ['Komentarz', '„tak" = pod pytaniem pojawi się opcjonalne pole na komentarz'],
  ['Zdjęcie pytania', 'ścieżka do pliku, np. /prelegenci/grzegorz-rys.jpg'],
  ['Pokaż sekcję gdy', 'warunek w formacie JSON — zostaw bez zmian, jeśli nie wiesz, co to'],
])
pomoc['!cols'] = [{ wch: 20 }, { wch: 100 }]
XLSX.utils.book_append_sheet(skoroszyt, pomoc, 'Instrukcja')

XLSX.writeFile(skoroszyt, CEL)
console.log(`Zapisano ${CEL}`)
console.log(`Pytań: ${wiersze.length}, sekcji: ${ankieta.sekcje.length}`)
