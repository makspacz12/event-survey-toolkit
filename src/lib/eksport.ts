import * as XLSX from 'xlsx'
import ankietaJson from '@/data/ankieta.json'
import type { Ankieta, Opcja } from '@/data/typy'
import type { StanAnkiety } from '@/lib/storage'
import { NIEOBECNY } from '@/components/survey/AnswerWidgets'

/**
 * EKSPORT ODPOWIEDZI DO EXCELA (.xlsx).
 *
 * Odpowiedzi żyją na urządzeniu wypełniającego (localStorage) — dopóki nie ma
 * backendu, ten przycisk jest jedynym sposobem, żeby je stąd wyjąć: uczestnik
 * (albo Ty w czasie testów) pobiera plik i wysyła go dalej.
 *
 * Format arkusza — jeden wiersz = jedno pytanie, kolumny:
 *   Sekcja | Pytanie | Odpowiedź | Komentarz | ID pytania
 * `ID pytania` jest ostatnie, bo to kolumna techniczna — potrzebna, gdy ktoś
 * będzie scalał wiele plików, ale nie zaśmieca widoku przy czytaniu.
 */

const ANKIETA = ankietaJson as Ankieta

const opcjaTekst = (o: Opcja) => (typeof o === 'string' ? o : o.tekst)

/** Zamienia surową wartość na tekst czytelny w arkuszu. */
function czytelna(wartosc: unknown): string {
  if (wartosc == null || wartosc === '') return ''
  if (wartosc === NIEOBECNY) return 'nie było mnie'
  if (Array.isArray(wartosc)) return wartosc.join('; ')
  if (wartosc === 'tak') return 'Tak'
  if (wartosc === 'nie') return 'Nie'
  return String(wartosc)
}

/** Nazwa pliku: ankieta-2026-08-13-anonimowo.xlsx */
function nazwaPliku(stan: StanAnkiety, data: Date): string {
  const dzien = data.toISOString().slice(0, 10)
  const kto =
    stan.intro.imieNazwisko.trim() !== ''
      ? stan.intro.imieNazwisko
          .trim()
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9ąćęłńóśźż-]/gi, '')
      : 'anonimowo'
  return `ankieta-${dzien}-${kto}.xlsx`
}

/**
 * Buduje i pobiera plik .xlsx z odpowiedziami.
 * `data` wstrzykiwana z zewnątrz, żeby dało się to przetestować deterministycznie.
 */
export function eksportujOdpowiedzi(stan: StanAnkiety, data: Date = new Date()) {
  const wiersze: Record<string, string>[] = []

  // Metryczka na górze — kto i kiedy wypełnił.
  wiersze.push({
    Sekcja: 'Metryczka',
    Pytanie: 'Wypełniający',
    Odpowiedź:
      stan.intro.przedstawienie === 'imie' && stan.intro.imieNazwisko.trim()
        ? stan.intro.imieNazwisko.trim()
        : 'anonimowo',
    Komentarz: '',
    'ID pytania': 'meta-kto',
  })
  wiersze.push({
    Sekcja: 'Metryczka',
    Pytanie: 'Data wypełnienia',
    Odpowiedź: data.toLocaleString('pl-PL'),
    Komentarz: '',
    'ID pytania': 'meta-data',
  })

  for (const sekcja of ANKIETA.sekcje) {
    for (const pytanie of sekcja.pytania) {
      const wartosc = stan.odpowiedzi[pytanie.id]
      const komentarz = stan.odpowiedzi[`${pytanie.id}::komentarz`]
      // Pytania bez odpowiedzi też trafiają do arkusza (pusta komórka) —
      // inaczej nie widać, czego ludzie systematycznie nie wypełniają.
      wiersze.push({
        Sekcja: sekcja.tytul,
        Pytanie: pytanie.tresc,
        Odpowiedź: czytelna(wartosc),
        Komentarz: typeof komentarz === 'string' ? komentarz : '',
        'ID pytania': pytanie.id,
      })
    }
  }

  const arkusz = XLSX.utils.json_to_sheet(wiersze)
  arkusz['!cols'] = [
    { wch: 22 }, // Sekcja
    { wch: 60 }, // Pytanie
    { wch: 30 }, // Odpowiedź
    { wch: 40 }, // Komentarz
    { wch: 20 }, // ID pytania
  ]
  const skoroszyt = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(skoroszyt, arkusz, 'Odpowiedzi')
  XLSX.writeFile(skoroszyt, nazwaPliku(stan, data))
}

/** Lista opcji pytania jako tekst — używane przy generowaniu szablonu. */
export function opcjeJakoTekst(opcje: Opcja[] | undefined): string {
  if (!opcje || opcje.length === 0) return ''
  return opcje.map(opcjaTekst).join(' | ')
}
