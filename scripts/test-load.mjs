/**
 * LOAD TEST — how many concurrent submissions can the receiving end on
 * Google's side handle.
 *
 * The question this answers: what happens when an organizer emails 300
 * people and some of them click "Finish survey" in the same minute.
 *
 * Apps Script has a limit of 30 concurrent executions per account, and our
 * script additionally queues writes (LockService) so they don't overwrite
 * each other's rows. This test finds where the real limit lies and what
 * happens once it's crossed: do requests wait in a queue, or get rejected.
 *
 * Run:
 *   npm run test:load            → 3 waves: 10, 25, 50 concurrent
 *   node scripts/test-load.mjs 100   → one wave of 100 concurrent
 *
 * NOTE: every request appends a row to the sheet. Rows have "Wersja
 * ankiety" = `obciazenie-<wave>` and "Kto wypełnił" = "LOAD TEST", so they're
 * easy to filter out and bulk-delete.
 */
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIR = join(__dirname, '..')

/* ---------------------------------------------------------- config --- */

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

/** Realistic payload: as many fields as a real submission sends. */
function payload(waveNr, personNr) {
  const responses = {}
  const labels = {}
  for (const s of survey.sekcje) {
    for (const p of s.pytania) {
      labels[p.id] = p.tresc
      if (p.typ === 'skala') responses[p.id] = String(((personNr * 3) % 10) + 1)
      else if (p.typ === 'tak_nie') responses[p.id] = personNr % 2 ? 'Tak' : 'Nie'
      else if (p.typ === 'tekst')
        responses[p.id] = `Test obciążenia, fala ${waveNr}, osoba ${personNr}.`
      else if (p.opcje?.length) {
        const o = p.opcje[personNr % p.opcje.length]
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
    sesja: `load-${waveNr}-${personNr}-${Date.now()}`,
    kto: 'LOAD TEST (do skasowania)',
    wersja: `obciazenie-${waveNr}`,
    pulapka: '',
    odpowiedzi: responses,
    etykiety: labels,
  }
}

/** One request with timing. Returns a result instead of throwing. */
async function oneRequest(waveNr, personNr) {
  const start = performance.now()
  try {
    const resp = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload(waveNr, personNr)),
      redirect: 'follow',
    })
    const text = await resp.text()
    const ms = performance.now() - start
    let ok = false
    let reason = ''
    try {
      const result = JSON.parse(text)
      ok = result.ok === true
      if (!ok) reason = result.blad ?? 'response without ok'
    } catch {
      // A login page or HTML error page instead of JSON.
      reason = text.slice(0, 60).replace(/\s+/g, ' ')
    }
    return { ok, ms, status: resp.status, reason }
  } catch (err) {
    return {
      ok: false,
      ms: performance.now() - start,
      status: 0,
      reason: err.message,
    }
  }
}

/* --------------------------------------------------------- statistics --- */

const percentile = (sorted, p) =>
  sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]

async function wave(waveNr, count) {
  process.stdout.write(
    `Fala ${waveNr}: ${String(count).padStart(3)} żądań równocześnie… `,
  )
  const start = performance.now()

  // All at once — that's the whole point of this test, we don't want them
  // spread out over time.
  const results = await Promise.all(
    Array.from({ length: count }, (_, i) => oneRequest(waveNr, i + 1)),
  )

  const total = performance.now() - start
  const succeeded = results.filter((w) => w.ok)
  const failed = results.filter((w) => !w.ok)
  const times = succeeded.map((w) => w.ms).sort((a, b) => a - b)

  console.log(
    `${succeeded.length}/${count} OK w ${(total / 1000).toFixed(1)} s`,
  )

  if (times.length > 0) {
    console.log(
      `   czas odpowiedzi: min ${Math.round(times[0])} ms · ` +
        `mediana ${Math.round(percentile(times, 50))} ms · ` +
        `p95 ${Math.round(percentile(times, 95))} ms · ` +
        `max ${Math.round(times[times.length - 1])} ms`,
    )
    console.log(
      `   przepustowość: ${(succeeded.length / (total / 1000)).toFixed(1)} zapisów/s`,
    )
  }

  if (failed.length > 0) {
    const reasons = {}
    for (const n of failed) {
      const key = `${n.status} ${n.reason}`.trim()
      reasons[key] = (reasons[key] ?? 0) + 1
    }
    console.log(`   NIEUDANE (${failed.length}):`)
    for (const [reason, count] of Object.entries(reasons)) {
      console.log(`     ${count}× ${reason.slice(0, 90)}`)
    }
  }

  return { waveNr, count, succeeded: succeeded.length, total, times, failed }
}

/* -------------------------------------------------------------- start --- */

const arg = Number(process.argv[2])
const waves = Number.isFinite(arg) && arg > 0 ? [arg] : [10, 25, 50]

console.log('\n=== Test obciążenia odbioru odpowiedzi ===')
console.log(`Cel: ${URL.slice(0, 55)}…`)
console.log(`Fale: ${waves.join(', ')} żądań równocześnie`)
console.log(
  'Każde żądanie = jeden wiersz w arkuszu („Kto wypełnił” = LOAD TEST).\n',
)

const report = []
for (let i = 0; i < waves.length; i++) {
  report.push(await wave(i + 1, waves[i]))
  if (i < waves.length - 1) {
    // Pause so Google's limits have time to reset between waves.
    console.log('   (przerwa 5 s)\n')
    await new Promise((r) => setTimeout(r, 5000))
  }
}

/* ---------------------------------------------------------- summary --- */

const sent = report.reduce((s, f) => s + f.count, 0)
const succeeded = report.reduce((s, f) => s + f.succeeded, 0)

console.log('\n=== Podsumowanie ===\n')
console.log(`Wysłano: ${sent}, zapisano: ${succeeded}, utracono: ${sent - succeeded}`)

for (const f of report) {
  const median = f.times.length ? Math.round(percentile(f.times, 50)) : 0
  console.log(
    `  ${String(f.count).padStart(3)} równocześnie → ${f.succeeded}/${f.count} w ` +
      `${(f.total / 1000).toFixed(1)} s, mediana ${median} ms`,
  )
}

console.log('\nJak to czytać:')
console.log('  • 100% zapisanych = kolejka po stronie Google wchłania szczyt.')
console.log('  • Rosnąca mediana przy większej fali = zapytania czekają w kolejce,')
console.log('    ale nic nie ginie. To zachowanie pożądane.')
console.log('  • Błędy „Lock timeout” albo brak odpowiedzi = przekroczony limit;')
console.log('    aplikacja wrzuci taką wysyłkę do kolejki na telefonie i ponowi.')
console.log(
  '\nSprzątanie: w arkuszu odfiltruj „Wersja ankiety” zaczynające się od' +
    ' „obciazenie-” i skasuj te wiersze.\n',
)

process.exitCode = succeeded === sent ? 0 : 1
