/**
 * TEST PRZEPUSTOWOŚCI — obciążenie ciągłe, nie pojedynczy szczyt.
 *
 * Test obciążenia (`test-obciazenia.mjs`) sprawdza jedną falę: wszyscy naraz.
 * Ten sprawdza coś innego i trudniejszego: napływ ROZŁOŻONY W CZASIE, szybszy
 * niż tempo, w jakim Google zapisuje. Tak wygląda realny dzień po rozesłaniu
 * maila do 300 osób.
 *
 * Odpowiada na trzy pytania, na które fala nie odpowiada:
 *
 *  1. Czy przy trwałym przeciążeniu kolejka Google nadąża, czy zaczyna gubić?
 *     (Fala trwa kilkanaście sekund. Tu przeciążenie trwa minutami.)
 *  2. Czy zapis ZWALNIA, gdy arkusz rośnie? Skrypt przy każdym zapisie zagląda
 *     do arkusza, więc przy tysiącu wierszy może być wolniejszy niż przy stu.
 *     Porównujemy czasy z początku i z końca przebiegu.
 *  3. Ile realnie wynosi przepustowość podtrzymana przez dłuższą chwilę.
 *
 * Uruchomienie:
 *   npm run test-przepustowosci              → 300 osób, 3 na sekundę
 *   node scripts/test-przepustowosci.mjs 150 2   → 150 osób, 2 na sekundę
 *
 * UWAGA: każde żądanie dopisuje wiersz. „Kto wypełnił” = „TEST PRZEPUSTOWOSCI”,
 * „Wersja ankiety” = „przepustowosc”, więc łatwo je odfiltrować i skasować.
 */
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const KATALOG = join(dirname(fileURLToPath(import.meta.url)), '..')

function wczytajEnv() {
  const plik = join(KATALOG, '.env.local')
  if (!existsSync(plik)) return {}
  const env = {}
  for (const linia of readFileSync(plik, 'utf8').split('\n')) {
    const c = linia.trim()
    if (!c || c.startsWith('#')) continue
    const i = c.indexOf('=')
    if (i > -1) env[c.slice(0, i).trim()] = c.slice(i + 1).trim()
  }
  return env
}

const env = wczytajEnv()
const URL = env.VITE_ARKUSZ_URL
const TOKEN = env.VITE_ARKUSZ_TOKEN

if (!URL || !TOKEN) {
  console.error('BŁĄD: brak VITE_ARKUSZ_URL lub VITE_ARKUSZ_TOKEN w .env.local')
  process.exit(1)
}

const ankieta = JSON.parse(
  readFileSync(join(KATALOG, 'src', 'data', 'ankieta.json'), 'utf8'),
)

const ILE = Number(process.argv[2]) > 0 ? Number(process.argv[2]) : 300
const NA_SEKUNDE = Number(process.argv[3]) > 0 ? Number(process.argv[3]) : 3

/** Ładunek tej samej wielkości, co z prawdziwej ankiety. */
function ladunek(nr) {
  const odpowiedzi = {}
  const etykiety = {}
  for (const s of ankieta.sekcje) {
    for (const p of s.pytania) {
      etykiety[p.id] = p.tresc
      if (p.typ === 'skala') odpowiedzi[p.id] = String(((nr * 7) % 10) + 1)
      else if (p.typ === 'tak_nie') odpowiedzi[p.id] = nr % 2 ? 'Tak' : 'Nie'
      else if (p.typ === 'tekst')
        odpowiedzi[p.id] = `Test przepustowości, uczestnik ${nr}.`
      else if (p.opcje?.length) {
        const o = p.opcje[nr % p.opcje.length]
        odpowiedzi[p.id] = typeof o === 'string' ? o : o.tekst
      }
      if (p.komentarz) {
        odpowiedzi[`${p.id}::komentarz`] = ''
        etykiety[`${p.id}::komentarz`] = `${p.tresc} [komentarz]`
      }
    }
  }
  odpowiedzi['obecnosc-dni'] = 'Piątek (16.10); Sobota (17.10)'
  odpowiedzi['sciezka-1600'] = 'Finał konkursu (Sala Konwersatorium)'
  odpowiedzi['koniec-dopisek'] = ''
  etykiety['koniec-dopisek'] = 'Dodatkowy komentarz na koniec'

  return {
    token: TOKEN,
    sesja: `przepustowosc-${nr}-${Date.now()}`,
    kto: 'TEST PRZEPUSTOWOSCI (do skasowania)',
    wersja: 'przepustowosc',
    pulapka: '',
    odpowiedzi,
    etykiety,
  }
}

async function jednoZadanie(nr) {
  const start = performance.now()
  try {
    const odp = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(ladunek(nr)),
      redirect: 'follow',
    })
    const tekst = await odp.text()
    const ms = performance.now() - start
    try {
      const w = JSON.parse(tekst)
      return { nr, ok: w.ok === true, ms, powod: w.ok ? '' : (w.blad ?? 'bez ok') }
    } catch {
      return { nr, ok: false, ms, powod: tekst.slice(0, 60).replace(/\s+/g, ' ') }
    }
  } catch (err) {
    return { nr, ok: false, ms: performance.now() - start, powod: err.message }
  }
}

