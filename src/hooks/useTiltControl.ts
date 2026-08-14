import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * useTiltControl — przeniesiony 1:1 z prototypu „rating speakers".
 * ---------------
 * Robot Spline „śledzi" użytkownika:
 *  • Desktop (mysz) — wbudowane zachowanie Spline (Look At Pointer); nie ruszamy.
 *  • Telefon (żyroskop) — odczytujemy `deviceorientation` i syntetyzujemy
 *    `pointermove` na <canvas> sceny. iOS 13+ wymaga zgody (z gestu) — `enableGyro()`.
 *
 * DLACZEGO „nie działa na iPhonie" — częste przyczyny (najczęstsza pierwsza):
 *  1) BRAK HTTPS / nie-localhost — iOS Safari blokuje sensory w niebezpiecznym
 *     kontekście. Adres `http://192.168.x.x:5190` ZAWSZE jest blokowany; wystaw
 *     dev-serwer przez tunel HTTPS (np. cloudflared / ngrok) i otwieraj ten URL.
 *  2) Brak zgody — pierwsza interakcja użytkownika MUSI wywołać
 *     `DeviceOrientationEvent.requestPermission()` (oraz `DeviceMotionEvent`).
 *  3) Ustawienia iOS — Ustawienia → Safari → „Ruch i orientacja" musi być WŁ.
 *  4) WebView w innej aplikacji (np. Messenger) — testuj w „natywnym" Safari.
 */

export type TiltState =
  | 'unsupported' // brak czujników / urządzenie nie-touch
  | 'insecure-context' // touch + requestPermission istnieje, ale strona przez HTTP → API zablokowane
  | 'idle' // touch (iOS), czeka na gest użytkownika
  | 'awaiting-permission' // wywołano requestPermission, czekamy
  | 'permission-denied' // użytkownik odmówił (lub odmowa systemowa)
  | 'awaiting-events' // mamy zgodę / Android — czekamy na pierwszy odczyt
  | 'active' // dane lecą, robot się rusza
  | 'no-events' // zgoda jest, ale po ~2 s żadnych zdarzeń

type IOSOrientation = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>
}
type IOSMotion = typeof DeviceMotionEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

function isTouchDevice() {
  if (typeof window === 'undefined') return false
  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    window.matchMedia('(pointer: coarse)').matches
  )
}

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v))

