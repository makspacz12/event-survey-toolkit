import ankietaJson from '@/data/ankieta.json'
import type { Ankieta } from '@/data/typy'
import type { StanAnkiety } from '@/lib/storage'
import { NIEOBECNY } from '@/components/survey/AnswerWidgets'

/**
 * WYSYŁKA ODPOWIEDZI DO ARKUSZA GOOGLE
 * =====================================
 * Aplikacja NIE MA żadnych poświadczeń Google i mieć ich nie może: wszystko,
 * co jest w kodzie strony, widzi każdy przez „pokaż źródło”. Zamiast tego
 * wysyłamy dane pod adres skryptu Apps Script, który działa już na koncie
 * właściciela arkusza i to on ma prawo zapisu.
 *
 * `TOKEN` poniżej nie jest kluczem do Google, tylko hasłem do naszego
 * endpointu. Gdyby wyciekł, najgorsze co może zrobić obca osoba to dopisać
 * fałszywe wiersze. Nie odczyta cudzych odpowiedzi ani niczego nie skasuje.
 *
 * Wysyłka jest ODPORNA NA BRAK SIECI: nieudana próba ląduje w kolejce w
 * pamięci telefonu i jest ponawiana przy następnym otwarciu strony oraz gdy
 * przeglądarka zgłosi powrót połączenia.
 */

const ANKIETA = ankietaJson as Ankieta

const URL = import.meta.env.VITE_ARKUSZ_URL as string | undefined
const TOKEN = import.meta.env.VITE_ARKUSZ_TOKEN as string | undefined

/** Wersja treści ankiety — ułatwia rozróżnienie odpowiedzi po zmianie pytań. */
const WERSJA = '2026-08-13'

const KLUCZ_KOLEJKI = 'ctn-kolejka-wysylki-v1'
const KLUCZ_SESJI = 'ctn-sesja-v1'

export type StatusWysylki = 'brak-konfiguracji' | 'gotowe' | 'wysylanie' | 'wyslano' | 'blad'

/** Czy wysyłka jest w ogóle skonfigurowana (są adres i token). */
export const wysylkaSkonfigurowana = Boolean(URL && TOKEN)

if (!wysylkaSkonfigurowana) {
  // Głośne ostrzeżenie, bo to najgroźniejsza cicha awaria tej aplikacji:
  // ankieta wygląda na sprawną, ludzie ją wypełniają, a odpowiedzi nigdzie
  // nie docierają. Jedno otwarcie strony po wdrożeniu wystarczy, żeby to
  // wyłapać.
  console.warn(
    '[ankieta] WYSYŁKA WYŁĄCZONA — brak VITE_ARKUSZ_URL lub VITE_ARKUSZ_TOKEN. ' +
      'Odpowiedzi zostaną tylko w przeglądarce uczestnika. ' +
      'Po dodaniu zmiennych trzeba zbudować aplikację na nowo (Redeploy).',
  )
}

/**
 * Stały identyfikator urządzenia. Pozwala rozpoznać, że ta sama osoba
 * wypełnia drugi raz, bez zbierania jakichkolwiek danych o niej.
 */
function idSesji(): string {
  try {
    const zapisany = localStorage.getItem(KLUCZ_SESJI)
    if (zapisany) return zapisany
    const nowy =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `s-${Date.now()}-${Math.random().toString(36).slice(2)}`
    localStorage.setItem(KLUCZ_SESJI, nowy)
    return nowy
  } catch {
    return `s-${Date.now()}`
  }
}

/**
 * Zapomina dotychczasowy identyfikator, więc następne wypełnienie na tym
 * urządzeniu liczy się jako osobna odpowiedź.
 *
 * Wywołujemy to po potwierdzonej wysyłce, razem z czyszczeniem odpowiedzi.
 * Jest to KONIECZNE, a nie kosmetyczne: gdyby identyfikator został, a ankietę
 * wypełniłby potem ktoś inny (jeden telefon podawany dalej), skrypt uznałby
 * jego odpowiedzi za poprawkę poprzednich i oznaczyłby wiersz pierwszej osoby
 * jako nieaktualny.
 */
export function zapomnijSesje() {
  try {
    localStorage.removeItem(KLUCZ_SESJI)
  } catch {
    /* brak dostępu do pamięci — trudno, następna wysyłka i tak zadziała */
  }
}

