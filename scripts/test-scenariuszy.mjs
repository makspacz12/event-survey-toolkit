/**
 * TEST 25 ŚCIEŻEK PRZEZ ANKIETĘ — wysyłka do prawdziwego arkusza.
 *
 * Ankieta ma dwa pytania rozgałęziające (dni obecności i miejsce o 16:00),
 * pięć typów pytań i kilka wartości specjalnych. Ten skrypt przechodzi przez
 * kombinacje, które mogą się zepsuć, i wysyła je tak, jak zrobiłby to telefon
 * uczestnika.
 *
 * Uruchomienie:  npm run test-scenariuszy
 * Potem: otwórz arkusz i porównaj z raportem wypisanym na końcu.
 */
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const KATALOG = join(__dirname, '..')

/* ------------------------------------------------------ konfiguracja --- */

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

/* ------------------------------------- która sekcja jest widoczna kiedy --- */

function widoczna(sekcja, odp) {
  const w = sekcja.pokaz_jesli
  if (!w) return true
  const wartosc = odp[w.pytanie]
  if (w.rowne != null) return wartosc === w.rowne
  if (w.zawiera != null)
    return typeof wartosc === 'string' && wartosc.includes(w.zawiera)
  return true
}

const etykietyWszystkich = {}
for (const s of ankieta.sekcje)
  for (const p of s.pytania) etykietyWszystkich[p.id] = p.tresc

function wypelnij(bazowe, strategia) {
  const odp = { ...bazowe }
  for (const sekcja of ankieta.sekcje) {
    if (!widoczna(sekcja, odp)) continue
    for (const p of sekcja.pytania) {
      if (odp[p.id] !== undefined) continue
      const w = strategia(p, sekcja)
      if (w !== undefined) odp[p.id] = w
    }
  }
  return odp
}

const opcje = (p) =>
  (p.opcje || []).map((o) => (typeof o === 'string' ? o : o.tekst))
const pierwszaOpcja = (p) => opcje(p)[0]
const ostatniaOpcja = (p) => opcje(p)[opcje(p).length - 1]

/** Deterministyczny „losowy” wybór — ten sam id daje zawsze tę samą wartość. */
function ziarno(tekst) {
  let s = 0
  for (let i = 0; i < tekst.length; i++) s = (s * 31 + tekst.charCodeAt(i)) % 9973
  return s
}

/* ---------- strategie wypełniania (odpowiadają zachowaniom uczestników) --- */

const minimalna = (p) => (p.wymagane ? String(p.min ?? 1) : undefined)

/** Realistyczna: różne oceny dla różnych pytań, jak u prawdziwego człowieka. */
const realistyczna = (p) => {
  const z = ziarno(p.id)
  if (p.typ === 'skala') {
    const min = p.min ?? 1
    const max = p.max ?? 10
    // Rozkład przesunięty w górę, jak w prawdziwych ankietach.
    const zakres = max - min
    return String(min + Math.round(zakres * (0.55 + (z % 45) / 100)))
  }
  if (p.typ === 'tak_nie') return z % 3 === 0 ? 'Nie' : 'Tak'
  if (p.typ === 'jeden_wybor') {
    const lista = opcje(p)
    return lista[z % lista.length]
  }
  if (p.typ === 'wiele_wyborow') {
    const lista = opcje(p)
    return z % 2 === 0 ? lista.join('; ') : lista[z % lista.length]
  }
  if (p.typ === 'tekst') {
    const warianty = [
      'Świetna organizacja, zabrakło tylko przerw między blokami.',
      'Najbardziej zapamiętam rozmowę przy stoliku z mentorem.',
      'Merytorycznie mocne, logistycznie do dopracowania.',
      'Poziom prelegentów wyższy niż się spodziewałem.',
      'Dużo inspiracji, mało czasu na networking.',
    ]
    return warianty[z % warianty.length]
  }
  return undefined
}