export function useTiltControl(containerRef: React.RefObject<HTMLElement>) {
  const [isTouch, setIsTouch] = useState(false)
  const [state, setState] = useState<TiltState>('unsupported')

  const target = useRef({ x: 0.5, y: 0.5 })
  const current = useRef({ x: 0.5, y: 0.5 })
  const rafRef = useRef<number | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const listeningRef = useRef(false)
  const baselineRef = useRef<{ gamma: number; beta: number } | null>(null)
  const lastEventAtRef = useRef<number>(0)
  const noEventTimerRef = useRef<number | null>(null)

  // ----- handler żyroskopu ---------------------------------------------------
  const handleOrientation = useCallback((e: DeviceOrientationEvent) => {
    if (e.gamma == null && e.beta == null) return
    const gamma = e.gamma ?? 0 // -90..90 (lewo/prawo)
    const beta = e.beta ?? 0 // -180..180 (przód/tył)
    if (!baselineRef.current) baselineRef.current = { gamma, beta }
    const range = 28
    const dGamma = clamp(gamma - baselineRef.current.gamma, -range, range)
    const dBeta = clamp(beta - baselineRef.current.beta, -range, range)
    target.current = {
      x: clamp(0.5 + dGamma / range / 2, 0, 1),
      y: clamp(0.5 + dBeta / range / 2, 0, 1),
    }
    lastEventAtRef.current = Date.now()
    setState((s) => (s === 'active' ? s : 'active'))
  }, [])

  // ----- pętla animacji (lerp + emisja pointer/mouse move na canvas) ---------
  const loop = useCallback(() => {
    const canvas =
      canvasRef.current ??
      (containerRef.current?.querySelector(
        'canvas',
      ) as HTMLCanvasElement | null)
    canvasRef.current = canvas
    if (canvas) {
      current.current.x += (target.current.x - current.current.x) * 0.08
      current.current.y += (target.current.y - current.current.y) * 0.08
      const rect = canvas.getBoundingClientRect()
      const clientX = rect.left + rect.width * current.current.x
      const clientY = rect.top + rect.height * current.current.y
      const opts: PointerEventInit & MouseEventInit = {
        clientX,
        clientY,
        bubbles: true,
        cancelable: true,
        view: window,
      }
      canvas.dispatchEvent(
        new PointerEvent('pointermove', { ...opts, pointerType: 'mouse' }),
      )
      canvas.dispatchEvent(new MouseEvent('mousemove', opts))
    }
    rafRef.current = requestAnimationFrame(loop)
  }, [containerRef])

  // ----- start / stop nasłuchiwania -----------------------------------------
  const stopListening = useCallback(() => {
    window.removeEventListener('deviceorientation', handleOrientation, true)
    window.removeEventListener(
      'deviceorientationabsolute',
      handleOrientation as EventListener,
      true,
    )
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    listeningRef.current = false
    if (noEventTimerRef.current != null) {
      window.clearTimeout(noEventTimerRef.current)
      noEventTimerRef.current = null
    }
  }, [handleOrientation])

  const startListening = useCallback(() => {
    if (listeningRef.current) return
    listeningRef.current = true
    // Główne zdarzenie + fallback (część Androidów emituje tylko wariant absolutny).
    window.addEventListener('deviceorientation', handleOrientation, true)
    window.addEventListener(
      'deviceorientationabsolute',
      handleOrientation as EventListener,
      true,
    )
    if (rafRef.current == null) rafRef.current = requestAnimationFrame(loop)
    setState((s) => (s === 'active' ? s : 'awaiting-events'))
    // „Sensor cisza" — po 2.2 s bez zdarzeń uznajemy, że nie poleci.
    if (noEventTimerRef.current != null)
      window.clearTimeout(noEventTimerRef.current)
    noEventTimerRef.current = window.setTimeout(() => {
      if (lastEventAtRef.current === 0) setState('no-events')
    }, 2200)
  }, [handleOrientation, loop])

  // ----- wywołaj z GESTU (np. dotyk) — prosi o zgodę na iOS -----------------
  const enableGyro = useCallback(async () => {
    if (!isTouch) return
    const DOE =
      typeof DeviceOrientationEvent !== 'undefined'
        ? (DeviceOrientationEvent as IOSOrientation)
        : null
    const DME =
      typeof DeviceMotionEvent !== 'undefined'
        ? (DeviceMotionEvent as IOSMotion)
        : null
    setState('awaiting-permission')
    try {
      const requests: Promise<'granted' | 'denied'>[] = []
      if (DOE && typeof DOE.requestPermission === 'function')
        requests.push(DOE.requestPermission())
      // iOS 13+ wymaga zgody OSOBNO dla DeviceMotion.
      if (DME && typeof DME.requestPermission === 'function')
        requests.push(DME.requestPermission())

      if (requests.length === 0) {
        // urządzenie bez API zgody (Android lub stare iOS) — startuj
        startListening()
        return
      }
      const results = await Promise.all(requests)
      if (results.every((r) => r === 'granted')) {
        startListening()
      } else {
        setState('permission-denied')
      }
    } catch {
      // typowy powód: wywołanie POZA gestem użytkownika → DOMException
      setState('permission-denied')
    }
  }, [isTouch, startListening])

  // ----- klasyfikacja środowiska + auto-start dla Androida ------------------
  useEffect(() => {
    const touch = isTouchDevice()
    setIsTouch(touch)
    if (!touch) {
      setState('unsupported')
      return
    }
    const hasDOE = typeof DeviceOrientationEvent !== 'undefined'
    if (!hasDOE) {
      setState('unsupported')
      return
    }
    const needsPermission =
      typeof (DeviceOrientationEvent as IOSOrientation).requestPermission ===
      'function'
    if (needsPermission) {
      // iOS 13+ — ZAWSZE potrzebuje gestu; przez HTTP w ogóle nie wpuści.
      if (
        typeof window.isSecureContext === 'boolean' &&
        !window.isSecureContext
      ) {
        setState('insecure-context')
      } else {
        setState('idle')
      }
    } else {
      // Android (lub stare iOS) — startuj automatycznie.
      startListening()
    }
    return () => stopListening()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { isTouch, state, enableGyro }
}
