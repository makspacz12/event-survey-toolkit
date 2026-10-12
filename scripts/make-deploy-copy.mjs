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

// The person pasting this file reads only its top. The repository's header
// explains how to pick a password and create a deployment from scratch —
// here every value is already filled in, so that header would only mislead.
// It is replaced by a Polish one that says what to do and what not to touch.
const sheetName = source.match(/^const SHEET_NAME = '([^']*)'/m)?.[1]
const scriptVersion = source.match(/^const SCRIPT_VERSION = '([^']*)'/m)?.[1]
const headerEnd = copy.search(/^const SCRIPT_VERSION = '[^']*'\r?\n/m)
if (!sheetName || !scriptVersion || headerEnd === -1) {
  console.error('Could not find the SHEET_NAME / SCRIPT_VERSION lines in Kod.gs — nothing written.')
  process.exit(1)
}
const headerEndLine = copy.indexOf('\n', headerEnd) + 1
const quote = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
const polishHeader = `/**
 * ANKIETA MASTERCLASS LEADERSHIP 2026 — SKRYPT ODBIERAJĄCY ODPOWIEDZI
 * ====================================================================
 * Ten plik jest gotowy do wklejenia. Wszystkie wartości poniżej (hasła,
 * identyfikator arkusza) są już wpisane. NICZEGO NIE TRZEBA ZMIENIAĆ.
 *
 * CO ZROBIĆ (2 kroki, około 3 minuty):
 *  1. W arkuszu „Masterclass Leadership 2026 — Ankieta odpowiedzi”:
 *     Rozszerzenia → Apps Script. W pliku Kod.gs: Ctrl+A, Delete,
 *     wklej cały ten plik, Ctrl+S.
 *  2. Wdróż → Zarządzaj wdrożeniami → ołówek (Edytuj) →
 *     Wersja: „Nowa wersja” → Wdróż. Adres /exec zostaje ten sam.
 *
 * BEZ KROKU 2 NIC SIĘ NIE ZMIENIA: edytor to brudnopis, a aplikacja
 * internetowa serwuje ostatnio opublikowaną wersję.
 *
 * W arkuszu nie trzeba niczego klikać. Uporządkowanie kolumn i odłożenie
 * wierszy testowych zrobi zdalnie Maks (polecenia serwisowe poniżej).
 *
 * Ten plik zawiera hasła: nie wysyłaj go dalej i nie wklejaj do
 * publicznych repozytoriów. Dalsze komentarze w kodzie są po angielsku
 * i nie mają znaczenia dla wdrożenia.
 */

/** Hasło, które aplikacja wysyła przy każdej odpowiedzi. Wpisane. */
const TOKEN = ${quote(token)}

/** Identyfikator arkusza, do którego trafiają odpowiedzi. Wpisany. */
const SPREADSHEET_ID = ${quote(sheetId)}

/** Nazwa zakładki z odpowiedziami. Skrypt zakłada ją sam, gdy jej nie ma. */
const SHEET_NAME = ${quote(sheetName)}

/**
 * Drugie hasło, do poleceń serwisowych wysyłanych do skryptu (status,
 * przygotowanie kolumn, archiwizacja zakładki). Nie ma go w aplikacji;
 * zna je tylko ten plik i komputer Maksa. Wpisane.
 */
const ADMIN_TOKEN = ${quote(adminToken)}

/** Wersja kodu, zgłaszana przez polecenie „status”. */
const SCRIPT_VERSION = ${quote(scriptVersion)}
`
const newline = copy.includes('\r\n') ? '\r\n' : '\n'
copy = polishHeader.replace(/\n/g, newline) + copy.slice(headerEndLine)

writeFileSync(OUTPUT, copy, 'utf8')
console.log(`Written: ${OUTPUT}`)
console.log(`  password: ${token.slice(0, 3)}… (from .env.local)`)
console.log(`  spreadsheet id: ${sheetId || '(empty — script bound to its own sheet)'}`)
console.log(`  maintenance password: ${adminToken.slice(0, 3)}… (ARKUSZ_ADMIN_TOKEN in .env.local)`)
console.log('Paste the whole file into the Apps Script editor, then Deploy → Manage deployments → New version.')
