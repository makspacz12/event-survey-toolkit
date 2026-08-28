/**
 * THROUGHPUT TEST — sustained load, not a single burst.
 *
 * The load test (`test-load.mjs`) checks a single wave: everyone at once.
 * This one checks something different and harder: an inflow SPREAD OVER TIME,
 * faster than the pace at which Google writes. That's what a real day after
 * emailing 300 people actually looks like.
 *
 * Answers three questions a single wave can't:
 *
 *  1. Under sustained overload, does Google's queue keep up, or does it start
 *     dropping? (A wave lasts a few seconds. Here the overload lasts minutes.)
 *  2. Does writing SLOW DOWN as the sheet grows? The script checks the sheet
 *     on every write, so at a thousand rows it may be slower than at a
 *     hundred. We compare timings from the start and the end of the run.
 *  3. What's the realistic sustained throughput over a longer stretch.
 *
 * Run:
 *   npm run test:throughput              → 300 people, 3 per second
 *   node scripts/test-throughput.mjs 150 2   → 150 people, 2 per second
 *
 * NOTE: every request appends a row. "Kto wypełnił" = "TEST PRZEPUSTOWOSCI",
 * "Wersja ankiety" = "przepustowosc", so they're easy to filter out and delete.
 */
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..')

function loadEnv() {
  const file = join(DIR, '.env.local')
  if (!existsSync(file)) return {}
  const env = {}
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const c = line.trim()
    if (!c || c.startsWith('#')) continue
    const i = c.indexOf('=')
    if (i > -1) env[c.slice(0, i).trim()] = c.slice(i + 1).trim()
  }
  return env
}

const env = loadEnv()
const URL = env.VITE_ARKUSZ_URL
const TOKEN = env.VITE_ARKUSZ_TOKEN

if (!URL || !TOKEN) {
  console.error('ERROR: missing VITE_ARKUSZ_URL or VITE_ARKUSZ_TOKEN in .env.local')
  process.exit(1)
}

const survey = JSON.parse(
  readFileSync(join(DIR, 'src', 'data', 'ankieta.json'), 'utf8'),
)

const COUNT = Number(process.argv[2]) > 0 ? Number(process.argv[2]) : 300
const PER_SECOND = Number(process.argv[3]) > 0 ? Number(process.argv[3]) : 3

/** Payload the same size as a real survey submission. */
function payload(nr) {
  const responses = {}
  const labels = {}
  for (const s of survey.sekcje) {
    for (const p of s.pytania) {
      labels[p.id] = p.tresc
      if (p.typ === 'skala') responses[p.id] = String(((nr * 7) % 10) + 1)
      else if (p.typ === 'tak_nie') responses[p.id] = nr % 2 ? 'Tak' : 'Nie'
      else if (p.typ === 'tekst')
        responses[p.id] = `Test przepustowości, uczestnik ${nr}.`
      else if (p.opcje?.length) {
        const o = p.opcje[nr % p.opcje.length]
        responses[p.id] = typeof o === 'string' ? o : o.tekst
      }
      if (p.komentarz) {
        responses[`${p.id}::komentarz`] = ''
        labels[`${p.id}::komentarz`] = `${p.tresc} [komentarz]`
      }
    }
  }
  responses['obecnosc-dni'] = 'Piątek (16.10); Sobota (17.10)'
  responses['sciezka-1600'] = 'Finał konkursu (Sala Konwersatorium)'

  return {
    token: TOKEN,
    sesja: `przepustowosc-${nr}-${Date.now()}`,
    kto: 'TEST PRZEPUSTOWOSCI (do skasowania)',
    wersja: 'przepustowosc',
    pulapka: '',
    odpowiedzi: responses,
    etykiety: labels,
  }
}

async function oneRequest(nr) {
  const start = performance.now()
  try {
    const resp = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload(nr)),
      redirect: 'follow',
    })
    const text = await resp.text()
    const ms = performance.now() - start
    try {
      const w = JSON.parse(text)
      return { nr, ok: w.ok === true, ms, reason: w.ok ? '' : (w.blad ?? 'no ok') }
    } catch {
      return { nr, ok: false, ms, reason: text.slice(0, 60).replace(/\s+/g, ' ') }
    }
  } catch (err) {
    return { nr, ok: false, ms: performance.now() - start, reason: err.message }
  }
}

const percentile = (pos, p) =>
  pos[Math.min(pos.length - 1, Math.floor((p / 100) * pos.length))]

