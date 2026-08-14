import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { useTiltControl } from '@/hooks/useTiltControl'
import { cn } from '@/lib/utils'

/**
 * ROBOT — moduł CELOWO ODIZOLOWANY od reszty aplikacji.
 * =====================================================
 * Robot docelowo będzie inny (inna scena, inny wygląd), dlatego CAŁA jego
 * logika mieszka w tym jednym pliku: scena Spline, żyroskop, aktywacja na iOS
 * oraz wersja zapasowa. Wymiana robota to edycja wyłącznie tego pliku.
 *
 * WAGA: scena Spline to około 1,3 MB po kompresji, czyli większość wagi całej
 * aplikacji (sama ankieta to około 200 kB). Dlatego:
 *
 *  • ładujemy ją leniwie, już po wyświetleniu strony (Suspense),
 *  • na wolnym łączu albo przy włączonym oszczędzaniu danych pokazujemy
 *    ZAMIAST NIEJ zdjęcie robota (16 kB) i w ogóle nie pobieramy sceny.
 *
 * Uczestnik na słabym LTE dostaje więc landing, który wchodzi od razu, zamiast
 * kilkunastu sekund czekania na scenę 3D.
 */

const ROBOT_SCENE =
  'https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode'

/** Lekkie zdjęcie sceny — zrzut z tej samej sceny Spline. */
const PLAKAT = '/robot-plakat.jpg'

const Spline = lazy(() => import('@splinetool/react-spline'))

type Polaczenie = {
  saveData?: boolean
  effectiveType?: string
}

/**
 * Czy warto oszczędzać transfer? Sprawdzamy tryb oszczędzania danych i realną
 * jakość łącza. Gdy przeglądarka nie udostępnia tych informacji (Safari),
 * zakładamy łącze dobre i pokazujemy pełną scenę.
 */
function oszczedzajTransfer(): boolean {
  if (typeof navigator === 'undefined') return false

  // Przełącznik do testów: dopisz ?lekki=1 do adresu, żeby zobaczyć wersję
  // z plakatem na dowolnym urządzeniu (?lekki=0 wymusza pełną scenę).
  if (typeof window !== 'undefined') {
    const param = new URLSearchParams(window.location.search).get('lekki')
    if (param === '1') return true
    if (param === '0') return false
  }

  const polaczenie = (navigator as Navigator & { connection?: Polaczenie })
    .connection
  if (!polaczenie) return false
  if (polaczenie.saveData) return true
  const typ = polaczenie.effectiveType
  return typ === 'slow-2g' || typ === '2g' || typ === '3g'
}

export function RobotStage({ className }: { className?: string }) {
  const stageRef = useRef<HTMLDivElement>(null)
  const { isTouch, state, enableGyro } = useTiltControl(stageRef)
  const [lekkaWersja, setLekkaWersja] = useState(false)

  // Decyzję podejmujemy po zamontowaniu, żeby nie rozjechał się pierwszy render.
  useEffect(() => {
    setLekkaWersja(oszczedzajTransfer())
  }, [])

  // Pierwszy dotyk gdziekolwiek na stronie aktywuje żyroskop (iOS wymaga, by
  // prośba o zgodę wyszła z gestu użytkownika). Działa cicho: jeśli się nie
  // uda, robot po prostu nie reaguje na przechył, a mysz działa zawsze.
  useEffect(() => {
    if (lekkaWersja) return
    if (!isTouch || state !== 'idle') return
    const onFirstTouch = () => {
      void enableGyro()
    }
    window.addEventListener('pointerdown', onFirstTouch, { once: true })
    return () => window.removeEventListener('pointerdown', onFirstTouch)
  }, [isTouch, state, enableGyro, lekkaWersja])

  if (lekkaWersja) {
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
      {/*
        Plakat leży POD sceną 3D. Gdy scena się wczyta, jej płótno zasłania go
        w całości i nikt go nie zobaczy. Gdy jednak nie dojdzie — bo serwery
        Spline albo unpkg są nieosiągalne z sieci w opactwie — zamiast pustego
        prostokąta zostaje zdjęcie robota. Kosztuje 16 kB i nie wymaga
        żadnej logiki, która mogłaby się sama zepsuć.
      */}
      <img
        src={PLAKAT}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full object-contain object-bottom"
      />
      <Suspense
        fallback={
          // Szkielet w kształcie sylwetki robota, nie spinner (DESIGN.md §4).
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
          className="relative h-full w-full [&>canvas]:!h-full [&>canvas]:!w-full"
        />
      </Suspense>
    </div>
  )
}
