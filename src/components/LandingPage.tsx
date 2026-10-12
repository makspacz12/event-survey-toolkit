import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { BackgroundPaths } from '@/components/ui/background-paths'
import { Spotlight } from '@/components/ui/spotlight'
import { ActionButton } from '@/components/ui/action-button'
import { RobotStage, ROBOT_GEOMETRY } from '@/components/robot/RobotStage'
import { fitLanding, type Fit, type RobotGeometry } from '@/lib/landingFit'
import { cn } from '@/lib/utils'

/**
 * Measures the real screen and lays the landing page out to fit it.
 *
 * The arithmetic is in src/lib/landingFit.ts; this hook only supplies it with
 * numbers and reruns it whenever one of them can have changed:
 *
 *  - the page itself resizes, which is how a phone's address bar sliding in
 *    and out shows up (the page is 100dvh tall, so its height follows the bar),
 *  - the text block changes height, which happens when the web fonts arrive
 *    after first paint and the lines re-wrap,
 *  - the Start block changes height (a safe-area inset on a notched phone),
 *  - the phone is rotated.
 *
 * Every measurement is a LAYOUT size (clientHeight, offsetHeight), never a
 * bounding rect. The text block is scaled with a transform and the entrance
 * animations move things with transforms too; layout sizes ignore both, so
 * the numbers do not depend on what the result of the last run was, and the
 * hook cannot chase its own tail.
 */
function useLandingFit(robot: RobotGeometry) {
  const rootRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState<Fit | null>(null)

  const measure = useCallback(() => {
    const root = rootRef.current
    const header = headerRef.current
    const text = textRef.current
    const bottom = bottomRef.current
    if (!root || !header || !text || !bottom) return

    const screenH = root.clientHeight
    const padTop = parseFloat(getComputedStyle(header).paddingTop) || 0
    // The Start block is pinned to the bottom, and its top padding is a
    // see-through scrim, not the button: the button starts below it.
    const scrim = parseFloat(getComputedStyle(bottom).paddingTop) || 0
    const next = fitLanding({
      screenH,
      padTop,
      textH: text.offsetHeight,
      buttonTop: screenH - bottom.offsetHeight + scrim,
      robot,
    })
    setFit((prev) =>
      prev &&
      prev.mode === next.mode &&
      Math.abs(prev.scale - next.scale) < 0.002 &&
      Math.abs((prev.stageTop ?? -1) - (next.stageTop ?? -1)) < 0.5
        ? prev
        : next,
    )
  }, [robot])

  useLayoutEffect(() => {
    measure()
    const observer = new ResizeObserver(measure)
    for (const ref of [rootRef, textRef, bottomRef]) {
      if (ref.current) observer.observe(ref.current)
    }
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)
    window.visualViewport?.addEventListener('resize', measure)
    document.fonts?.ready.then(measure).catch(() => {})
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
      window.visualViewport?.removeEventListener('resize', measure)
    }
  }, [measure])

  return { fit, rootRef, headerRef, textRef, bottomRef }
}

/**
 * LANDING — layout per agreement:
 *   TOP    → survey info (what it is, how long it takes, that it's anonymous),
 *   MIDDLE → 3D robot (isolated RobotStage module),
 *   BOTTOM → one "Start" button.
 * After clicking Start, the page "folds up" (animation in App.tsx) and the survey slides in.
 */