const stats = (times) => {
  const s = [...times].sort((a, b) => a - b)
  return {
    median: Math.round(percentile(s, 50)),
    p95: Math.round(percentile(s, 95)),
    max: Math.round(s[s.length - 1]),
  }
}

/* -------------------------------------------------------------- start --- */

console.log('\n=== Test przepustowości (obciążenie ciągłe) ===')
console.log(`Cel:       ${URL.slice(0, 55)}…`)
console.log(`Uczestnicy: ${COUNT}, napływ ${PER_SECOND} na sekundę`)
console.log(`Napływ potrwa ${Math.round(COUNT / PER_SECOND)} s. Zmierzona wcześniej`)
console.log('przepustowość to około 1,5 zapisu/s, więc to celowe przeciążenie.\n')

const start = performance.now()
const inFlight = []
const results = []
let sentSoFar = 0

const interval = 1000 / PER_SECOND
const progress = setInterval(() => {
  const s = Math.round((performance.now() - start) / 1000)
  process.stdout.write(
    `\r  ${s}s: wysłano ${sentSoFar}/${COUNT}, ` +
      `odpowiedziało ${results.length}, w locie ${sentSoFar - results.length}   `,
  )
}, 2000)

for (let i = 1; i <= COUNT; i++) {
  const p = oneRequest(i).then((w) => {
    results.push(w)
    return w
  })
  inFlight.push(p)
  sentSoFar++
  if (i < COUNT) await new Promise((r) => setTimeout(r, interval))
}

const inflowEnd = performance.now()
await Promise.all(inFlight)
const total = performance.now() - start
clearInterval(progress)
process.stdout.write('\r' + ' '.repeat(78) + '\r')

/* ------------------------------------------------------------ results --- */

const succeeded = results.filter((w) => w.ok)
const failed = results.filter((w) => !w.ok)

console.log('=== Wynik ===\n')
console.log(`Wysłano:  ${COUNT}`)
console.log(`Zapisano: ${succeeded.length}`)
console.log(`Utracono: ${failed.length}`)
console.log(`Czas napływu:      ${((inflowEnd - start) / 1000).toFixed(1)} s`)
console.log(`Czas do ostatniej odpowiedzi: ${(total / 1000).toFixed(1)} s`)
console.log(
  `Przepustowość podtrzymana: ${(succeeded.length / (total / 1000)).toFixed(2)} zapisów/s\n`,
)

if (succeeded.length) {
  const s = stats(succeeded.map((w) => w.ms))
  console.log(`Czas oczekiwania: mediana ${s.median} ms · p95 ${s.p95} ms · max ${s.max} ms`)
}

// Does writing slow down as the sheet grows? We compare the first and last
// thirds of the run. A rising time is a sign the script takes longer to run
// on a bigger sheet — relevant, because the sheet keeps growing the whole
// time responses come in.
if (succeeded.length >= 30) {
  const byOrder = [...succeeded].sort((a, b) => a.nr - b.nr)
  const third = Math.floor(byOrder.length / 3)
  const first = stats(byOrder.slice(0, third).map((w) => w.ms))
  const last = stats(byOrder.slice(-third).map((w) => w.ms))
  console.log('\nCzy zapis zwalnia, gdy arkusz rośnie:')
  console.log(`  pierwsza trzecia: mediana ${first.median} ms`)
  console.log(`  ostatnia trzecia: mediana ${last.median} ms`)
  console.log(
    '  (te czasy rosną też dlatego, że kolejka się wydłuża — sam wzrost nie',
  )
  console.log('   dowodzi jeszcze spowolnienia po stronie arkusza)')
}

if (failed.length) {
  const reasons = {}
  for (const n of failed) reasons[n.reason] = (reasons[n.reason] ?? 0) + 1
  console.log('\nNIEUDANE:')
  for (const [r, count] of Object.entries(reasons)) console.log(`  ${count}× ${r.slice(0, 90)}`)
}

console.log('\nJak to czytać:')
console.log('  • 0 utraconych mimo przeciążenia = Google kolejkuje i nic nie ginie.')
console.log('  • Aplikacja i tak ma zapas: nieudany zapis wraca do kolejki w telefonie.')
console.log(
  '\nSprzątanie: odfiltruj „Wersja ankiety” = „przepustowosc” i skasuj te wiersze.\n',
)

process.exitCode = failed.length === 0 ? 0 : 1
