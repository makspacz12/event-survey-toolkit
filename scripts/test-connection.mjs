/**
 * CONNECTION CHECK FOR THE SHEET
 *
 * Sends one test row and reports whether it arrived. Run this after entering
 * the URL and password into `.env.local`, BEFORE giving anyone the survey link.
 *
 * Run:  npm run test:connection
 */
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FILE = join(__dirname, '..', '.env.local')

function loadEnv() {
  if (!existsSync(FILE)) return {}
  const env = {}
  for (const line of readFileSync(FILE, 'utf8').split('\n')) {
    const clean = line.trim()
    if (!clean || clean.startsWith('#')) continue
    const i = clean.indexOf('=')
    if (i === -1) continue
    env[clean.slice(0, i).trim()] = clean.slice(i + 1).trim()
  }
  return env
}

const env = loadEnv()
const URL = env.VITE_ARKUSZ_URL
const TOKEN = env.VITE_ARKUSZ_TOKEN

console.log('\n=== Sprawdzenie połączenia z arkuszem ===\n')

if (!existsSync(FILE)) {
  console.error('ERROR: no .env.local file in the app directory.')
  console.error('Create it and set VITE_ARKUSZ_URL and VITE_ARKUSZ_TOKEN.')
  process.exit(1)
}
if (!URL) {
  console.error('ERROR: VITE_ARKUSZ_URL is empty in .env.local')
  process.exit(1)
}
if (!TOKEN) {
  console.error('ERROR: VITE_ARKUSZ_TOKEN is empty in .env.local')
  process.exit(1)
}
if (!URL.endsWith('/exec')) {
  console.error(`ERROR: the URL should end with /exec, but it's: ${URL}`)
  console.error('You probably copied the editor URL instead of the deployment URL.')
  process.exit(1)
}

console.log(`Adres:  ${URL.slice(0, 60)}…`)
console.log(`Hasło:  ${TOKEN.slice(0, 3)}${'*'.repeat(Math.max(TOKEN.length - 3, 3))}`)
console.log('\nWysyłam testowy wiersz…\n')

const data = {
  token: TOKEN,
  sesja: `test-z-komputera-${Date.now()}`,
  kto: 'TEST POŁĄCZENIA (do skasowania)',
  wersja: 'test',
  pulapka: '',
  odpowiedzi: { nps: '10', 'obecnosc-dni': 'Piątek (16.10); Sobota (17.10)' },
  etykiety: {
    nps: 'Na ile prawdopodobne, że polecisz Masterclass Leadership znajomemu?',
    'obecnosc-dni': 'W których dniach wydarzenia uczestniczyłeś(-aś)?',
  },
}

try {
  const resp = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(data),
    redirect: 'follow',
  })

  const text = await resp.text()
  let result = null
  try {
    result = JSON.parse(text)
  } catch {
    /* not JSON */
  }

  if (result && result.ok === true) {
    console.log('SUKCES. Wiersz powinien być już w arkuszu.')
    console.log('Sprawdź zakładkę „Odpowiedzi” i skasuj wiersz testowy.\n')
    process.exit(0)
  }

  if (result && result.blad === 'zly-token') {
    console.error('ERROR: the script rejected the password.')
    console.error('The password in .env.local must be IDENTICAL to TOKEN in the script.')
    console.error('Watch for trailing spaces, and whether after editing the script you')
    console.error('did Deploy → Manage deployments → Version: New.\n')
    process.exit(1)
  }

  console.error(`ERROR: unexpected response (HTTP ${resp.status}).`)
  console.error('First 300 characters of the response:\n')
  console.error(text.slice(0, 300))
  console.error('\nIf you see a Google login page, the deployment access is set to')
  console.error('something other than "Anyone". Fix it and deploy a new version.\n')
  process.exit(1)
} catch (err) {
  console.error(`NETWORK ERROR: ${err.message}`)
  console.error('Check your internet connection and whether the URL is correct.\n')
  process.exit(1)
}