/** Zamienia wartość na tekst czytelny w arkuszu. */
function czytelna(w: unknown): string {
  if (w == null || w === '') return ''
  if (w === NIEOBECNY) return 'nie było mnie'
  if (Array.isArray(w)) return w.join('; ')
  if (w === 'tak') return 'Tak'
  if (w === 'nie') return 'Nie'
  return String(w)
}

/** Buduje ładunek wysyłany do skryptu. */
function zbudujDane(stan: StanAnkiety) {
  const odpowiedzi: Record<string, string> = {}
  const etykiety: Record<string, string> = {}

  // WAŻNA KOLEJNOŚĆ: wysyłamy KAŻDE pytanie i KAŻDY dopuszczony komentarz,
  // także puste. Kolumna w arkuszu powstaje przy pierwszym wystąpieniu klucza,
  // więc pomijanie pustych wartości wypychałoby komentarze na koniec arkusza,
  // z dala od pytań, których dotyczą. Puste pola nic nie kosztują, a układ
  // kolumn jest wtedy taki sam jak układ ankiety.
  for (const sekcja of ANKIETA.sekcje) {
    for (const p of sekcja.pytania) {
      odpowiedzi[p.id] = czytelna(stan.odpowiedzi[p.id])
      etykiety[p.id] = p.tresc

      if (p.komentarz) {
        const kom = stan.odpowiedzi[`${p.id}::komentarz`]
        odpowiedzi[`${p.id}::komentarz`] = typeof kom === 'string' ? kom : ''
        etykiety[`${p.id}::komentarz`] = `${p.tresc} [komentarz]`
      }
    }
  }

  return {
    token: TOKEN,
    sesja: idSesji(),
    kto:
      stan.intro.przedstawienie === 'imie' && stan.intro.imieNazwisko.trim()
        ? stan.intro.imieNazwisko.trim()
        : 'anonimowo',
    wersja: WERSJA,
    pulapka: '', // wypełnią tylko automaty
    odpowiedzi,
    etykiety,
  }
}

/** Zapisuje ładunek do kolejki (gdy wysyłka się nie powiodła). */
function doKolejki(dane: unknown) {
  try {
    const raw = localStorage.getItem(KLUCZ_KOLEJKI)
    const kolejka: unknown[] = raw ? JSON.parse(raw) : []
    kolejka.push(dane)
    localStorage.setItem(KLUCZ_KOLEJKI, JSON.stringify(kolejka))
  } catch {
    // brak miejsca w pamięci — trudno, użytkownik ma jeszcze pobranie pliku
  }
}

function pobierzKolejke(): unknown[] {
  try {
    const raw = localStorage.getItem(KLUCZ_KOLEJKI)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function zapiszKolejke(kolejka: unknown[]) {
  try {
    if (kolejka.length === 0) localStorage.removeItem(KLUCZ_KOLEJKI)
    else localStorage.setItem(KLUCZ_KOLEJKI, JSON.stringify(kolejka))
  } catch {
    /* jw. */
  }
}

/**
 * Pojedyncza próba wysyłki.
 *
 * `Content-Type: text/plain` MUSI tu zostać. Apps Script nie odpowiada na
 * zapytania wstępne CORS (preflight), a `application/json` takie zapytanie
 * wymusza. Zwykły tekst omija problem, a skrypt i tak parsuje JSON.
 *
 * DLACZEGO NIE `mode: 'no-cors'`
 * ==============================
 * Wcześniej było tu `no-cors`, w przekonaniu, że przeglądarka nie da odczytać
 * odpowiedzi Google. Sprawdzone w przeglądarce: daje. Google przekierowuje na
 * `script.googleusercontent.com`, ale ta odpowiedź ma nagłówek zezwalający na
 * odczyt, więc zwykły `fetch` zwraca normalne `{"ok":true}`.
 *
 * Różnica jest zasadnicza. W trybie `no-cors` odpowiedź jest „nieprzezroczysta”
 * i KAŻDA awaria po stronie Google wyglądała jak sukces: uczestnik widział
 * zieloną informację „Wysłano do organizatora”, a w arkuszu nie było nic.
 * Test obciążenia pokazał, że przy 50 osobach naraz w ten sposób przepadało
 * ponad połowa odpowiedzi — po cichu. Teraz nieudany zapis jest widoczny:
 * ląduje w kolejce i zostaje ponowiony.
 */
async function wyslijRaz(dane: unknown): Promise<boolean> {
  if (!URL) return false
  try {
    const odp = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(dane),
      redirect: 'follow',
    })
    const tresc = await odp.text()
    try {
      return (JSON.parse(tresc) as { ok?: boolean }).ok === true
    } catch {
      // Zamiast JSON-a przyszedł HTML — najczęściej strona logowania Google,
      // czyli wdrożenie nie jest ustawione na „dostęp: wszyscy”.
      console.warn('[ankieta] serwer odpowiedział nie-JSON-em:', tresc.slice(0, 120))
      return false
    }
  } catch {
    // Najczęściej brak połączenia. Ładunek trafi do kolejki i spróbujemy
    // ponownie, gdy sieć wróci.
    return false
  }
}

