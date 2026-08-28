import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { Section } from '@/data/typy'

/**
 * SECTION NAV — a bar of segments instead of tiles.
 *
 * Named tiles used to overflow the screen and require horizontal scrolling.
 * Here each survey part is one segment (a tick mark): filled = something's
 * already in it, gold and thicker = current. The current segment's name
 * sits below the bar.
 *
 * THE FIRST SEGMENT IS "INTRODUCTION" (the intro screen). This lets a
 * respondent go back to it at any point while filling out the survey and
 * add or remove their details, instead of clicking "Back" through every
 * section.
 */

/** Index used for the intro screen (before the first section). */
export const INTRO = -1

export function SectionNav({
  sekcje,
  aktywna,
  rozpoczeta,
  introWypelnione,
  onWybierz,
}: {
  sekcje: Section[]
  /** Index of the current section, or `INTRO` for the intro screen. */
  aktywna: number
  rozpoczeta: (s: Section) => boolean
  /** Whether a choice was already made on the intro screen (name or anonymous). */
  introWypelnione: boolean
  /** Returns a section index, or `INTRO`. */
  onWybierz: (index: number) => void
}) {
  const segments = [
    {
      klucz: '__intro',
      indeks: INTRO,
      nazwa: 'Start',
      pelna: 'Zanim zaczniemy',
      wypelniony: introWypelnione,
      // Until we know whether someone is filling this out anonymously, we
      // don't let them move on — otherwise they'd skip a choice the survey
      // requires.
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

  const current = segments.find((s) => s.indeks === aktywna)

  return (
    <div className="mt-3">
      <div className="flex items-end gap-1">
        {segments.map((seg) => {
          const isActive = seg.indeks === aktywna
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
              aria-current={isActive ? 'step' : undefined}
              className={cn(
                // py-3 instead of py-2: the tick mark itself is only 3px,
                // so without extra padding the tap target was ~18px and
                // hard to hit.
                'group relative rounded py-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A14A]',
                // The "Introduction" segment is narrower: it's a short
                // step, not a full section with questions.
                seg.indeks === INTRO ? 'w-6 shrink-0' : 'flex-1',
                seg.zablokowany ? 'cursor-not-allowed' : 'cursor-pointer',
              )}
            >
              <motion.span
                layout
                transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                className={cn(
                  'block rounded-full transition-colors duration-300',
                  isActive
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

      {/* current step's name + counter (intro has no number) */}
      <div className="mt-0.5 flex items-baseline justify-between gap-3">
        <motion.span
          key={current?.klucz ?? 'brak'}
          initial={{ opacity: 0, y: -3 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="truncate font-spacemono text-[10px] uppercase tracking-[0.18em] text-[#9C8345]"
        >
          {current?.nazwa ?? ''}
        </motion.span>
        <span className="shrink-0 font-spacemono text-[10px] tabular-nums tracking-[0.14em] text-[#B0A283]">
          {aktywna === INTRO ? 'start' : `${aktywna + 1}/${sekcje.length}`}
        </span>
      </div>
    </div>
  )
}
