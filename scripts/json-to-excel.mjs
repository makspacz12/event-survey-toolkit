/**
 * JSON → EXCEL. Generates `ankieta.xlsx` from the current questions.
 *
 * Why: Mateusz and Marek should edit questions, not code. This script builds
 * a spreadsheet with the current survey content — you send them the file,
 * they fix the wording in Excel, send it back, and `excel-to-json.mjs` pulls
 * the changes back in.
 *
 * Run:  npm run pytania:do-excela
 */
import * as XLSX from 'xlsx'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIR = join(__dirname, '..')
const SOURCE = join(DIR, 'src', 'data', 'ankieta.json')
const TARGET = join(DIR, 'ankieta.xlsx')

const survey = JSON.parse(readFileSync(SOURCE, 'utf8'))

const optionText = (o) => (typeof o === 'string' ? o : o.tekst)
const optionPhoto = (o) => (typeof o === 'string' ? '' : (o.zdjecie ?? ''))

const rows = []

for (const section of survey.sekcje) {
  for (const p of section.pytania) {
    rows.push({
      'ID sekcji': section.id,
      'Sekcja (tytuł)': section.tytul,
      'Sekcja (skrót)': section.tytul_krotki ?? '',
      Kiedy: section.kiedy ?? '',
      'Opis sekcji': section.opis ?? '',
      'Pokaż sekcję gdy': section.pokaz_jesli
        ? JSON.stringify(section.pokaz_jesli)
        : '',
      'ID pytania': p.id,
      Typ: p.typ,
      'Treść pytania': p.tresc,
      'Opcje (oddziel |)': (p.opcje ?? []).map(optionText).join(' | '),
      'Zdjęcia opcji (oddziel |)': (p.opcje ?? []).some(optionPhoto)
        ? (p.opcje ?? []).map(optionPhoto).join(' | ')
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

const sheet = XLSX.utils.json_to_sheet(rows)
sheet['!cols'] = [
  { wch: 16 }, { wch: 22 }, { wch: 14 }, { wch: 26 }, { wch: 40 }, { wch: 34 },
  { wch: 22 }, { wch: 14 }, { wch: 60 }, { wch: 50 }, { wch: 40 }, { wch: 28 },
  { wch: 34 }, { wch: 6 }, { wch: 6 }, { wch: 18 }, { wch: 20 }, { wch: 22 },
  { wch: 18 }, { wch: 30 },
]
sheet['!freeze'] = { xSplit: 0, ySplit: 1 }

const workbook = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(workbook, sheet, 'Pytania')

// Second tab: instructions for a non-technical person.
const help = XLSX.utils.aoa_to_sheet([
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
help['!cols'] = [{ wch: 20 }, { wch: 100 }]
XLSX.utils.book_append_sheet(workbook, help, 'Instrukcja')

XLSX.writeFile(workbook, TARGET)
console.log(`Saved ${TARGET}`)
console.log(`Questions: ${rows.length}, sections: ${survey.sekcje.length}`)
