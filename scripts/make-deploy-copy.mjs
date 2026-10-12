/**
 * THE COPY OF THE SCRIPT THAT ACTUALLY GETS PASTED INTO GOOGLE.
 *
 * apps-script/Kod.gs in the repository carries a placeholder password and an
 * empty spreadsheet id, because the repository is public. The file this
 * command writes — apps-script/Kod-DO-WKLEJENIA.gs, ignored by git — is the
 * same code with the real values filled in: the password from .env.local
 * (VITE_ARKUSZ_TOKEN, the one the app sends) and the id of the spreadsheet
 * the answers should land in.
 *
 * Regenerate it after EVERY change to Kod.gs. A copy made by hand goes
 * stale without anyone noticing, and the foundation then pastes code that
 * is missing the latest fixes — exactly what happened once already.
 *
 * Run:  node scripts/make-deploy-copy.mjs 1AbC…XyZ
 *       ARKUSZ_ID=1AbC…XyZ npm run deploy-copy
 *
 * The id is the part of the sheet's address between "/d/" and "/edit".
 * Left out, the copy keeps the id empty, which is right only for a script
 * created from inside the sheet itself (Extensions → Apps Script).
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = join(DIR, 'apps-script', 'Kod.gs')
const OUTPUT = join(DIR, 'apps-script', 'Kod-DO-WKLEJENIA.gs')

const sheetId = (process.argv[2] ?? process.env.ARKUSZ_ID ?? '').trim()
if (sheetId && !/^[A-Za-z0-9_-]{20,}$/.test(sheetId)) {
  console.error(`This does not look like a spreadsheet id: ${sheetId}`)
  process.exit(1)
}

const ENV_LOCAL = join(DIR, '.env.local')
function fromEnvLocal(name) {
  try {
    const m = readFileSync(ENV_LOCAL, 'utf8').match(new RegExp(`^${name}=(.*)$`, 'm'))
    return m ? m[1].trim() : ''
  } catch {
    return ''
  }
}
const token = fromEnvLocal('VITE_ARKUSZ_TOKEN')
if (!token) {
  console.error('No VITE_ARKUSZ_TOKEN in .env.local — the copy would carry the placeholder password.')
  process.exit(1)
}
// The maintenance password never reaches the application, so it has no
// VITE_ prefix. It is kept in .env.local next to the other secret; this
// script only reads it and, when it is missing, proposes one to paste there.
const adminToken = fromEnvLocal('ARKUSZ_ADMIN_TOKEN')
if (!adminToken) {
  console.error('No ARKUSZ_ADMIN_TOKEN in .env.local. Add a line like this one and run again:')
  console.error(`ARKUSZ_ADMIN_TOKEN=${randomBytes(18).toString('base64url')}`)
  process.exit(1)
}

const source = readFileSync(SOURCE, 'utf8')
let copy = source
let swapped = 0
copy = copy.replace(/^const TOKEN = '[^']*'/m, () => {
  swapped++
  return `const TOKEN = '${token.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
})
copy = copy.replace(/^const SPREADSHEET_ID = '[^']*'/m, () => {
  swapped++
  return `const SPREADSHEET_ID = '${sheetId}'`
})
copy = copy.replace(/^const ADMIN_TOKEN = '[^']*'/m, () => {
  swapped++
  return `const ADMIN_TOKEN = '${adminToken.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
})
if (swapped !== 3) {
  console.error('Could not find the TOKEN, SPREADSHEET_ID and ADMIN_TOKEN lines in Kod.gs — nothing written.')
  process.exit(1)
}

writeFileSync(OUTPUT, copy, 'utf8')
console.log(`Written: ${OUTPUT}`)
console.log(`  password: ${token.slice(0, 3)}… (from .env.local)`)
console.log(`  spreadsheet id: ${sheetId || '(empty — script bound to its own sheet)'}`)
console.log(`  maintenance password: ${adminToken.slice(0, 3)}… (ARKUSZ_ADMIN_TOKEN in .env.local)`)
console.log('Paste the whole file into the Apps Script editor, then Deploy → Manage deployments → New version.')
