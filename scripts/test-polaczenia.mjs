/**
 * SPRAWDZENIE POŁĄCZENIA Z ARKUSZEM
 *
 * Wysyła jeden testowy wiersz i mówi, czy dotarł. Uruchom po wpisaniu adresu
 * i hasła do `.env.local`, ZANIM podasz komukolwiek link do ankiety.
 *
 * Uruchomienie:  npm run test-polaczenia
 */
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PLIK = join(__dirname, '..', '.env.local')

function wczytajEnv() {
  if (!existsSync(PLIK)) return {}
  const env = {}
  for (const linia of readFileSync(PLIK, 'utf8').split('\n')) {
    const czysta = linia.trim()
    if (!czysta || czysta.startsWith('#')) continue
    const i = czysta.indexOf('=')
    if (i === -1) continue
    env[czysta.slice(0, i).trim()] = czysta.slice(i + 1).trim()
  }
  return env
}

const env = wczytajEnv()
const URL = env.VITE_ARKUSZ_URL
const TOKEN = env.VITE_ARKUSZ_TOKEN

console.log('\n=== Sprawdzenie połączenia z arkuszem ===\n')

if (!existsSync(PLIK)) {
  console.error('BŁĄD: brak pliku .env.local w katalogu aplikacji.')
  console.error('Utwórz go i wpisz VITE_ARKUSZ_URL oraz VITE_ARKUSZ_TOKEN.')
  process.exit(1)
}
if (!URL) {
  console.error('BŁĄD: VITE_ARKUSZ_URL jest puste w .env.local')
  process.exit(1)
}
if (!TOKEN) {
  console.error('BŁĄD: VITE_ARKUSZ_TOKEN jest puste w .env.local')
  process.exit(1)
}
if (!URL.endsWith('/exec')) {
  console.error(`BŁĄD: adres powinien kończyć się na /exec, a jest: ${URL}`)
  console.error('Skopiowałeś zapewne adres edytora zamiast adresu wdrożenia.')
  process.exit(1)
}

console.log(`Adres:  ${URL.slice(0, 60)}…`)
console.log(`Hasło:  ${TOKEN.slice(0, 3)}${'*'.repeat(Math.max(TOKEN.length - 3, 3))}`)
console.log('\nWysyłam testowy wiersz…\n')

const dane = {
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
  const odp = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(dane),
    redirect: 'follow',
  })

  const tekst = await odp.text()
  let wynik = null
  try {
    wynik = JSON.parse(tekst)
  } catch {
    /* nie JSON */
  }

  if (wynik && wynik.ok === true) {
    console.log('SUKCES. Wiersz powinien być już w arkuszu.')
    console.log('Sprawdź zakładkę „Odpowiedzi” i skasuj wiersz testowy.\n')
    process.exit(0)
  }

  if (wynik && wynik.blad === 'zly-token') {
    console.error('BŁĄD: skrypt odrzucił hasło.')
    console.error('Hasło w .env.local musi być IDENTYCZNE z TOKEN w skrypcie.')
    console.error('Uwaga na spacje na końcu i na to, czy po zmianie skryptu')
    console.error('zrobiono Wdróż → Zarządzaj wdrożeniami → Wersja: Nowa.\n')
    process.exit(1)
  }

  console.error(`BŁĄD: nieoczekiwana odpowiedź (HTTP ${odp.status}).`)
  console.error('Pierwsze 300 znaków odpowiedzi:\n')
  console.error(tekst.slice(0, 300))
  console.error('\nJeśli widzisz stronę logowania Google, we wdrożeniu ustawiono')
  console.error('dostęp inny niż „Wszyscy”. Popraw to i wdróż nową wersję.\n')
  process.exit(1)
} catch (err) {
  console.error(`BŁĄD sieci: ${err.message}`)
  console.error('Sprawdź internet i czy adres jest poprawny.\n')
  process.exit(1)
}