const srednia = (p) => {
  if (p.typ === 'skala') return String(Math.round(((p.min ?? 1) + (p.max ?? 10)) / 2))
  if (p.typ === 'tak_nie') return 'Tak'
  if (p.typ === 'jeden_wybor') return pierwszaOpcja(p)
  if (p.typ === 'wiele_wyborow') return pierwszaOpcja(p)
  if (p.typ === 'tekst') return 'Odpowiedź testowa.'
  return undefined
}

const najnizsze = (p) => {
  if (p.typ === 'skala') return String(p.min ?? 1)
  if (p.typ === 'tak_nie') return 'Nie'
  if (p.typ === 'jeden_wybor') return ostatniaOpcja(p)
  if (p.typ === 'wiele_wyborow') return ostatniaOpcja(p)
  if (p.typ === 'tekst') return 'Wszystko do poprawy.'
  return undefined
}

const najwyzsze = (p) => {
  if (p.typ === 'skala') return String(p.max ?? 10)
  if (p.typ === 'tak_nie') return 'Tak'
  if (p.typ === 'jeden_wybor') return pierwszaOpcja(p)
  if (p.typ === 'wiele_wyborow') return opcje(p).join('; ')
  if (p.typ === 'tekst') return 'Rewelacja od początku do końca.'
  return undefined
}

const nieobecny = (p) => {
  if (p.typ === 'skala') return p.nieobecnosc ? 'nie było mnie' : String(p.min ?? 1)
  if (p.typ === 'tekst') return ''
  return srednia(p)
}

/** Same oceny, żadnych wypowiedzi — typowy uczestnik w pośpiechu. */
const bezTekstow = (p) => (p.typ === 'tekst' ? '' : realistyczna(p))

/** Tylko wypowiedzi, oceny pominięte — ktoś, kto woli pisać niż klikać. */
const tylkoTeksty = (p) => {
  if (p.typ === 'tekst') return realistyczna(p)
  return p.wymagane ? String(p.min ?? 1) : ''
}

const TEKST_TRUDNY = [
  'Cudzysłowy: "polskie" i „typograficzne”, apostrof: O\'Brien.',
  'Średnik; przecinek, tabulator\ti nowa linia:',
  'Druga linia tekstu.',
  'Znaki: <tag> & ampersand, =FORMUŁA(), 100% i 5+5.',
  'Polskie: zażółć gęślą jaźń ĄĆĘŁŃÓŚŹŻ.',
].join('\n')

const trudny = (p) => (p.typ === 'tekst' ? TEKST_TRUDNY : realistyczna(p))

const dlugi = (p) =>
  p.typ === 'tekst'
    ? 'Bardzo długa wypowiedź uczestnika. '.repeat(120).trim()
    : realistyczna(p)

/** Ciągi, które arkusze lubią zamieniać na liczby, daty albo formuły. */
const AUTOKONWERSJA = [
  '0001',
  '+48 500 100 200',
  '2026-10-16',
  '1/2',
  '=SUMA(A1:A9)',
  '-5',
  '3,14',
  '1E5',
  '00:30',
  '#REF!',
].join(' | ')

const konwersje = (p) => (p.typ === 'tekst' ? AUTOKONWERSJA : realistyczna(p))

const HTML = '<script>alert("test")</script> <b>pogrubienie</b> <a href="#">link</a>'
const html = (p) => (p.typ === 'tekst' ? HTML : realistyczna(p))

const EMOJI = 'Super wydarzenie 🎉👏 Robot 🤖 zrobił wrażenie. Ocena: ⭐⭐⭐⭐⭐'
const emoji = (p) => (p.typ === 'tekst' ? EMOJI : realistyczna(p))

const krotkie = (p) => {
  if (p.typ === 'tekst') return '.'
  return realistyczna(p)
}

const puste = (p) => (p.wymagane ? String(p.max ?? 10) : '')

/* ----------------------------------------------------- 25 scenariuszy --- */

