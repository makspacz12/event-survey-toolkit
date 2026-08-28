import { useEffect } from 'react'

/**
 * ROBOT TRACKS THE CURSOR AND FINGER
 * ============================
 * The Spline scene has a built-in "look at pointer" behavior, but it only
 * reacts to the mouse. On a phone nothing happens, because a finger produces
 * touch events, not mouse movements.
 *
 * This hook is the translation: it takes the real finger movement on the
 * screen and feeds it to the scene as mouse movement over the canvas. The
 * effect is that the robot's head follows the finger exactly the way it
 * follows the cursor on a computer.
 *
 * WHAT USED TO BE HERE AND WHY IT'S GONE
 * This used to be driven by the gyroscope: the robot was meant to react to
 * tilting the phone. That had two problems. First, in practice it didn't
 * work — iOS requires a separate permission, some browsers never send
 * readings at all, and sensors are blocked over plain HTTP. Second, and
 * worse: the gyroscope loop sent the scene a position roughly 50 times a
 * second REGARDLESS of whether any sensor readings had actually arrived. On
 * a laptop with a touchscreen, and on a phone with no working gyroscope,
 * that meant the scene kept getting "the pointer is in the center" and
 * immediately erased the real cursor's movement. The robot jerked around and
 * snapped back to center instead of smoothly following the head.
 *
 * Now there's no background loop at all: the event only fires when a person
 * actually moves their finger.
 */
export function usePointerTracking(
  containerRef: React.RefObject<HTMLElement>,
) {
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let pending: { x: number; y: number } | null = null
    let frame: number | null = null

    /**
     * We send at most once per frame. A finger can generate several hundred
     * events per second, but the scene only repaints 60 times anyway —
     * without this limit we'd be doing work nobody would ever see.
     */
    const schedule = (x: number, y: number) => {
      pending = { x, y }
      if (frame != null) return
      frame = requestAnimationFrame(() => {
        frame = null
        const pos = pending
        pending = null
        if (!pos) return
        const canvas = container.querySelector('canvas')
        if (!canvas) return
        const options: PointerEventInit & MouseEventInit = {
          clientX: pos.x,
          clientY: pos.y,
          bubbles: true,
          cancelable: true,
          view: window,
        }
        // `pointerType: 'mouse'` is deliberate here: this is how the scene
        // recognizes the pointer it should track with its gaze.
        canvas.dispatchEvent(
          new PointerEvent('pointermove', { ...options, pointerType: 'mouse' }),
        )
        canvas.dispatchEvent(new MouseEvent('mousemove', options))
      })
    }

    // The mouse is handled by the scene itself — here we only deal with touch.
    const onTouch = (e: TouchEvent) => {
      const t = e.touches[0]
      if (t) schedule(t.clientX, t.clientY)
    }
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return
      schedule(e.clientX, e.clientY)
    }

    // `passive: true` — this listener doesn't block page scrolling.
    container.addEventListener('touchmove', onTouch, { passive: true })
    container.addEventListener('touchstart', onTouch, { passive: true })
    container.addEventListener('pointermove', onPointer, { passive: true })
    container.addEventListener('pointerdown', onPointer, { passive: true })

    return () => {
      container.removeEventListener('touchmove', onTouch)
      container.removeEventListener('touchstart', onTouch)
      container.removeEventListener('pointermove', onPointer)
      container.removeEventListener('pointerdown', onPointer)
      if (frame != null) cancelAnimationFrame(frame)
    }
  }, [containerRef])
}
