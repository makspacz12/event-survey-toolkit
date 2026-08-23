import { motion } from 'framer-motion'
import { BackgroundPaths } from '@/components/ui/background-paths'
import { Spotlight } from '@/components/ui/spotlight'
import { ActionButton } from '@/components/ui/action-button'
import { RobotStage } from '@/components/robot/RobotStage'

/**
 * LANDING — układ wg ustaleń:
 *   GÓRA   → informacja o ankiecie (co to jest, ile zajmie, że anonimowo),
 *   ŚRODEK → robot 3D (odizolowany moduł RobotStage),
 *   DÓŁ    → jeden przycisk „Start".
 * Po kliknięciu Start strona „składa się" (animacja w App.tsx) i wjeżdża ankieta.
 */
export default function LandingPage({ onStart }: { onStart: () => void }) {
  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-paper">
      {/* warstwa: gradienty tła */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(95%_55%_at_50%_112%,rgba(201,161,74,0.16),transparent_55%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(251,248,243,0)_45%,rgba(241,233,219,0.92)_100%)]" />
      </div>

      {/* warstwa: animowane ścieżki + spotlight */}
      <BackgroundPaths />
      <Spotlight
        className="-top-28 left-1/2 -translate-x-1/2 md:-top-20"
        fill="#D8C9A4"
      />

      {/* ŚRODEK: robot 3D (moduł odizolowany — patrz components/robot/) */}
      <RobotStage className="absolute inset-x-0 bottom-0 top-[30%] z-10" />

      {/* GÓRA: informacja o ankiecie (pointer-events-none → kursor przechodzi
          do robota; to KRYTYCZNE dla śledzenia myszy) */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col items-center px-7 pt-[max(2.2rem,env(safe-area-inset-top))] text-center">
        <motion.span
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15 }}
          className="font-spacemono text-[10px] font-medium uppercase leading-relaxed tracking-[0.22em] text-slate-400/70"
        >
          Tyniec · 16 i 17 października 2026
        </motion.span>

        {/* Tytuł: pionowy gradient na pierwszym słowie, drugie w płaskim złocie.
            Animowany shimmer usunięty — to klasyczny „AI tell" (DESIGN.md §7). */}
        <motion.h1
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="mt-3 font-display text-[clamp(1.75rem,8.5vw,2.5rem)] font-semibold leading-[0.95] tracking-[-0.02em]"
        >
          <span className="block bg-gradient-to-b from-[#3B3121] to-[#6B5D42] bg-clip-text text-transparent">
            MASTERCLASS
          </span>
          <span className="mt-0.5 block text-[#9C7A2C]">LEADERSHIP</span>
        </motion.h1>

        {/* podtytuł z liniami po bokach */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="mt-3.5 flex items-center gap-3"
        >
          <span className="h-px w-8 bg-gradient-to-r from-transparent to-[#C9A14A]/60" />
          <span className="font-dmserif text-[19px] leading-none text-[#9C7A2C]">
            Ankieta uczestnika
          </span>
          <span className="h-px w-8 bg-gradient-to-l from-transparent to-[#C9A14A]/60" />
        </motion.div>

        {/* informacja o ankiecie */}
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.8 }}
          className="mt-3 max-w-[19rem] text-[12.5px] leading-relaxed text-[#6B5D42]"
        >
          Twoje odpowiedzi decydują o tym, co zmienimy za rok: program, miejsce,
          formułę konkursu. Pięć minut, możesz wypełnić anonimowo.
        </motion.p>
      </header>

      {/* DÓŁ: przycisk Start (scrim oddziela od robota) */}
      <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-parchment via-parchment/88 to-transparent px-6 pb-[max(1.7rem,env(safe-area-inset-bottom))] pt-12">
        <motion.div
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1.0, ease: [0.22, 1, 0.36, 1] }}
        >
          <ActionButton variant="gold" label="Start" onClick={onStart} />
          {/* Podpis pod przyciskiem, nie w nim: mówi wprost, co się stanie
              po kliknięciu, i ile to zajmie. */}
          <p className="mt-2.5 text-center text-[11.5px] leading-relaxed text-[#8A7A55]">
            Start rozpocznie ankietę.
          </p>
        </motion.div>
      </div>
    </div>
  )
}