const DNI_P = 'Piątek (16.10)'
const DNI_S = 'Sobota (17.10)'
const OBA = `${DNI_P}; ${DNI_S}`
const FINAL = 'Finał konkursu (Sala Konwersatorium)'
const DEBATA3 = 'III debata o geopolityce (Sala Petrus)'
const NIE_BYLO = 'Nie było mnie wtedy'

const scenariusze = [
  // --- rozgałęzienia ------------------------------------------------------
  { nr: 1, nazwa: 'Tylko piątek, anonimowo, minimum', sprawdza: 'sekcje sobotnie puste',
    kto: 'anonimowo', baza: { 'obecnosc-dni': DNI_P }, strategia: minimalna },
  { nr: 2, nazwa: 'Tylko sobota + finał, z imieniem', sprawdza: 'gałąź finału, piątek pusty',
    kto: 'Anna Kowalska', baza: { 'obecnosc-dni': DNI_S, 'sciezka-1600': FINAL }, strategia: realistyczna },
  { nr: 3, nazwa: 'Tylko sobota + III debata', sprawdza: 'gałąź geopolityczna',
    kto: 'anonimowo', baza: { 'obecnosc-dni': DNI_S, 'sciezka-1600': DEBATA3 }, strategia: realistyczna },
  { nr: 4, nazwa: 'Oba dni + finał', sprawdza: 'najszersza ścieżka',
    kto: 'Jan Nowak', baza: { 'obecnosc-dni': OBA, 'sciezka-1600': FINAL }, strategia: realistyczna },
  { nr: 5, nazwa: 'Oba dni + III debata', sprawdza: 'komplet, druga gałąź',
    kto: 'anonimowo', baza: { 'obecnosc-dni': OBA, 'sciezka-1600': DEBATA3 }, strategia: realistyczna },
  { nr: 6, nazwa: 'Oba dni, o 16:00 nieobecny', sprawdza: 'obie gałęzie 16:00 puste',
    kto: 'anonimowo', baza: { 'obecnosc-dni': OBA, 'sciezka-1600': NIE_BYLO }, strategia: realistyczna },
  { nr: 7, nazwa: 'Tylko piątek, ale zaznaczony finał', sprawdza: 'sprzeczność logiczna: finał był w sobotę',
    kto: 'anonimowo', baza: { 'obecnosc-dni': DNI_P, 'sciezka-1600': FINAL }, strategia: realistyczna },
  { nr: 8, nazwa: 'Oba dni, pytanie o 16:00 pominięte', sprawdza: 'brak odpowiedzi w pytaniu nieobowiązkowym',
    kto: 'anonimowo', baza: { 'obecnosc-dni': OBA }, strategia: realistyczna },

  // --- wartości skrajne ---------------------------------------------------
  { nr: 9, nazwa: 'Same najniższe oceny, NPS = 0', sprawdza: 'ZERO nie może zniknąć',
    kto: 'anonimowo', baza: { 'obecnosc-dni': OBA, 'sciezka-1600': FINAL, nps: '0' }, strategia: najnizsze },
  { nr: 10, nazwa: 'Same najwyższe, wszystkie opcje', sprawdza: 'wiele wartości w jednej komórce',
    kto: 'Maria Wiśniewska', baza: { 'obecnosc-dni': OBA, 'sciezka-1600': FINAL, nps: '10' }, strategia: najwyzsze },
  { nr: 11, nazwa: 'Wszędzie „nie było mnie”', sprawdza: 'wartość specjalna zamiast liczby',
    kto: 'anonimowo', baza: { 'obecnosc-dni': OBA, 'sciezka-1600': NIE_BYLO }, strategia: nieobecny },
  { nr: 12, nazwa: 'NPS = 1 przy wysokich ocenach', sprawdza: 'niespójna, ale możliwa odpowiedź',
    kto: 'anonimowo', baza: { 'obecnosc-dni': OBA, 'sciezka-1600': FINAL, nps: '1' }, strategia: najwyzsze },

  // --- style wypełniania --------------------------------------------------
  { nr: 13, nazwa: 'Same oceny, zero wypowiedzi', sprawdza: 'puste kolumny tekstowe',
    kto: 'anonimowo', baza: { 'obecnosc-dni': OBA, 'sciezka-1600': FINAL }, strategia: bezTekstow },
  { nr: 14, nazwa: 'Same wypowiedzi, oceny pominięte', sprawdza: 'puste kolumny liczbowe',
    kto: 'Piotr Lewandowski', baza: { 'obecnosc-dni': OBA, 'sciezka-1600': DEBATA3 }, strategia: tylkoTeksty },
  { nr: 15, nazwa: 'Tylko wymagane, reszta pusta', sprawdza: 'ankieta wypełniona po łebkach',
    kto: 'anonimowo', baza: { 'obecnosc-dni': OBA, 'sciezka-1600': FINAL }, strategia: puste },
  { nr: 16, nazwa: 'Jednoznakowe odpowiedzi', sprawdza: 'kropka jako cała wypowiedź',
    kto: 'anonimowo', baza: { 'obecnosc-dni': DNI_S, 'sciezka-1600': FINAL }, strategia: krotkie },

  // --- treści niebezpieczne dla arkusza ------------------------------------
  { nr: 17, nazwa: 'Znaki specjalne i cudzysłowy', sprawdza: 'nowe linie, ĄĆĘŁŃÓŚŹŻ, =FORMUŁA()',
    kto: 'O\'Brien "Tester"', baza: { 'obecnosc-dni': DNI_S, 'sciezka-1600': DEBATA3 }, strategia: trudny, dopisek: TEKST_TRUDNY },
  { nr: 18, nazwa: 'Ciągi mylone z liczbami i datami', sprawdza: '0001, +48…, 2026-10-16, 1/2, =SUMA(), 1E5, #REF!',
    kto: 'anonimowo', baza: { 'obecnosc-dni': OBA, 'sciezka-1600': FINAL }, strategia: konwersje, dopisek: AUTOKONWERSJA },
  { nr: 19, nazwa: 'HTML i skrypt w treści', sprawdza: 'znaczniki mają zostać zwykłym tekstem',
    kto: 'anonimowo', baza: { 'obecnosc-dni': DNI_S, 'sciezka-1600': FINAL }, strategia: html, dopisek: HTML },
  { nr: 20, nazwa: 'Emoji w wypowiedziach', sprawdza: 'znaki spoza podstawowego zakresu',
    kto: 'Zofia 🌟 Testowa', baza: { 'obecnosc-dni': OBA, 'sciezka-1600': DEBATA3 }, strategia: emoji, dopisek: EMOJI },
  { nr: 21, nazwa: 'Bardzo długie wypowiedzi', sprawdza: 'około 3500 znaków w komórce',
    kto: 'anonimowo', baza: { 'obecnosc-dni': OBA, 'sciezka-1600': FINAL }, strategia: dlugi },
  { nr: 22, nazwa: 'Bardzo długie imię i nazwisko', sprawdza: 'przepełnienie kolumny „Kto wypełnił”',
    kto: 'Katarzyna Maria Anna Kowalska-Nowakowska-Wiśniewska z Zakrzewa Wielkiego', baza: { 'obecnosc-dni': DNI_S, 'sciezka-1600': FINAL }, strategia: realistyczna },

  // --- powtórki tej samej osoby -------------------------------------------
  { nr: 23, nazwa: 'Poprawka odpowiedzi (2. podejście)', sprawdza: 'scenariusz 2 dostaje [nieaktualne]',
    kto: 'Anna Kowalska (poprawka 1)', baza: { 'obecnosc-dni': DNI_S, 'sciezka-1600': FINAL }, strategia: najwyzsze, sesjaZ: 2 },
  { nr: 24, nazwa: 'Kolejna poprawka (3. podejście)', sprawdza: 'dwa starsze wiersze oznaczone, najnowszy czysty',
    kto: 'Anna Kowalska (poprawka 2)', baza: { 'obecnosc-dni': OBA, 'sciezka-1600': DEBATA3 }, strategia: realistyczna, sesjaZ: 2 },
  { nr: 25, nazwa: 'Zmiana zdania: anonimowo → imię', sprawdza: 'ta sama sesja, inny sposób podpisu',
    kto: 'Tomasz Zieliński (był anonimowy)', baza: { 'obecnosc-dni': OBA, 'sciezka-1600': FINAL }, strategia: realistyczna, sesjaZ: 6 },
]

