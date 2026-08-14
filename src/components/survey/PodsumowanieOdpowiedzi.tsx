import ankietaJson from '@/data/ankieta.json'
import type { Ankieta, Pytanie, Sekcja, Warunek, Wartosc } from '@/data/typy'
import { NIEOBECNY } from '@/components/survey/AnswerWidgets'

const ANKIETA = ankietaJson as Ankieta

/**
 * PODSUMOWANIE NA EKRANIE KOŃCOWYM.
 *
 * Zastąpiło przyciski „Pobierz swoje odpowiedzi” i „Wypełnij od nowa”.
 * Uczestnik po wysłaniu chce zobaczyć, co właściwie napisał — nie operować
 * plikami. Pokazujemy więc same odpowiedzi, bez pytań, na które nie
 * odpowiedział, i bez sekcji, których nie widział.
 */

function widoczna(sekcja: Sekcja, odpowiedzi: Record<string, Wartosc>): boolean {
  const w: Warunek | undefined = sekcja.pokaz_jesli
  if (!w) return true
  const wartosc = odpowiedzi[w.pytanie]
  if (w.rowne != null) return wartosc === w.rowne
  if (w.zawiera != null)
    return Array.isArray(wartosc) && wartosc.includes(w.zawiera)
  return true
}

/** Odpowiedź w formie do pokazania. `null` = pominięta, nie wyświetlamy. */
function sformatuj(p: Pytanie, w: Wartosc): string | null {
  if (w == null || w === '') return null
  if (w === NIEOBECNY) return 'nie było mnie'
  if (Array.isArray(w)) return w.length ? w.join(', ') : null
  if (w === 'tak') return 'Tak'
  if (w === 'nie') return 'Nie'
  // Skala pokazuje wartość razem z maksimum, żeby „7” nie wisiało bez kontekstu.
  if (p.typ === 'skala' && typeof w === 'number') return `${w} / ${p.max ?? 10}`
  return String(w)
}

export function PodsumowanieOdpowiedzi({
  odpowiedzi,
}: {
  odpowiedzi: Record<string, Wartosc>
}) {
  const sekcje = ANKIETA.sekcje
    .filter((s) => widoczna(s, odpowiedzi))
    .map((s) => ({
      sekcja: s,
      pozycje: s.pytania
        .map((p) => ({ pytanie: p, tekst: sformatuj(p, odpowiedzi[p.id] ?? null) }))
        .filter((x) => x.tekst !== null),
    }))
    .filter((g) => g.pozycje.length > 0)

  if (sekcje.length === 0) return null

  const ile = sekcje.reduce((s, g) => s + g.pozycje.length, 0)

  return (
    <section className="mt-10">
      <div className="mb-4 flex items-baseline justify-between gap-3 border-b border-[#3B3121]/12 pb-2">
        <h3 className="font-spacemono text-[10px] uppercase tracking-[0.22em] text-[#9C8345]">
          Twoje odpowiedzi
        </h3>
        <span className="font-spacemono text-[10px] tabular-nums text-[#B0A283]">
          {ile}
        </span>
      </div>

      <div className="flex flex-col gap-5">
        {sekcje.map(({ sekcja, pozycje }) => (
          <div key={sekcja.id}>
            <h4 className="mb-2 font-dmserif text-[18px] leading-tight text-[#9C7A2C]">
              {sekcja.tytul_krotki ?? sekcja.tytul}
            </h4>
            <dl className="flex flex-col gap-2.5">
              {pozycje.map(({ pytanie, tekst }) => (
                <div
                  key={pytanie.id}
                  className="border-l-2 border-[#C9A14A]/25 pl-3"
                >
                  <dt className="text-[12.5px] leading-snug text-[#8A7A55]">
                    {pytanie.tresc}
                  </dt>
                  <dd className="mt-0.5 text-[14.5px] leading-snug text-[#3B3121]">
                    {tekst}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </section>
  )
}
