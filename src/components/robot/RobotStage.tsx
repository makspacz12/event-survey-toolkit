import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { usePointerTracking } from '@/hooks/usePointerTracking'
import { cn } from '@/lib/utils'

/**
 * ROBOT — a module DELIBERATELY ISOLATED from the rest of the app.
 * =====================================================
 * The robot will eventually change (a different scene, a different look),
 * so ALL of its logic lives in this one file: the Spline scene, pointer
 * tracking, and the fallback. Swapping the robot means editing only this
 * file.
 *
 * WEIGHT: the Spline scene is about 1.3 MB compressed, i.e. most of the
 * whole app's weight (the survey itself is about 200 kB). So:
 *
 *  • we load it lazily, only after the page has already rendered (Suspense),
 *  • on a slow connection or with data saver on, we show a photo of the
 *    robot INSTEAD (16 kB) and never fetch the scene at all.
 *
 * A participant on weak LTE therefore gets a landing page that loads right
 * away, instead of waiting several seconds for the 3D scene.
 */

const ROBOT_SCENE =
  'https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode'

/** Lightweight photo of the scene — a screenshot of that same Spline scene. */
const PLAKAT = '/robot-plakat.jpg'

const Spline = lazy(() => import('@splinetool/react-spline'))

type Connection = {
  saveData?: boolean
}

/**
 * Whether to show just the robot photo instead of the 3D scene.
 *
 * DECIDED ONLY BY A DELIBERATE HUMAN CHOICE: data saver mode enabled in the
 * browser, or `?lekki=1` in the URL.
 *
 * We used to also look at `effectiveType` — i.e. the browser's own guess at
 * connection quality. That turned out to be useless: Chrome on a normal,
 * fast connection can report "3g" and 0.45 Mb/s, because it's a rolling
 * average of recent requests, not a bandwidth measurement. The result was
 * that the robot would disappear and leave a static image — for someone
 * with good internet.
 *
 * Guessing isn't actually needed here anyway. The scene loads in the
 * background regardless, blocks nothing, and if it truly never arrives, the
 * poster shows up after twelve seconds. A slow connection thus resolves
 * itself, without prediction.
 */
function shouldSaveData(): boolean {
  if (typeof navigator === 'undefined') return false

  // Testing switch: append ?lekki=1 to the URL to see the poster version on
  // any device (?lekki=0 forces the full scene).
  if (typeof window !== 'undefined') {
    const param = new URLSearchParams(window.location.search).get('lekki')
    if (param === '1') return true
    if (param === '0') return false
  }

  const connection = (navigator as Navigator & { connection?: Connection })
    .connection
  return Boolean(connection?.saveData)
}

