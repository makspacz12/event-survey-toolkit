/**
 * EXCEL → JSON. Pulls questions from `ankieta.xlsx` into `src/data/ankieta.json`.
 *
 * This lets the survey content be authored in Excel (Mateusz, Marek), while
 * the app just renders it. The script VALIDATES the data and on error does
 * not overwrite anything — better to stop with a message than load a broken
 * survey.
 *
 * Run:  npm run pytania:z-excela
 */
import * as XLSX from 'xlsx'
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIR = join(__dirname, '..')
const SOURCE = join(DIR, 'ankieta.xlsx')
const TARGET = join(DIR, 'src', 'data', 'ankieta.json')

const TYPES = ['skala', 'tak_nie', 'jeden_wybor', 'wiele_wyborow', 'tekst']

if (!existsSync(SOURCE)) {
  console.error(`ERROR: file not found ${SOURCE}`)
  console.error('First generate the template:  npm run pytania:do-excela')
  process.exit(1)
}

// XLSX.readFile() doesn't exist in the ESM build (no fs access) —
// we read the file with Node and pass in a buffer instead.
const workbook = XLSX.read(readFileSync(SOURCE), { type: 'buffer' })
const sheet = workbook.Sheets['Pytania'] ?? workbook.Sheets[workbook.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })

const errors = []
const warnings = []
const seenIds = new Set()

const text = (v) => String(v ?? '').trim()
const boolYes = (v) => text(v).toLowerCase() === 'tak'
const numberOrUndefined = (v) => {
  const s = text(v)
  if (s === '') return undefined
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}
/** Option list — empty entries are dropped ("a | b |" is two options). */
const split = (v) =>
  text(v)
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)

/**
 * Photo list — empty entries MUST be kept, because position in the list
 * ties a photo to an option. When one option has a photo and another
 * doesn't ("photo1 |  | photo3"), dropping the empty slot would shift every
 * photo by one and swap people's faces.
 */
const splitKeepingEmpty = (v) => {
  const s = text(v)
  if (s === '') return []
  return s.split('|').map((x) => x.trim())
}

// Sections are built in the order they appear in the sheet.
const sectionsMap = new Map()

