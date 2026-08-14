import type { Wartosc } from '@/data/typy'

/**
 * Zapis stanu ankiety do localStorage („cache" przeglądarki).
 * KAŻDA zmiana odpowiedzi jest zapisywana od razu — po odświeżeniu strony,
 * zamknięciu karty czy utracie zasięgu użytkownik wraca dokładnie tam,
 * gdzie skończył. Wersja w kluczu (`v1`) pozwala w przyszłości bezboleśnie
 * zmienić format (stary klucz po prostu ignorujemy).
 */

const KLUCZ = 'ctn-ankieta-mlodzi-v1'

export interface Intro {
  /** null = jeszcze nie wybrał; 'imie' = przedstawia się; 'anonimowo' = bez danych */
  przedstawienie: 'imie' | 'anonimowo' | null
  imieNazwisko: string
}

export interface StanAnkiety {
  intro: Intro
  odpowiedzi: Record<string, Wartosc>
  ukonczona: boolean
  /**
   * Ostatnio oglądana sekcja (indeks) — po odświeżeniu strony użytkownik
   * wraca dokładnie tam, gdzie skończył, a nie na początek ankiety.
   */
  biezacaSekcja: number
}

export const pustyStan: StanAnkiety = {
  intro: { przedstawienie: null, imieNazwisko: '' },
  odpowiedzi: {},
  ukonczona: false,
  biezacaSekcja: 0,
}

export function wczytajStan(): StanAnkiety {
  try {
    const raw = localStorage.getItem(KLUCZ)
    if (!raw) return pustyStan
    const parsed = JSON.parse(raw) as Partial<StanAnkiety>
    return {
      intro: { ...pustyStan.intro, ...parsed.intro },
      odpowiedzi: parsed.odpowiedzi ?? {},
      ukonczona: parsed.ukonczona ?? false,
      biezacaSekcja: parsed.biezacaSekcja ?? 0,
    }
  } catch {
    // uszkodzony zapis (np. ręczna edycja) — zaczynamy od zera
    return pustyStan
  }
}

export function zapiszStan(stan: StanAnkiety) {
  try {
    localStorage.setItem(KLUCZ, JSON.stringify(stan))
  } catch {
    // brak miejsca / tryb prywatny — trudno, aplikacja działa dalej bez cache
  }
}

export function wyczyscStan() {
  try {
    localStorage.removeItem(KLUCZ)
  } catch {
    /* jw. */
  }
}
