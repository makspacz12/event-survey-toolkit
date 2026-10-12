/**
 * Survey data types. The SOURCE OF CONTENT is `ankieta.json` — a simple file
 * that a non-technical person (Mateusz/Marek) can edit without touching code.
 *
 * IRON RULE: a question's `id` is its "SSN" — the content may change,
 * `id` NEVER (saved answers are tied to the id).
 */

/** Question types supported by the renderer (AnswerWidgets). */
export type QuestionType =
  | 'skala' // numeric rating on a "ruler" (min–max)
  | 'tak_nie' // two big buttons Yes / No
  | 'jeden_wybor' // chips — exactly one option
  | 'wiele_wyborow' // chips — any number of options
  | 'ranking' // chips — a few options IN ORDER, tap order is the ranking
  | 'tekst' // open question (textarea)

/**
 * Answer option: plain text OR an object with text and an image
 * (e.g. a speaker with a photo — a file in public/prelegenci/).
 */
export type Option = string | { tekst: string; zdjecie?: string }

export interface Question {
  id: string
  typ: QuestionType
  tresc: string
  /** for jeden_wybor / wiele_wyborow / ranking */
  opcje?: Option[]
  /** for skala (defaults to 1–10) */
  min?: number
  /** skala: top of the scale. ranking: how many places there are (default 3). */
  max?: number
  wymagane?: boolean
  placeholder?: string
  /** skala: show the "I wasn't there" option (rating doesn't apply) */
  nieobecnosc?: boolean
  /** skala: custom text for the absence option (default "Nie brałem(-am) udziału") */
  nieobecnosc_tekst?: string
  /** show an "Add comment (optional)" field under the question */
  komentarz?: boolean
  /** image illustrating the question (round avatar next to the content), e.g. a speaker */
  zdjecie?: string
  /**
   * Show the question only for a specific answer to an earlier question.
   * Works like a section's `pokaz_jesli`, but for a single question.
   */
  pokaz_jesli?: Condition
  /**
   * HIDE the question for a specific answer to an earlier question — e.g.
   * "who contributed most to this debate?" disappears once the debate itself
   * is marked "I did not attend", and any pick already made is dropped.
   * Unlike `pokaz_jesli` + `rozne_od`, an unanswered parent keeps the
   * question visible: people may name a speaker before rating the debate.
   */
  ukryj_jesli?: Condition
}

/**
 * Condition for showing or hiding a section OR a single question.
 *
 * Examples:
 *  • the "Friday" section is shown to anyone who answered "Tak" to the Friday
 *    attendance question → `rowne: "tak"`
 *  • the "who contributed most" ranking is hidden for anyone who marked that
 *    debate as not attended → `ukryj_jesli` with `rowne: "nieobecny"`
 *  • `rozne_od` shows a question only once its parent is answered with
 *    something else — "did not attend" excluded, unanswered excluded too
 */
export interface Condition {
  pytanie: string // id of the filtering question
  rowne?: string // the answer must match exactly (jeden_wybor / tak_nie)
  zawiera?: string // the list answer must contain this option (wiele_wyborow)
  rozne_od?: string // the answer must differ from the given one (and already be given)
}

export interface Section {
  id: string
  /** Full title — section heading. */
  tytul: string
  /** Short form for the nav bar (1–2 words). Falls back to `tytul` if absent. */
  tytul_krotki?: string
  /** When this happened — small label above the title, e.g. "Friday evening". */
  kiedy?: string
  opis?: string
  pokaz_jesli?: Condition
  pytania: Question[]
}

export interface Survey {
  tytul: string
  podtytul: string
  sekcje: Section[]
}

/** Answer value — depends on the question type. */
export type Value = number | string | string[] | null