/* ------------------------------------------------------------ wysyłka --- */

const sesje = {}
const wyniki = []

console.log(`\n=== Test ${scenariusze.length} ścieżek przez ankietę ===`)
console.log(`Cel: ${URL.slice(0, 55)}…\n`)

for (const s of scenariusze) {
  const sesja = s.sesjaZ ? sesje[s.sesjaZ] : `test-${s.nr}-${Date.now()}`
  sesje[s.nr] = sesja

  const odpowiedzi = wypelnij(s.baza, s.strategia)

  // Komentarze: wysyłamy KAŻDY klucz, także pusty — tak jak aplikacja, żeby
  // kolumny powstawały w kolejności zgodnej z ankietą.
  for (const sekcja of ankieta.sekcje) {
    for (const p of sekcja.pytania) {
      if (!p.komentarz) continue
      const wypelnione =
        widoczna(sekcja, odpowiedzi) &&
        odpowiedzi[p.id] !== undefined &&
        odpowiedzi[p.id] !== ''
      odpowiedzi[`${p.id}::komentarz`] = wypelnione
        ? `Komentarz ze ścieżki ${s.nr}.`
        : ''
    }
  }
  odpowiedzi['koniec-dopisek'] = s.dopisek ?? ''

  const etykiety = { ...etykietyWszystkich }
  for (const klucz of Object.keys(odpowiedzi)) {
    if (klucz.endsWith('::komentarz')) {
      const bazowy = klucz.replace('::komentarz', '')
      etykiety[klucz] = `${etykietyWszystkich[bazowy] || bazowy} [komentarz]`
    }
  }
  etykiety['koniec-dopisek'] = 'Dodatkowy komentarz na koniec'

  const ladunek = {
    token: TOKEN,
    sesja,
    kto: s.kto,
    wersja: `test-${s.nr}`,
    pulapka: '',
    odpowiedzi,
    etykiety,
  }

  const wypelnionych = Object.values(odpowiedzi).filter(
    (v) => v !== '' && v !== undefined,
  ).length

  process.stdout.write(`${String(s.nr).padStart(2)}. ${s.nazwa.padEnd(42)} `)

  try {
    const odp = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(ladunek),
      redirect: 'follow',
    })
    const tekst = await odp.text()
    let ok = false
    try {
      ok = JSON.parse(tekst).ok === true
    } catch {
      ok = false
    }
    console.log(ok ? `OK  (${String(wypelnionych).padStart(2)} pól)` : `BŁĄD: ${tekst.slice(0, 50)}`)
    wyniki.push({ ...s, ok, wypelnionych })
  } catch (err) {
    console.log(`BŁĄD sieci: ${err.message}`)
    wyniki.push({ ...s, ok: false, wypelnionych })
  }

  await new Promise((r) => setTimeout(r, 700))
}

/* -------------------------------------------------------- podsumowanie --- */

const udane = wyniki.filter((w) => w.ok).length
console.log(`\n=== Wysłano: ${udane} z ${scenariusze.length} ===\n`)
console.log('CO SPRAWDZIĆ W ARKUSZU (kolumna „Wersja ankiety” = test-N):\n')
for (const w of wyniki) {
  console.log(`${String(w.nr).padStart(2)}. ${w.nazwa}`)
  console.log(`    → ${w.sprawdza}`)
}
console.log('')

// process.exit() potrafi uciąć jeszcze niezapisane wyjście. Ustawiamy sam kod
// i pozwalamy Node zakończyć się normalnie, gdy wszystko się wypisze.
process.exitCode = udane === scenariusze.length ? 0 : 1
