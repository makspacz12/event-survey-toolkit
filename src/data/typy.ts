/**
 * Typy danych ankiety. ŹRÓDŁEM TREŚCI jest `ankieta.json` — prosty plik,
 * który może edytować osoba nietechniczna (Mateusz/Marek), nie dotykając kodu.
 *
 * ZASADA ŻELAZNA: `id` pytania to jego „PESEL" — treść wolno zmieniać,
 * `id` NIGDY (po id wiążą się zapisane odpowiedzi).
 */

/** Typy pytań obsługiwane przez renderer (AnswerWidgets). */
export type TypPytania =
  | 'skala' // ocena liczbową „linijką" (min–max)
  | 'tak_nie' // dwa duże przyciski Tak / Nie
  | 'jeden_wybor' // chipy — dokładnie jedna opcja
  | 'wiele_wyborow' // chipy — dowolnie wiele opcji
  | 'tekst' // pytanie otwarte (textarea)

/**
 * Opcja odpowiedzi: zwykły tekst ALBO obiekt z tekstem i zdjęciem
 * (np. prelegent ze zdjęciem — plik w public/prelegenci/).
 */
export type Opcja = string | { tekst: string; zdjecie?: string }

export interface Pytanie {
  id: string
  typ: TypPytania
  tresc: string
  /** dla jeden_wybor / wiele_wyborow */
  opcje?: Opcja[]
  /** dla skala (domyślnie 1–10) */
  min?: number
  max?: number
  wymagane?: boolean
  placeholder?: string
  /** skala: pokaż opcję „nie było mnie" (ocena nie dotyczy) */
  nieobecnosc?: boolean
  /** skala: własny tekst opcji nieobecności (domyślnie „Nie było mnie na tym") */
  nieobecnosc_tekst?: string
  /** pokaż pole „Dodaj komentarz (opcjonalnie)" pod pytaniem */
  komentarz?: boolean
  /** zdjęcie ilustrujące pytanie (okrągły awatar obok treści), np. prelegent */
  zdjecie?: string
  /**
   * Pokaż pytanie tylko przy określonej odpowiedzi na wcześniejsze pytanie.
   * Działa jak `pokaz_jesli` sekcji, ale dla jednego pytania — np. o ocenę
   * jury pytamy tylko tego, kto w ogóle był na finale.
   */
  pokaz_jesli?: Warunek
}

/**
 * Warunek pokazania sekcji ALBO pojedynczego pytania.
 *
 * Przykłady:
 *  • sekcję „Piątek" widzi ten, kto zaznaczył „Piątek (16.10)" → `zawiera`
 *  • pytanie o jury widzi ten, kto ocenił finał, czyli NIE zaznaczył
 *    „nie było mnie" → `rozne_od: "nieobecny"`
 */
export interface Warunek {
  pytanie: string // id pytania filtrującego
  rowne?: string // odpowiedź musi być dokładnie taka (jeden_wybor / tak_nie)
  zawiera?: string // odpowiedź-lista musi zawierać tę opcję (wiele_wyborow)
  rozne_od?: string // odpowiedź musi być inna niż podana (i już udzielona)
}

export interface Sekcja {
  id: string
  /** Pełny tytuł — nagłówek sekcji. */
  tytul: string
  /** Skrót do paska nawigacji (1–2 słowa). Brak → używamy `tytul`. */
  tytul_krotki?: string
  /** Kiedy to się działo — mała etykieta nad tytułem, np. „piątek, wieczór". */
  kiedy?: string
  opis?: string
  pokaz_jesli?: Warunek
  pytania: Pytanie[]
}

export interface Ankieta {
  tytul: string
  podtytul: string
  sekcje: Sekcja[]
}

/** Wartość odpowiedzi — zależnie od typu pytania. */
export type Wartosc = number | string | string[] | null
