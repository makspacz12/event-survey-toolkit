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
  /** for jeden_wybor / wiele_wyborow */
  opcje?: Option[]
  /** for skala (defaults to 1–10) */
  min?: number
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
   * Works like a section's `pokaz_jesli`, but for a single question — e.g. we
   * only ask about the jury's rating from someone who actually attended the final.
   */
  pokaz_jesli?: Condition
}

/**
 * Condition for showing a section OR a single question.
 *
 * Examples:
 *  • the "Friday" section is shown to anyone who checked "Friday (16.10)" → `zawiera`
 *  • the jury question is shown to anyone who rated the final, i.e. did NOT check
 *    "I wasn't there" → `rozne_od: "nieobecny"`
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
