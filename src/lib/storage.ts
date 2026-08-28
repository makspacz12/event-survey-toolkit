import type { Value } from '@/data/typy'

/**
 * Saves survey state to localStorage (the browser "cache").
 * EVERY answer change is saved immediately — after a page refresh, closing
 * the tab, or losing signal the user comes back exactly where they left off.
 * The version in the key (`v1`) lets us change the format painlessly in the
 * future (the old key is simply ignored).
 */

const KEY = 'ctn-ankieta-mlodzi-v1'

export interface Intro {
  /** null = not chosen yet; 'imie' = gives their name; 'anonimowo' = no details */
  przedstawienie: 'imie' | 'anonimowo' | null
  imieNazwisko: string
}

export interface SurveyState {
  intro: Intro
  odpowiedzi: Record<string, Value>
  ukonczona: boolean
  /**
   * Last viewed section (index) — after a page refresh the user comes back
   * exactly where they left off, not at the start of the survey.
   */
  biezacaSekcja: number
}

export const emptyState: SurveyState = {
  intro: { przedstawienie: null, imieNazwisko: '' },
  odpowiedzi: {},
  ukonczona: false,
  biezacaSekcja: 0,
}

export function loadState(): SurveyState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return emptyState
    const parsed = JSON.parse(raw) as Partial<SurveyState>
    return {
      intro: { ...emptyState.intro, ...parsed.intro },
      odpowiedzi: parsed.odpowiedzi ?? {},
      ukonczona: parsed.ukonczona ?? false,
      biezacaSekcja: parsed.biezacaSekcja ?? 0,
    }
  } catch {
    // corrupted save (e.g. manual edit) — start from scratch
    return emptyState
  }
}

export function saveState(state: SurveyState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // no space / private mode — fine, the app keeps working without cache
  }
}

export function clearState() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* same as above */
  }
}
