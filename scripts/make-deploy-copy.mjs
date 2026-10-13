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
import { createEnvironment, createFile, loadScript } from './lib/fake-google.mjs'

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

// EVERY setting the template declares above SCRIPT_VERSION must survive the
// header swap. Five of them get a Polish explanation of their own below; any
// other is carried over verbatim. This used to be a fixed list of five, and
// the day two constants were added to the template, the copy pasted into
// Google threw "MAX_COLUMNS is not defined" on every single write.
const EXPLAINED = ['TOKEN', 'SPREADSHEET_ID', 'SHEET_NAME', 'ADMIN_TOKEN', 'SCRIPT_VERSION']
const region = copy.slice(0, headerEndLine)
const declared = [...region.matchAll(/^const (\w+) = (.*?)\r?$/gm)].map((m) => ({
  name: m[1],
  value: m[2],
  line: `const ${m[1]} = ${m[2]}`,
}))
const carried = declared.filter((d) => !EXPLAINED.includes(d.name))
for (const d of carried) {
  // Only a whole, single-line literal can be carried over blindly.
  if (!/^(?:'[^']*'|"[^"]*"|-?\d+(?:\.\d+)?|true|false|null)\s*;?$/.test(d.value)) {
    console.error(`The header of Kod.gs declares ${d.name} as something other than a one-line literal — teach make-deploy-copy.mjs about it first. Nothing written.`)
    process.exit(1)
  }
}
const carriedBlock = carried.length
  ? `
/**
 * Pozostałe ustawienia ze wzorca (apps-script/Kod.gs), przeniesione bez
 * zmian. Nie trzeba ich ruszać.
 */
${carried.map((d) => d.line).join('\n')}
`
  : ''
const polishHeader = `/**
 * ANKIETA MASTERCLASS LEADERSHIP 2026 — SKRYPT ODBIERAJĄCY ODPOWIEDZI
 * ====================================================================
 * Ten plik jest gotowy do wklejenia. Wszystkie wartości poniżej (hasła,
 * identyfikator arkusza) są już wpisane. NICZEGO NIE TRZEBA ZMIENIAĆ.
 *
 * CO ZROBIĆ:
 *  1. W arkuszu docelowym (jego identyfikator jest wpisany poniżej):
 *     Rozszerzenia → Apps Script. W pliku Kod.gs: Ctrl+A, Delete,
 *     wklej cały ten plik, Ctrl+S.
 *  2. Pierwsze wdrożenie: Wdróż → Nowe wdrożenie → typ: Aplikacja
 *     internetowa → Wykonaj jako: Ja → Kto ma dostęp: Każdy → Wdróż.
 *     Skopiuj adres kończący się na /exec i wpisz go w aplikacji
 *     (Vercel: VITE_ARKUSZ_URL, potem Redeploy).
 *     Kolejne zmiany kodu: Wdróż → Zarządzaj wdrożeniami → ołówek →
 *     Wersja: „Nowa wersja” → Wdróż. Adres /exec zostaje wtedy ten sam.
 *
 * SAMO WKLEJENIE NIC NIE ZMIENIA: edytor to brudnopis, a aplikacja
 * internetowa serwuje ostatnio opublikowaną wersję.
 *
 * W arkuszu nie trzeba niczego klikać. Kolumny i wiersze testowe
 * porządkuje się zdalnie (polecenia serwisowe poniżej).
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
${carriedBlock}`
const newline = copy.includes('\r\n') ? '\r\n' : '\n'
copy = polishHeader.replace(/\n/g, newline) + copy.slice(headerEndLine)

// SELF-CHECK. The finished copy is run once, here, against the stand-in for
// Google that the unit tests use: one real save with a real survey key, then
// the "status" command. Whatever is pasted into Google has therefore saved a
// row at least once. A copy that fails this is not written at all.
function selfCheck(code) {
  const holder = { file: createFile(), cache: {}, consoleErrors: [], loggerEntries: [] }
  const { script } = loadScript(code, createEnvironment(holder), ['doPost', 'SURVEY_COLUMNS', 'SHEET_NAME'])
  const post = (body) => JSON.parse(script.doPost({ postData: { contents: JSON.stringify(body) } }).tresc)
  const [key, label] = script.SURVEY_COLUMNS[0]
  const saved = post({ token, sesja: 'samokontrola', kto: 'samokontrola', wersja: 'x', pulapka: '', odpowiedzi: { [key]: 'Tak' }, etykiety: { [key]: label } })
  if (saved.ok !== true) throw new Error(`a save failed: ${JSON.stringify(saved)}`)
  const tab = holder.file.getSheetByName(script.SHEET_NAME)
  if (!tab || tab.data.length !== 3) throw new Error('the save did not produce exactly one data row')
  if (String(tab.data[2][tab.data[0].indexOf(key)]) !== 'Tak') throw new Error('the saved value did not land under its column')
  const st = post({ token, pulapka: '', akcja: 'status', adminToken })
  if (st.ok !== true || st.wersjaSkryptu !== scriptVersion) throw new Error(`status failed: ${JSON.stringify(st)}`)
  if (holder.consoleErrors.length) throw new Error(`the script logged errors: ${holder.consoleErrors.join(' | ')}`)
}
try {
  selfCheck(copy)
} catch (err) {
  console.error(`SELF-CHECK FAILED — the copy would not work in Google, so nothing was written.\n  ${err.message}`)
  process.exit(1)
}

writeFileSync(OUTPUT, copy, 'utf8')
console.log(`Written: ${OUTPUT}`)
console.log(`  password: ${token.slice(0, 3)}… (from .env.local)`)
console.log(`  spreadsheet id: ${sheetId || '(empty — script bound to its own sheet)'}`)
console.log(`  maintenance password: ${adminToken.slice(0, 3)}… (ARKUSZ_ADMIN_TOKEN in .env.local)`)
console.log(`  self-check: one save and one status command ran fine on the stand-in for Google (${carried.length} extra setting${carried.length === 1 ? '' : 's'} carried over: ${carried.map((d) => d.name).join(', ') || 'none'})`)
console.log('Paste the whole file into the Apps Script editor, then Deploy → Manage deployments → New version.')
