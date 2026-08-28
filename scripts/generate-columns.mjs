/**
 * Inserts the full list of sheet columns into the Apps Script.
 *
 * WHY THIS EXISTS
 * The script in the sheet only creates a column once the first response
 * containing that question arrives. That works, but it also means the sheet
 * is nearly empty until someone fills out the survey — you can't see whether
 * the layout is correct. The `prepareColumns` function in the script lets
 * you set up all columns up front, but it needs to know their list. This
 * file generates that list.
 *
 * The list is built with EXACTLY the same loop as in `src/lib/submit.ts`, so
 * the columns in the sheet and the keys sent by the app can never drift apart.
 *
 * Run:  npm run columns
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const DIR = dirname(fileURLToPath(import.meta.url))
const ROOT = join(DIR, '..')

const MARKER_START = '/* === START OF COLUMN LIST (generated) === */'
const MARKER_END = '/* === END OF COLUMN LIST === */'

// Some untracked deployment copies of the script (secrets, .gitignore'd)
// still carry the original Polish markers. Recognize both so this command
// keeps working for those files without requiring them to be edited by hand.
const MARKER_START_LEGACY = '/* === POCZATEK LISTY KOLUMN (generowane) === */'
const MARKER_END_LEGACY = '/* === KONIEC LISTY KOLUMN === */'

/** Builds the [id, label] list in the order the app sends them. */
export function buildColumns(survey) {
  const columns = []
  for (const section of survey.sekcje) {
    for (const p of section.pytania) {
      columns.push([p.id, p.tresc])
      if (p.komentarz) {
        columns.push([`${p.id}::komentarz`, `${p.tresc} [komentarz]`])
      }
    }
  }
  return columns
}

function jsBlock(columns, constName, start, end) {
  const rows = columns
    .map(([id, label]) => `  [${JSON.stringify(id)}, ${JSON.stringify(label)}],`)
    .join('\n')

  return [
    start,
    '/**',
    ' * Full list of question columns: [identifier, human-readable header].',
    ' *',
    ' * DO NOT EDIT BY HAND — this file is generated from `src/data/ankieta.json`',
    ' * by the `npm run columns` command. A manual edit will disappear on the',
    ' * next run, and worse, it will drift from what the app actually sends.',
    ' */',
    `const ${constName} = [`,
    rows,
    ']',
    end,
  ].join('\n')
}

function insert(path, columns) {
  const fullPath = join(ROOT, path)
  const content = readFileSync(fullPath, 'utf8')

  // Some untracked deployment copies of the script (secrets, .gitignore'd)
  // still carry the original Polish markers and constant name. Detect which
  // style this file uses so it keeps working without being edited by hand.
  let start = MARKER_START
  let end = MARKER_END
  let constName = 'SURVEY_COLUMNS'
  let from = content.indexOf(start)
  let to = content.indexOf(end)

  if (from === -1 || to === -1) {
    start = MARKER_START_LEGACY
    end = MARKER_END_LEGACY
    constName = 'KOLUMNY_ANKIETY'
    from = content.indexOf(start)
    to = content.indexOf(end)
  }

  if (from === -1 || to === -1) {
    throw new Error(
      `File ${path} has no column-list markers. ` +
        'Add them, or check whether the file was overwritten.',
    )
  }

  const block = jsBlock(columns, constName, start, end)
  const updated = content.slice(0, from) + block + content.slice(to + end.length)

  if (updated === content) return false
  writeFileSync(fullPath, updated, 'utf8')
  return true
}

const survey = JSON.parse(
  readFileSync(join(ROOT, 'src/data/ankieta.json'), 'utf8'),
)
const columns = buildColumns(survey)

const files = [
  'apps-script/Kod.gs',
  'apps-script/Kod-DO-WKLEJENIA.gs',
  'apps-script/Kod-NOWY-ARKUSZ.gs',
]
for (const file of files) {
  try {
    const changed = insert(file, columns)
    console.log(`${changed ? 'updated' : 'unchanged'}: ${file}`)
  } catch (e) {
    console.log(`skipped: ${file} — ${e.message}`)
  }
}

console.log('')
console.log(`Question columns: ${columns.length} (+ 4 fixed = ${columns.length + 4})`)
