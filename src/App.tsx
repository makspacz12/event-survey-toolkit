import { lazy, Suspense, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import LandingPage from '@/components/LandingPage'
import { PhoneFrame } from '@/components/PhoneFrame'
import { GranicaBledu } from '@/components/GranicaBledu'

// Ankieta lazy — błąd w jej imporcie nigdy nie może położyć landingu.
const wczytajAnkiete = () => import('@/components/survey/SurveyFlow')
const SurveyFlow = lazy(wczytajAnkiete)

/**
 * Routing po hashu (bez biblioteki, jak w prototypie):
 *   ''          → LandingPage (info + robot + Start)
 *   '#/ankieta' → SurveyFlow
 * Przejście Start → ankieta: landing „SKŁADA SIĘ" (scaleY → 0, origin top,
 * jak zamykana roleta), po czym wjeżdża ankieta.
 */

function getRoute() {
  return window.location.hash.replace(/^#\/?/, '').split('/')[0]
}

/** Szkielet ankiety na czas doładowania trasy — nie spinner (DESIGN.md §4). */
function RouteLoader() {
  return (
    <div className="min-h-[100dvh] w-full bg-gradient-to-b from-paper to-parchment px-5 pt-8">
      <div className="mx-auto flex max-w-[26rem] flex-col gap-3.5">
        <span className="skeleton h-4 w-24" />
        <span className="skeleton h-8 w-52" />
        <span className="skeleton mt-3 h-32 w-full" />
        <span className="skeleton h-32 w-full" />
      </div>
    </div>
  )
}

export default function App() {
  const [route, setRoute] = useState(getRoute())

  useEffect(() => {
    const onHash = () => setRoute(getRoute())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  /**
   * Ankietę ściągamy w tle już na ekranie startowym, zamiast czekać na
   * kliknięcie „Start”. Uczestnik czyta wtedy wstęp i ogląda robota, więc te
   * kilkadziesiąt kilobajtów zdąży dojść niezauważenie. Gdy później zabraknie
   * zasięgu, ankieta i tak się otworzy — jest już w pamięci przeglądarki.
   *
   * `requestIdleCallback` odkłada pobranie na moment, w którym przeglądarka
   * nie ma nic pilniejszego, żeby nie konkurować z pierwszym wyświetleniem.
   */
  useEffect(() => {
    if (route === 'ankieta') return
    const pobierz = () => {
      void wczytajAnkiete().catch(() => {
        // Brak sieci teraz nic nie psuje: spróbujemy jeszcze raz przy Starcie,
        // a gdyby i wtedy się nie udało, złapie to GranicaBledu.
      })
    }
    const idle = window.requestIdleCallback
    if (idle) {
      const id = idle(pobierz, { timeout: 2500 })
      return () => window.cancelIdleCallback?.(id)
    }
    const id = window.setTimeout(pobierz, 1200)
    return () => window.clearTimeout(id)
  }, [route])

  return (
    <PhoneFrame>
      <AnimatePresence mode="wait">
        {route === 'ankieta' ? (
          <motion.div
            key="ankieta"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            <GranicaBledu>
              <Suspense fallback={<RouteLoader />}>
                <SurveyFlow />
              </Suspense>
            </GranicaBledu>
          </motion.div>
        ) : (
          <motion.div
            key="landing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, scaleY: 1 }}
            exit={{ scaleY: 0, opacity: 0.2 }}
            transition={{ duration: 0.5, ease: [0.65, 0, 0.35, 1] }}
            style={{ transformOrigin: 'top center' }}
          >
            <LandingPage
              onStart={() => {
                window.location.hash = '/ankieta'
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </PhoneFrame>
  )
}