export default function LandingPage({ onStart }: { onStart: () => void }) {
  const [robot, setRobot] = useState<RobotGeometry>(ROBOT_GEOMETRY.scene)
  const { fit, rootRef, headerRef, textRef, bottomRef } = useLandingFit(robot)

  const scroll = fit?.mode === 'scroll'
  const robotFits = fit?.mode === 'robot'
  // Once the 1.3 MB scene has been mounted it stays mounted, hidden if need
  // be, so an address bar that flips the layout back and forth does not make
  // the phone download and build the robot again each time.
  const robotMounted = useRef(false)
  if (robotFits) robotMounted.current = true

  return (
    <div
      ref={rootRef}
      className={cn(
        'relative h-[100dvh] w-full bg-paper',
        // A screen too short for the text scrolls instead of overlapping.
        scroll ? 'overflow-y-auto overflow-x-hidden' : 'overflow-hidden',
      )}
    >
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
      {/* Its top edge is computed, not a fixed percentage: see landingFit.ts.
          Not rendered until the screen has been measured, so a phone with no
          room for the robot never starts downloading it. */}
      {robotMounted.current && (
        <RobotStage
          onGeometry={setRobot}
          className={cn(
            'absolute inset-x-0 bottom-0 z-10',
            !robotFits && 'pointer-events-none invisible',
          )}
          style={{ top: fit?.stageTop ?? '34%' }}
        />
      )}

      {/* TOP: survey info (pointer-events-none → cursor passes through
          to the robot; this is CRITICAL for mouse tracking) */}
      <header
        ref={headerRef}
        className={cn(
          'pointer-events-none inset-x-0 top-0 z-20 px-7 pt-[max(2.2rem,env(safe-area-inset-top))] text-center',
          scroll ? 'relative' : 'absolute',
        )}
      >
        {/* The text block is one unit so it can be scaled as one. A transform
            keeps every line break where it is, which is what makes the scaled
            height exactly (natural height x scale) and the layout computable
            in one step instead of by trial and error. */}
        <div
          ref={textRef}
          className="flex w-full flex-col items-center"
          style={{
            transform: fit && fit.scale < 1 ? `scale(${fit.scale})` : undefined,
            transformOrigin: 'top center',
          }}
        >
        <motion.span
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15 }}
          className="font-spacemono text-[11px] font-medium uppercase leading-relaxed tracking-[0.22em] text-slate-400/70"
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
          <span className="font-dmserif text-[21px] leading-none text-[#9C7A2C]">
            Ankieta uczestnika
          </span>
          <span className="h-px w-8 bg-gradient-to-l from-transparent to-[#C9A14A]/60" />
        </motion.div>

        {/* survey info */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.8 }}
          className="mt-3.5 flex max-w-[22rem] flex-col gap-2 text-center"
        >
          <p className="font-dmserif text-[17px] leading-snug text-[#4A3E29]">
            Dziękujemy, że byliście z nami!
          </p>
          <p className="text-[14px] leading-[1.5] text-[#6B5D42]">
            Teraz Wasza kolej: powiedzcie nam, co się sprawdziło, a co warto
            zmienić. Wasze opinie realnie wpływają na to, w jaki sposób będzie
            wyglądać kolejna edycja.
          </p>
          {/* Practical info, not a call to action — hence quieter and in a
              smaller font. The short line above it echoes the motif under the
              title and clearly separates it from the invitation text. */}
          <span className="mx-auto mt-1 block h-px w-10 bg-[#C9A14A]/45" />
          <p className="text-[13px] leading-snug text-[#8A7A55]">
            Ankieta zajmie około 5 minut i można ją wypełnić anonimowo.
          </p>
        </motion.div>
        </div>
      </header>

      {/* BOTTOM: Start button (scrim separates it from the robot) */}
      <div
        ref={bottomRef}
        className={cn(
          'inset-x-0 bottom-0 z-20 bg-gradient-to-t from-parchment via-parchment/88 to-transparent px-6 pb-[max(1.7rem,env(safe-area-inset-bottom))] pt-12',
          scroll ? 'relative' : 'absolute',
        )}
      >
        <motion.div
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1.0, ease: [0.22, 1, 0.36, 1] }}
        >
          <ActionButton variant="gold" label="Rozpocznij" onClick={onStart} />
          {/* Event address under the button — a footer, not an instruction. */}
          <p className="mt-2.5 text-center font-spacemono text-[12px] tracking-[0.04em] text-[#8A7A55]">
            masterclassleadership.org
          </p>
        </motion.div>
      </div>
    </div>
  )
}
