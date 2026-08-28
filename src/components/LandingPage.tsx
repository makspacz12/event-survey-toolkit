import { motion } from 'framer-motion'
import { BackgroundPaths } from '@/components/ui/background-paths'
import { Spotlight } from '@/components/ui/spotlight'
import { ActionButton } from '@/components/ui/action-button'
import { RobotStage } from '@/components/robot/RobotStage'

/**
 * LANDING — layout per agreement:
 *   TOP    → survey info (what it is, how long it takes, that it's anonymous),
 *   MIDDLE → 3D robot (isolated RobotStage module),
 *   BOTTOM → one "Start" button.
 * After clicking Start, the page "folds up" (animation in App.tsx) and the survey slides in.
 */
export default function LandingPage({ onStart }: { onStart: () => void }) {
  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-paper">
      {/* layer: background gradients */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(95%_55%_at_50%_112%,rgba(201,161,74,0.16),transparent_55%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(251,248,243,0)_45%,rgba(241,233,219,0.92)_100%)]" />
      </div>

      {/* layer: animated paths + spotlight */}
      <BackgroundPaths />
      <Spotlight
        className="-top-28 left-1/2 -translate-x-1/2 md:-top-20"
        fill="#D8C9A4"
      />

      {/* MIDDLE: 3D robot (isolated module — see components/robot/) */}
      <RobotStage className="absolute inset-x-0 bottom-0 top-[34%] z-10" />

      {/* TOP: survey info (pointer-events-none → cursor passes through
          to the robot; this is CRITICAL for mouse tracking) */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col items-center px-7 pt-[max(2.2rem,env(safe-area-inset-top))] text-center">
        <motion.span
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15 }}
          className="font-spacemono text-[10px] font-medium uppercase leading-relaxed tracking-[0.22em] text-slate-400/70"
        >
          Tyniec · 16 i 17 października 2026
        </motion.span>

        {/* Title: vertical gradient on the first word, second word in flat gold.
            Animated shimmer removed — it's a classic "AI tell" (DESIGN.md §7). */}
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

        {/* subtitle with lines on both sides */}
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

        {/* survey info */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.8 }}
          className="mt-3.5 flex max-w-[20.5rem] flex-col gap-2 text-center"
        >
          <p className="font-dmserif text-[15px] leading-snug text-[#4A3E29]">
            Dziękujemy, że byliście z nami!
          </p>
          <p className="text-[12.5px] leading-[1.5] text-[#6B5D42]">
            Teraz Wasza kolej: powiedzcie nam, co się sprawdziło, a co warto
            zmienić. Wasze opinie realnie wpływają na to, w jaki sposób będzie
            wyglądać kolejna edycja.
          </p>
          {/* Practical info, not a call to action — hence quieter and in a
              smaller font. The short line above it echoes the motif under the
              title and clearly separates it from the invitation text. */}
          <span className="mx-auto mt-1 block h-px w-10 bg-[#C9A14A]/45" />
          <p className="text-[11.5px] leading-snug text-[#8A7A55]">
            Ankieta zajmie około 5 minut i można ją wypełnić anonimowo.
          </p>
        </motion.div>
      </header>

      {/* BOTTOM: Start button (scrim separates it from the robot) */}
      <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-parchment via-parchment/88 to-transparent px-6 pb-[max(1.7rem,env(safe-area-inset-bottom))] pt-12">
        <motion.div
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1.0, ease: [0.22, 1, 0.36, 1] }}
        >
          <ActionButton variant="gold" label="Rozpocznij" onClick={onStart} />
          {/* Event address under the button — a footer, not an instruction. */}
          <p className="mt-2.5 text-center font-spacemono text-[11px] tracking-[0.04em] text-[#8A7A55]">
            masterclassleadership.org
          </p>
        </motion.div>
      </div>
    </div>
  )
}