const percentyl = (pos, p) =>
  pos[Math.min(pos.length - 1, Math.floor((p / 100) * pos.length))]

const statystyka = (czasy) => {
  const s = [...czasy].sort((a, b) => a - b)
  return {
    mediana: Math.round(percentyl(s, 50)),
    p95: Math.round(percentyl(s, 95)),
    max: Math.round(s[s.length - 1]),
  }
}

/* ------------------------------------------------------------ start --- */

console.log('\n=== Test przepustowości (obciążenie ciągłe) ===')
console.log(`Cel:       ${URL.slice(0, 55)}…`)
console.log(`Uczestnicy: ${ILE}, napływ ${NA_SEKUNDE} na sekundę`)
console.log(`Napływ potrwa ${Math.round(ILE / NA_SEKUNDE)} s. Zmierzona wcześniej`)
console.log('przepustowość to około 1,5 zapisu/s, więc to celowe przeciążenie.\n')

const start = performance.now()
const wTrakcie = []
const wyniki = []
let zgloszone = 0

const odstep = 1000 / NA_SEKUNDE
const postep = setInterval(() => {
  const s = Math.round((performance.now() - start) / 1000)
  process.stdout.write(
    `\r  ${s}s: wysłano ${zgloszone}/${ILE}, ` +
      `odpowiedziało ${wyniki.length}, w locie ${zgloszone - wyniki.length}   `,
  )
}, 2000)

for (let i = 1; i <= ILE; i++) {
  const p = jednoZadanie(i).then((w) => {
    wyniki.push(w)
    return w
  })
  wTrakcie.push(p)
  zgloszone++
  if (i < ILE) await new Promise((r) => setTimeout(r, odstep))
}

const koniecNaplywu = performance.now()
await Promise.all(wTrakcie)
const calosc = performance.now() - start
clearInterval(postep)
process.stdout.write('\r' + ' '.repeat(78) + '\r')

/* -------------------------------------------------------- wyniki --- */

const udane = wyniki.filter((w) => w.ok)
const nieudane = wyniki.filter((w) => !w.ok)

console.log('=== Wynik ===\n')
console.log(`Wysłano:  ${ILE}`)
console.log(`Zapisano: ${udane.length}`)
console.log(`Utracono: ${nieudane.length}`)
console.log(`Czas napływu:      ${((koniecNaplywu - start) / 1000).toFixed(1)} s`)
console.log(`Czas do ostatniej odpowiedzi: ${(calosc / 1000).toFixed(1)} s`)
console.log(
  `Przepustowość podtrzymana: ${(udane.length / (calosc / 1000)).toFixed(2)} zapisów/s\n`,
)

if (udane.length) {
  const s = statystyka(udane.map((w) => w.ms))
  console.log(`Czas oczekiwania: mediana ${s.mediana} ms · p95 ${s.p95} ms · max ${s.max} ms`)
}

// Czy zapis zwalnia w miarę rośnięcia arkusza? Porównujemy pierwszą i ostatnią
// trzecią część przebiegu. Rosnący czas to sygnał, że skrypt przy większym
// arkuszu pracuje dłużej — istotne, bo arkusz rośnie przez cały czas zbierania.
if (udane.length >= 30) {
  const wgKolejnosci = [...udane].sort((a, b) => a.nr - b.nr)
  const trzecia = Math.floor(wgKolejnosci.length / 3)
  const pierwsze = statystyka(wgKolejnosci.slice(0, trzecia).map((w) => w.ms))
  const ostatnie = statystyka(wgKolejnosci.slice(-trzecia).map((w) => w.ms))
  console.log('\nCzy zapis zwalnia, gdy arkusz rośnie:')
  console.log(`  pierwsza trzecia: mediana ${pierwsze.mediana} ms`)
  console.log(`  ostatnia trzecia: mediana ${ostatnie.mediana} ms`)
  console.log(
    '  (te czasy rosną też dlatego, że kolejka się wydłuża — sam wzrost nie',
  )
  console.log('   dowodzi jeszcze spowolnienia po stronie arkusza)')
}

if (nieudane.length) {
  const powody = {}
  for (const n of nieudane) powody[n.powod] = (powody[n.powod] ?? 0) + 1
  console.log('\nNIEUDANE:')
  for (const [p, ile] of Object.entries(powody)) console.log(`  ${ile}× ${p.slice(0, 90)}`)
}

console.log('\nJak to czytać:')
console.log('  • 0 utraconych mimo przeciążenia = Google kolejkuje i nic nie ginie.')
console.log('  • Aplikacja i tak ma zapas: nieudany zapis wraca do kolejki w telefonie.')
console.log(
  '\nSprzątanie: odfiltruj „Wersja ankiety” = „przepustowosc” i skasuj te wiersze.\n',
)

process.exitCode = nieudane.length === 0 ? 0 : 1