export function RobotStage({ className }: { className?: string }) {
  const stageRef = useRef<HTMLDivElement>(null)
  usePointerTracking(stageRef)
  const [isTouch, setIsTouch] = useState(false)
  const [lightVersion, setLightVersion] = useState(false)
  /** The 3D scene reported that it's ready. */
  const [sceneReady, setSceneReady] = useState(false)
  /** Enough time has passed that we consider the scene as never arriving. */
  const [sceneTimedOut, setSceneTimedOut] = useState(false)
  /** Whether to show the "Touch me" hint near the robot's head. */
  const [showHint, setShowHint] = useState(false)

  // Device-dependent decisions are made after mounting, so the first render
  // doesn't get out of sync.
  useEffect(() => {
    setLightVersion(shouldSaveData())
    setIsTouch(
      typeof window !== 'undefined' &&
        (window.matchMedia('(pointer: coarse)').matches ||
          navigator.maxTouchPoints > 0),
    )
  }, [])

  // How long we wait before showing the poster instead of the scene. On a
  // slow connection the scene can take several seconds to load and that's
  // normal — hence the high threshold. The point is to tell "slow" apart
  // from "will never arrive at all."
  useEffect(() => {
    if (lightVersion || sceneReady) return
    const id = window.setTimeout(() => setSceneTimedOut(true), 12000)
    return () => window.clearTimeout(id)
  }, [lightVersion, sceneReady])

  /**
   * Hint near the robot's head. Appears once the scene is ready (it wouldn't
   * make sense over the skeleton loader) and disappears the moment the
   * person touches the screen or moves the mouse — i.e. exactly when they
   * see the robot react with their own eyes and the text becomes redundant.
   *
   * Deliberately doesn't hide itself after a timeout: someone might read the
   * intro first and only look down afterward. Disappearing after a few
   * seconds would mean some people would never see it at all.
   */
  useEffect(() => {
    if (lightVersion || !sceneReady) return
    setShowHint(true)

    const close = () => setShowHint(false)

    // Only genuine human movement counts. Pointer tracking feeds the scene
    // finger position via events created in code, and those have
    // `isTrusted === false` — without this check the hint would vanish on
    // its own.
    const fromHuman = (e: Event) => {
      if (e.isTrusted) close()
    }

    // `touchstart` alongside `pointerdown`, because on some mobile browsers
    // touching the 3D scene's canvas gets captured and pointerdown never
    // reaches the window. Two listeners cost nothing and guarantee the hint
    // always disappears on a screen touch.
    window.addEventListener('pointerdown', fromHuman)
    window.addEventListener('pointermove', fromHuman)
    window.addEventListener('touchstart', fromHuman)
    return () => {
      window.removeEventListener('pointerdown', fromHuman)
      window.removeEventListener('pointermove', fromHuman)
      window.removeEventListener('touchstart', fromHuman)
    }
  }, [lightVersion, sceneReady])

  // The text says outright what to do to make the robot react. "Touch me"
  // was misleading: touching alone does nothing, the head follows the
  // MOVEMENT of the finger.
  const hintText = isTouch ? 'Przesuń palcem' : 'Poruszaj myszką'

  if (lightVersion) {
    return (
      <div className={cn('relative', className)}>
        <img
          src={PLAKAT}
          alt=""
          className="h-full w-full object-contain object-bottom"
        />
      </div>
    )
  }

  return (
    <div ref={stageRef} className={cn('relative', className)}>
      <Suspense
        fallback={
          // Skeleton shaped like the robot's silhouette, not a spinner (DESIGN.md §4).
          <div className="flex h-full w-full items-end justify-center pb-[12%]">
            <div className="flex w-[46%] flex-col items-center gap-3">
              <span className="skeleton h-16 w-16 rounded-full" />
              <span className="skeleton h-28 w-full rounded-xl" />
            </div>
          </div>
        }
      >
        <Spline
          scene={ROBOT_SCENE}
          onLoad={() => setSceneReady(true)}
          className="relative h-full w-full [&>canvas]:!h-full [&>canvas]:!w-full"
        />
      </Suspense>

      {/*
        Poster is ONLY a fallback, never shown while loading.
        It used to sit underneath the scene the whole time, and for a few
        seconds you'd see the robot photo in a different pose before it swapped
        to the 3D model. It looked like two different robots. Now it only
        appears once the scene fails to arrive within a reasonable time —
        i.e. when the Spline or unpkg servers are unreachable from the
        network at the abbey.
      */}
      {sceneTimedOut && !sceneReady && (
        <img
          src={PLAKAT}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full object-contain object-bottom"
        />
      )}

      {/*
        Hint near the robot's head. Without it most people don't notice the
        robot reacts to them at all — they see a static image and click
        Start. It disappears on the first movement, so it never lingers over
        the screen for anyone.

        `pointer-events-none` is CRITICAL here: the cursor must pass through
        the hint to the scene's canvas, otherwise the robot would stop
        tracking the mouse exactly where we're encouraging movement.
      */}
      {showHint && (
        <div
          aria-hidden="true"
          className="podpowiedz-robota pointer-events-none absolute right-[7%] top-[12%] z-20 flex items-center gap-2"
        >
          <span className="h-px w-7 bg-gradient-to-l from-[#9C7A2C]/70 to-transparent" />
          <span className="whitespace-nowrap rounded-full border border-[#C9A14A]/45 bg-[#FBF8F3]/90 px-3 py-1.5 font-spacemono text-[10px] uppercase tracking-[0.18em] text-[#9C7A2C] backdrop-blur-sm">
            {hintText}
          </span>
        </div>
      )}
    </div>
  )
}
