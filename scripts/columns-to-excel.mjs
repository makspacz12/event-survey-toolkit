/**
 * Builds an .xlsx file with the response-sheet column layout.
 *
 * WHY THIS EXISTS
 * Before anyone fills out the survey, the sheet is empty and you can't tell
 * whether the column layout matches the questions. This file puts that
 * layout on paper — to check, to send to someone, or to paste straight into
 * the sheet.
 *
 * The list is built with the same loop as in `src/lib/submit.ts`, so it can
 * never drift from what the app actually sends.
 *
 * Run:  npm run columns:excel
 */

import * as XLSX from 'xlsx'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const DIR = dirname(fileURLToPath(import.meta.url))
const ROOT = join(DIR, '..')
const OUTPUT = join(ROOT, 'Kolumny-ankiety-MCL-2026.xlsx')

/** Columns the sheet script always sets up, regardless of the questions. */
const FIXED = [
  'Data wysłania',
  'Identyfikator sesji',
  'Kto wypełnił',
  'Wersja ankiety',
]

/** Technical question type to a human-readable description. */
const TYPE_LABEL = {
  skala: 'ocena 1–10',
  tak_nie: 'Tak / Nie',
  jeden_wybor: 'jedna osoba z listy',
  wiele_wyborow: 'kilka opcji z listy',
  tekst: 'tekst',
}

const survey = JSON.parse(
  readFileSync(join(ROOT, 'src/data/ankieta.json'), 'utf8'),
)

const ids = [...FIXED]
const labels = [...FIXED]
const types = FIXED.map(() => '(wypełnia skrypt)')
const sections = FIXED.map(() => '—')

for (const section of survey.sekcje) {
  for (const p of section.pytania) {
    const kind = TYPE_LABEL[p.typ] || p.typ
    ids.push(p.id)
    labels.push(p.tresc)
    types.push(kind + (p.wymagane ? ', wymagane' : ''))
    sections.push(section.tytul)

    if (p.komentarz) {
      ids.push(`${p.id}::komentarz`)
      labels.push(`${p.tresc} [komentarz]`)
      types.push('tekst, opcjonalny')
      sections.push(section.tytul)
    }
  }
}

const workbook = XLSX.utils.book_new()

// Tab 1: exactly the two rows that need to end up in the sheet.
// Order and content must match to the letter — hence no decoration.
const toPaste = XLSX.utils.aoa_to_sheet([ids, labels])
toPaste['!cols'] = ids.map((id) => ({
  wch: Math.min(Math.max(id.length + 2, 14), 40),
}))
XLSX.utils.book_append_sheet(workbook, toPaste, 'Odpowiedzi')

// Tab 2: the same list vertically. Forty-eight columns side by side reads
// terribly, so there's a separate view for browsing.
const listing = [
  ['Nr kolumny', 'Litera', 'Identyfikator', 'Treść pytania', 'Rodzaj odpowiedzi', 'Sekcja ankiety'],
]
ids.forEach((id, i) => {
  listing.push([i + 1, XLSX.utils.encode_col(i), id, labels[i], types[i], sections[i]])
})
const listingSheet = XLSX.utils.aoa_to_sheet(listing)
listingSheet['!cols'] = [
  { wch: 11 },
  { wch: 8 },
  { wch: 30 },
  { wch: 70 },
  { wch: 22 },
  { wch: 26 },
]
XLSX.utils.book_append_sheet(workbook, listingSheet, 'Spis kolumn')

writeFileSync(OUTPUT, XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }))

console.log(`Done: ${OUTPUT}`)
console.log(`Columns: ${ids.length} (${FIXED.length} fixed + ${ids.length - FIXED.length} from questions)`)
