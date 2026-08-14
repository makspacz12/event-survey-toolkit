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

  // Dopisek z ekranu końcowego — nie należy do żadnej sekcji.
  const dopisek = stan.odpowiedzi['koniec-dopisek']
  odpowiedzi['koniec-dopisek'] = typeof dopisek === 'string' ? dopisek : ''
  etykiety['koniec-dopisek'] = 'Dodatkowy komentarz na koniec'

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
 * `Content-Type: text/plain` jest tu celowe: Apps Script nie odpowiada na
 * zapytania wstępne CORS (preflight), a nagłówek `application/json` takie
 * zapytanie wymusza. Tekst omija problem, a skrypt i tak parsuje JSON.
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
    if (!odp.ok) return false
    const wynik = await odp.json().catch(() => null)
    return wynik ? wynik.ok === true : true
  } catch {
    return false
  }
}

/**
 * Wysyła odpowiedzi. Gdy się nie uda, ląduje w kolejce i zostanie ponowione.
 * Zwraca `true` przy sukcesie.
 */
export async function wyslijOdpowiedzi(stan: StanAnkiety): Promise<boolean> {
  if (!wysylkaSkonfigurowana) return false
  const dane = zbudujDane(stan)
  const ok = await wyslijRaz(dane)
  if (!ok) doKolejki(dane)
  return ok
}

/**
 * Próbuje wysłać wszystko, co czeka w kolejce. Wywoływane przy starcie
 * aplikacji i po powrocie połączenia.
 */
export async function oproznijKolejke(): Promise<number> {
  if (!wysylkaSkonfigurowana) return 0
  const kolejka = pobierzKolejke()
  if (kolejka.length === 0) return 0

  const pozostale: unknown[] = []
  let wyslane = 0
  for (const dane of kolejka) {
    const ok = await wyslijRaz(dane)
    if (ok) wyslane++
    else pozostale.push(dane)
  }
  zapiszKolejke(pozostale)
  return wyslane
}

/** Ile ładunków czeka na wysłanie. */
export function ileWKolejce(): number {
  return pobierzKolejke().length
}
