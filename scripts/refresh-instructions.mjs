/**
 * REFRESH THE CODE IN THE FOUNDATION'S INSTRUCTIONS
 *
 * `INSTRUKCJA-DLA-CTN.md` contains a full copy of `apps-script/Kod.gs` — so
 * that a non-technical person has everything in one file and doesn't have to
 * look anything up. The copy has a downside though: with every script fix it
 * quietly goes stale, and the foundation ends up pasting an outdated version.
 *
 * This script rewrites that one code block from the source file.
 * Run after EVERY change to Kod.gs:  npm run refresh-instructions
 *
 * Check without writing (useful before sending the document):
 *   npm run refresh-instructions -- --check
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..')
const CODE_FILE = join(DIR, 'apps-script', 'Kod.gs')
const DOC_FILE = join(DIR, 'INSTRUKCJA-DLA-CTN.md')

const checkOnly = process.argv.includes('--check')

const code = readFileSync(CODE_FILE, 'utf8').trimEnd()
const doc = readFileSync(DOC_FILE, 'utf8')

// Block to replace: the last ```javascript block in the document, i.e. the
// one under the "Kod do wklejenia" heading. Earlier blocks are short examples.
const HEADING = '## Kod do wklejenia'
const sectionStart = doc.indexOf(HEADING)
if (sectionStart === -1) {
  console.error(`ERROR: heading "${HEADING}" not found in the instructions.`)
  process.exit(1)
}

const openTag = doc.indexOf('```javascript', sectionStart)
const contentStart = doc.indexOf('\n', openTag) + 1
const closeTag = doc.indexOf('\n```', contentStart)

if (openTag === -1 || closeTag === -1) {
  console.error('ERROR: no code block found under this heading.')
  process.exit(1)
}

const inDoc = doc.slice(contentStart, closeTag).trimEnd()

if (inDoc === code) {
  console.log('Instructions are up to date — the code in the document matches Kod.gs.')
  process.exit(0)
}

const lineDiff = code.split('\n').length - inDoc.split('\n').length

if (checkOnly) {
  console.error(
    'WARNING: the code in the instructions DIFFERS from apps-script/Kod.gs ' +
      `(difference of ${lineDiff >= 0 ? '+' : ''}${lineDiff} lines).`,
  )
  console.error('Run: npm run refresh-instructions')
  process.exit(1)
}

writeFileSync(
  DOC_FILE,
  doc.slice(0, contentStart) + code + doc.slice(closeTag),
  'utf8',
)

console.log(
  `Updated the code in the instructions (${inDoc.split('\n').length} → ` +
    `${code.split('\n').length} lines).`,
)
