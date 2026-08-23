import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { Sekcja } from '@/data/typy'

/**
 * NAWIGACJA SEKCJI — pasek segmentów zamiast kafelków.
 *
 * Kafelki z nazwami wychodziły poza ekran i wymagały przewijania w bok. Tutaj
 * każda część ankiety to jeden segment (kreska): wypełniony = coś już w nim
 * jest, złoty i grubszy = bieżący. Nazwa bieżącego segmentu stoi pod paskiem.
 *
 * PIERWSZY SEGMENT TO „PRZEDSTAWIENIE" (ekran intro). Dzięki temu można do
 * niego wrócić w dowolnym momencie wypełniania i dopisać albo usunąć swoje
 * dane, zamiast cofać się przyciskiem „Wstecz" przez wszystkie sekcje.
 */

/** Indeks używany dla ekranu intro (przed pierwszą sekcją). */
export const INTRO = -1

export function SectionNav({
  sekcje,
  aktywna,
  rozpoczeta,
  introWypelnione,
  onWybierz,
}: {
  sekcje: Sekcja[]
  /** Indeks bieżącej sekcji albo `INTRO` dla ekranu przedstawienia. */
  aktywna: number
  rozpoczeta: (s: Sekcja) => boolean
  /** Czy na ekranie intro dokonano już wyboru (imię albo anonimowo). */
  introWypelnione: boolean
  /** Zwraca indeks sekcji albo `INTRO`. */
  onWybierz: (index: number) => void
}) {
  const segmenty = [
    {
      klucz: '__intro',
      indeks: INTRO,
      nazwa: 'Start',
      pelna: 'Zanim zaczniemy',
      wypelniony: introWypelnione,
      // Dopóki nie wiadomo, czy ktoś wypełnia anonimowo, nie puszczamy go
      // dalej — inaczej przeskoczyłby wybór, którego wymaga ankieta.
      zablokowany: false,
    },
    ...sekcje.map((s, i) => ({
      klucz: s.id,
      indeks: i,
      nazwa: s.tytul_krotki ?? s.tytul,
      pelna: s.tytul,
      wypelniony: rozpoczeta(s),
      zablokowany: !introWypelnione,
    })),
  ]

  const biezacy = segmenty.find((s) => s.indeks === aktywna)

  return (
    <div className="mt-3">
      <div className="flex items-end gap-1">
        {segmenty.map((seg) => {
          const jestAktywny = seg.indeks === aktywna
          return (
            <button
              key={seg.klucz}
              type="button"
              disabled={seg.zablokowany}
              onClick={() => onWybierz(seg.indeks)}
              title={
                seg.zablokowany
                  ? 'Najpierw wybierz, czy się przedstawiasz'
                  : seg.pelna
              }
              aria-label={`Przejdź do: ${seg.pelna}`}
              aria-current={jestAktywny ? 'step' : undefined}
              className={cn(
                // py-3 zamiast py-2: sama kreska ma 3 px, więc bez zapasu
                // obszar dotykowy miał ~18 px i trudno było w niego trafić.
                'group relative rounded py-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A14A]',
                // Segment „Przedstawienie" jest węższy: to krótki krok, nie
                // pełnoprawna sekcja z pytaniami.
                seg.indeks === INTRO ? 'w-6 shrink-0' : 'flex-1',
                seg.zablokowany ? 'cursor-not-allowed' : 'cursor-pointer',
              )}
            >
              <motion.span
                layout
                transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                className={cn(
                  'block rounded-full transition-colors duration-300',
                  jestAktywny
                    ? 'h-[3px] bg-[#C9A14A]'
                    : seg.wypelniony
                      ? 'h-[2px] bg-[#C9A14A]/45 group-hover:bg-[#C9A14A]/70'
                      : 'h-[2px] bg-[#3B3121]/15 group-hover:bg-[#3B3121]/30',
                )}
              />
            </button>
          )
        })}
      </div>

      {/* nazwa bieżącego kroku + licznik (intro nie ma numeru) */}
      <div className="mt-0.5 flex items-baseline justify-between gap-3">
        <motion.span
          key={biezacy?.klucz ?? 'brak'}
          initial={{ opacity: 0, y: -3 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="truncate font-spacemono text-[10px] uppercase tracking-[0.18em] text-[#9C8345]"
        >
          {biezacy?.nazwa ?? ''}
        </motion.span>
        <span className="shrink-0 font-spacemono text-[10px] tabular-nums tracking-[0.14em] text-[#B0A283]">
          {aktywna === INTRO ? 'start' : `${aktywna + 1}/${sekcje.length}`}
        </span>
      </div>
    </div>
  )
}