/** Identyfikuje ładunek w kolejce, żeby dało się usunąć właściwy wpis. */
function kluczLadunku(dane: unknown): string {
  const d = dane as { sesja?: string; wersja?: string }
  return `${d?.sesja ?? ''}|${d?.wersja ?? ''}`
}

/**
 * Wysyła odpowiedzi. Gdy się nie uda, ląduje w kolejce i zostanie ponowione.
 * Zwraca `true` przy sukcesie.
 *
 * Po udanej wysyłce usuwamy z kolejki wcześniejsze próby tej samej sesji.
 * Bez tego ręczne „Spróbuj teraz” zostawiało w kolejce starą kopię, która
 * wychodziła przy następnym otwarciu strony i tworzyła w arkuszu drugi,
 * uboższy wiersz tej samej osoby.
 */
export async function wyslijOdpowiedzi(stan: StanAnkiety): Promise<boolean> {
  if (!wysylkaSkonfigurowana) return false
  const dane = zbudujDane(stan)

  let ok = await wyslijRaz(dane)
  if (!ok) {
    // Jedna ponowna próba po chwili. Najczęstsza przyczyna niepowodzenia to
    // tłok w pierwszych minutach po rozesłaniu ankiety — wtedy druga próba
    // trafia już w luźniejszą kolejkę. Czekamy tyle, żeby nie dokładać do
    // szczytu, ale na tyle krótko, żeby uczestnik jeszcze patrzył w ekran.
    await new Promise((r) => setTimeout(r, 2500))
    ok = await wyslijRaz(dane)
  }

  if (ok) usunZKolejki(kluczLadunku(dane))
  else doKolejki(dane)
  return ok
}

function usunZKolejki(klucz: string) {
  const kolejka = pobierzKolejke()
  const pozostale = kolejka.filter((d) => kluczLadunku(d) !== klucz)
  if (pozostale.length !== kolejka.length) zapiszKolejke(pozostale)
}

/**
 * Czy opróżnianie już trwa. Bez tej flagi dwa równoległe przebiegi (start
 * aplikacji + zdarzenie „online”) czytałyby tę samą kolejkę i wysłały
 * wszystko podwójnie.
 */
let opróżnianieWToku = false

/**
 * Próbuje wysłać wszystko, co czeka w kolejce. Wywoływane przy starcie
 * aplikacji i po powrocie połączenia.
 *
 * WAŻNE: usuwamy z kolejki wyłącznie te wpisy, które faktycznie poszły —
 * odczytując ją na nowo tuż przed zapisem. Wcześniejsza wersja nadpisywała
 * kolejkę listą wyliczoną PRZED pętlą, więc ankieta dorzucona w trakcie
 * (uczestnik kończył wypełnianie, gdy sieć właśnie wracała) była kasowana
 * bez wysłania.
 */
export async function oproznijKolejke(): Promise<number> {
  if (!wysylkaSkonfigurowana || opróżnianieWToku) return 0
  opróżnianieWToku = true
  try {
    const doWyslania = pobierzKolejke()
    if (doWyslania.length === 0) return 0

    let wyslane = 0
    for (const dane of doWyslania) {
      const ok = await wyslijRaz(dane)
      if (!ok) continue
      wyslane++
      // Odczyt na nowo: w czasie oczekiwania na odpowiedź kolejka mogła się
      // powiększyć o świeżo zakończoną ankietę.
      const aktualna = pobierzKolejke()
      zapiszKolejke(aktualna.filter((d) => d !== dane && kluczLadunku(d) !== kluczLadunku(dane)))
    }
    return wyslane
  } finally {
    opróżnianieWToku = false
  }
}

/** Ile ładunków czeka na wysłanie. */
export function ileWKolejce(): number {
  return pobierzKolejke().length
}