rows.forEach((w, i) => {
  const rowNr = i + 2 // +1 for header, +1 because Excel counts from 1
  const sectionId = text(w['ID sekcji'])
  const questionId = text(w['ID pytania'])
  const type = text(w['Typ'])
  const content = text(w['Treść pytania'])

  if (!sectionId) errors.push(`row ${rowNr}: missing "ID sekcji"`)
  if (!questionId) errors.push(`row ${rowNr}: missing "ID pytania"`)
  if (!content) errors.push(`row ${rowNr}: missing question content`)
  if (!TYPES.includes(type))
    errors.push(
      `row ${rowNr}: unknown type "${type}" (allowed: ${TYPES.join(', ')})`,
    )
  if (questionId && seenIds.has(questionId))
    errors.push(`row ${rowNr}: question ID "${questionId}" already exists`)
  if (questionId) seenIds.add(questionId)

  const optionTexts = split(w['Opcje (oddziel |)'])
  const optionPhotos = splitKeepingEmpty(w['Zdjęcia opcji (oddziel |)'])

  if ((type === 'jeden_wybor' || type === 'wiele_wyborow') && optionTexts.length === 0)
    errors.push(`row ${rowNr}: type "${type}" requires a list of options`)
  if (optionPhotos.length > 0 && optionPhotos.length !== optionTexts.length)
    warnings.push(
      `row ${rowNr}: photo count (${optionPhotos.length}) doesn't match option count (${optionTexts.length}) — photos skipped`,
    )

  if (!sectionsMap.has(sectionId)) {
    let showIf
    const raw = text(w['Pokaż sekcję gdy'])
    if (raw) {
      try {
        showIf = JSON.parse(raw)
      } catch {
        errors.push(
          `row ${rowNr}: "Pokaż sekcję gdy" is not valid JSON: ${raw}`,
        )
      }
    }
    sectionsMap.set(sectionId, {
      id: sectionId,
      tytul: text(w['Sekcja (tytuł)']) || sectionId,
      ...(text(w['Sekcja (skrót)']) ? { tytul_krotki: text(w['Sekcja (skrót)']) } : {}),
      ...(text(w['Kiedy']) ? { kiedy: text(w['Kiedy']) } : {}),
      ...(text(w['Opis sekcji']) ? { opis: text(w['Opis sekcji']) } : {}),
      ...(showIf ? { pokaz_jesli: showIf } : {}),
      pytania: [],
    })
  }

  const usePhotos =
    optionPhotos.length === optionTexts.length && optionPhotos.some(Boolean)
  const options = optionTexts.map((t, idx) =>
    usePhotos && optionPhotos[idx] ? { tekst: t, zdjecie: optionPhotos[idx] } : t,
  )

  // Condition for showing a single question (e.g. we only ask about the
  // jury to someone who was at the final). Same format as the section condition.
  let showQuestionIf
  const rawCondition = text(w['Pokaż pytanie gdy'])
  if (rawCondition) {
    try {
      showQuestionIf = JSON.parse(rawCondition)
    } catch {
      errors.push(
        `row ${rowNr}: "Pokaż pytanie gdy" is not valid JSON: ${rawCondition}`,
      )
    }
  }

  const min = numberOrUndefined(w['Min'])
  const max = numberOrUndefined(w['Max'])
  if (type === 'skala' && (min === undefined || max === undefined))
    warnings.push(
      `row ${rowNr}: scale without Min/Max — defaulting to 1–10`,
    )

  sectionsMap.get(sectionId).pytania.push({
    id: questionId,
    typ: type,
    tresc: content,
    ...(options.length ? { opcje: options } : {}),
    ...(min !== undefined ? { min } : {}),
    ...(max !== undefined ? { max } : {}),
    ...(boolYes(w['Wymagane (tak/nie)']) ? { wymagane: true } : {}),
    ...(boolYes(w['Nieobecność (tak/nie)']) ? { nieobecnosc: true } : {}),
    ...(text(w['Tekst nieobecności'])
      ? { nieobecnosc_tekst: text(w['Tekst nieobecności']) }
      : {}),
    ...(boolYes(w['Komentarz (tak/nie)']) ? { komentarz: true } : {}),
    ...(text(w['Zdjęcie pytania']) ? { zdjecie: text(w['Zdjęcie pytania']) } : {}),
    ...(showQuestionIf ? { pokaz_jesli: showQuestionIf } : {}),
    ...(text(w['Podpowiedź']) ? { placeholder: text(w['Podpowiedź']) } : {}),
  })
})

if (errors.length > 0) {
  console.error(`\nFOUND ${errors.length} ERROR(S) — file was NOT changed:\n`)
  errors.forEach((e) => console.error(`  • ${e}`))
  console.error('\nFix the sheet and run again.\n')
  process.exit(1)
}

// Keep the survey header from the existing JSON (title/subtitle).
const previous = JSON.parse(readFileSync(TARGET, 'utf8'))
const updated = {
  tytul: previous.tytul,
  podtytul: previous.podtytul,
  sekcje: [...sectionsMap.values()],
}

// Backup of the previous version — in case the import turns out wrong.
copyFileSync(TARGET, `${TARGET}.bak`)
writeFileSync(TARGET, JSON.stringify(updated, null, 2) + '\n', 'utf8')

const questionCount = updated.sekcje.reduce((s, x) => s + x.pytania.length, 0)
console.log(`Saved ${TARGET}`)
console.log(`Sections: ${updated.sekcje.length}, questions: ${questionCount}`)
console.log(`Backup of previous version: ${TARGET}.bak`)
if (warnings.length > 0) {
  console.log(`\nWarnings (${warnings.length}):`)
  warnings.forEach((o) => console.log(`  • ${o}`))
}
