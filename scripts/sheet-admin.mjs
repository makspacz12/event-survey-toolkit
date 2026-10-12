/**
 * MAINTENANCE OF THE LIVE SHEET FROM THE TERMINAL.
 *
 * The deployed script accepts a few maintenance commands next to the
 * ordinary submissions (see `adminAction` in apps-script/Kod.gs). They are
 * guarded by a second password, ARKUSZ_ADMIN_TOKEN, which lives only in
 * .env.local and in the pasted copy of the script — never in the app.
 *
 *   npm run sheet-admin -- status          which code is live, how many rows and columns
 *   npm run sheet-admin -- prepareColumns  the same as the editor's prepareColumns
 *   npm run sheet-admin -- archiwizuj      rename the current tab to "Odpowiedzi-<date>"
 *                                          and build a fresh, empty one — nothing is deleted
 *
 * ARKUSZ_URL / ARKUSZ_TOKEN / ARKUSZ_ADMIN_TOKEN in the environment override
 * .env.local, so the same command can be aimed at scripts/mock-sheet-server.mjs.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..')

function fromEnvLocal(name) {
  try {
    const m = readFileSync(join(DIR, '.env.local'), 'utf8').match(new RegExp(`^${name}=(.*)$`, 'm'))
    return m ? m[1].trim() : ''
  } catch {
    return ''
  }
}

const URL = process.env.ARKUSZ_URL || fromEnvLocal('VITE_ARKUSZ_URL')
const TOKEN = process.env.ARKUSZ_TOKEN || fromEnvLocal('VITE_ARKUSZ_TOKEN')
const ADMIN = process.env.ARKUSZ_ADMIN_TOKEN || fromEnvLocal('ARKUSZ_ADMIN_TOKEN')
const akcja = process.argv[2]

const KNOWN = ['status', 'prepareColumns', 'archiwizuj']
if (!KNOWN.includes(akcja)) {
  console.error(`Podaj polecenie: ${KNOWN.join(' | ')}`)
  process.exit(2)
}
if (!URL || !TOKEN || !ADMIN) {
  console.error('Brakuje VITE_ARKUSZ_URL, VITE_ARKUSZ_TOKEN albo ARKUSZ_ADMIN_TOKEN (w .env.local lub w środowisku).')
  process.exit(2)
}

const t0 = Date.now()
const res = await fetch(URL, {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain;charset=utf-8' },
  body: JSON.stringify({ token: TOKEN, adminToken: ADMIN, akcja, pulapka: '' }),
  redirect: 'follow',
})
const text = await res.text()
let out
try {
  out = JSON.parse(text)
} catch {
  console.error(`Odpowiedź nie jest JSON-em (status ${res.status}):\n${text.slice(0, 400)}`)
  process.exit(1)
}
console.log(`${akcja} → ${Date.now() - t0} ms`)
if (out.raport) {
  console.log(String(out.raport).split('\n').map((l) => '  ' + l).join('\n'))
  delete out.raport
}
console.log(JSON.stringify(out, null, 2))
process.exitCode = out.ok ? 0 : 1
