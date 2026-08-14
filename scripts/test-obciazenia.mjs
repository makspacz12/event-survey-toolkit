/**
 * TEST OBCIĄŻENIA — ile równoczesnych wysyłek wytrzyma odbiór po stronie Google.
 *
 * Pytanie, na które odpowiada: co się stanie, gdy organizator wyśle mail do
 * 300 osób i część kliknie „Zakończ ankietę” w tej samej minucie.
 *
 * Apps Script ma limit 30 równoczesnych wykonań na konto, a nasz skrypt
 * dodatkowo ustawia zapisy w kolejkę (LockService), żeby nie nadpisywały sobie
 * wierszy. Ten test sprawdza, gdzie leży realna granica i co się dzieje po jej
 * przekroczeniu: czy zapytania czekają w kolejce, czy są odrzucane.
 *
 * Uruchomienie:
 *   npm run test-obciazenia            → 3 fale: 10, 25, 50 równocześnie
 *   node scripts/test-obciazenia.mjs 100   → jedna fala 100 równocześnie
 *
 * UWAGA: każde żądanie dopisuje wiersz do arkusza. Wiersze mają „Wersja
 * ankiety” = `obciazenie-<fala>` i „Kto wypełnił” = „LOAD TEST”, więc łatwo
 * je odfiltrować i skasować hurtem.
 */
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const KATALOG = join(__dirname, '..')

/* ---------------------------------------------------- konfiguracja --- */

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

/** Realistyczny ładunek: tyle pól, ile wysyła prawdziwa ankieta. */
function ladunek(nrFali, nrOsoby) {
  const odpowiedzi = {}
  const etykiety = {}
  for (const s of ankieta.sekcje) {
    for (const p of s.pytania) {
      etykiety[p.id] = p.tresc
      if (p.typ === 'skala') odpowiedzi[p.id] = String(((nrOsoby * 3) % 10) + 1)
      else if (p.typ === 'tak_nie') odpowiedzi[p.id] = nrOsoby % 2 ? 'Tak' : 'Nie'
      else if (p.typ === 'tekst')
        odpowiedzi[p.id] = `Test obciążenia, fala ${nrFali}, osoba ${nrOsoby}.`
      else if (p.opcje?.length) {
        const o = p.opcje[nrOsoby % p.opcje.length]
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

  return {
    token: TOKEN,
    sesja: `load-${nrFali}-${nrOsoby}-${Date.now()}`,
    kto: 'LOAD TEST (do skasowania)',
    wersja: `obciazenie-${nrFali}`,
    pulapka: '',
    odpowiedzi,
    etykiety,
  }
}

/** Jedno żądanie z pomiarem czasu. Zwraca wynik zamiast rzucać wyjątkiem. */
async function jednoZadanie(nrFali, nrOsoby) {
  const start = performance.now()
  try {
    const odp = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(ladunek(nrFali, nrOsoby)),
      redirect: 'follow',
    })
    const tekst = await odp.text()
    const ms = performance.now() - start
    let ok = false
    let powod = ''
    try {
      const wynik = JSON.parse(tekst)
      ok = wynik.ok === true
      if (!ok) powod = wynik.blad ?? 'odpowiedź bez ok'
    } catch {
      // Strona logowania albo HTML błędu zamiast JSON-a.
      powod = tekst.slice(0, 60).replace(/\s+/g, ' ')
    }
    return { ok, ms, status: odp.status, powod }
  } catch (err) {
    return {
      ok: false,
      ms: performance.now() - start,
      status: 0,
      powod: err.message,
    }
  }
}

/* ------------------------------------------------------- statystyka --- */

const percentyl = (posortowane, p) =>
  posortowane[Math.min(posortowane.length - 1, Math.floor((p / 100) * posortowane.length))]

async function fala(nrFali, ile) {
  process.stdout.write(
    `Fala ${nrFali}: ${String(ile).padStart(3)} żądań równocześnie… `,
  )
  const start = performance.now()

  // Wszystkie naraz — to jest sedno testu, nie chcemy ich rozkładać w czasie.
  const wyniki = await Promise.all(
    Array.from({ length: ile }, (_, i) => jednoZadanie(nrFali, i + 1)),
  )

  const calosc = performance.now() - start
  const udane = wyniki.filter((w) => w.ok)
  const nieudane = wyniki.filter((w) => !w.ok)
  const czasy = udane.map((w) => w.ms).sort((a, b) => a - b)

  console.log(
    `${udane.length}/${ile} OK w ${(calosc / 1000).toFixed(1)} s`,
  )

  if (czasy.length > 0) {
    console.log(
      `   czas odpowiedzi: min ${Math.round(czasy[0])} ms · ` +
        `mediana ${Math.round(percentyl(czasy, 50))} ms · ` +
        `p95 ${Math.round(percentyl(czasy, 95))} ms · ` +
        `max ${Math.round(czasy[czasy.length - 1])} ms`,
    )
    console.log(
      `   przepustowość: ${(udane.length / (calosc / 1000)).toFixed(1)} zapisów/s`,
    )
  }

  if (nieudane.length > 0) {
    const powody = {}
    for (const n of nieudane) {
      const klucz = `${n.status} ${n.powod}`.trim()
      powody[klucz] = (powody[klucz] ?? 0) + 1
    }
    console.log(`   NIEUDANE (${nieudane.length}):`)
    for (const [powod, ile] of Object.entries(powody)) {
      console.log(`     ${ile}× ${powod.slice(0, 90)}`)
    }
  }

  return { nrFali, ile, udane: udane.length, calosc, czasy, nieudane }
}

/* ------------------------------------------------------------ start --- */

const arg = Number(process.argv[2])
const fale = Number.isFinite(arg) && arg > 0 ? [arg] : [10, 25, 50]

console.log('\n=== Test obciążenia odbioru odpowiedzi ===')
console.log(`Cel: ${URL.slice(0, 55)}…`)
console.log(`Fale: ${fale.join(', ')} żądań równocześnie`)
console.log(
  'Każde żądanie = jeden wiersz w arkuszu („Kto wypełnił” = LOAD TEST).\n',
)

const raport = []
for (let i = 0; i < fale.length; i++) {
  raport.push(await fala(i + 1, fale[i]))
  if (i < fale.length - 1) {
    // Przerwa, żeby limity Google zdążyły się zresetować między falami.
    console.log('   (przerwa 5 s)\n')
    await new Promise((r) => setTimeout(r, 5000))
  }
}

/* -------------------------------------------------------- podsumowanie --- */

const wyslane = raport.reduce((s, f) => s + f.ile, 0)
const udane = raport.reduce((s, f) => s + f.udane, 0)

console.log('\n=== Podsumowanie ===\n')
console.log(`Wysłano: ${wyslane}, zapisano: ${udane}, utracono: ${wyslane - udane}`)

for (const f of raport) {
  const mediana = f.czasy.length ? Math.round(percentyl(f.czasy, 50)) : 0
  console.log(
    `  ${String(f.ile).padStart(3)} równocześnie → ${f.udane}/${f.ile} w ` +
      `${(f.calosc / 1000).toFixed(1)} s, mediana ${mediana} ms`,
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

process.exitCode = udane === wyslane ? 0 : 1
