import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { useSledzenieWskaznika } from '@/hooks/useSledzenieWskaznika'
import { cn } from '@/lib/utils'

/**
 * ROBOT — moduł CELOWO ODIZOLOWANY od reszty aplikacji.
 * =====================================================
 * Robot docelowo będzie inny (inna scena, inny wygląd), dlatego CAŁA jego
 * logika mieszka w tym jednym pliku: scena Spline, śledzenie wskaźnika oraz
 * wersja zapasowa. Wymiana robota to edycja wyłącznie tego pliku.
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
}

/**
 * Czy zamiast sceny 3D pokazać samo zdjęcie robota.
 *
 * DECYDUJE WYŁĄCZNIE ŚWIADOMY WYBÓR CZŁOWIEKA: włączony w przeglądarce tryb
 * oszczędzania danych albo `?lekki=1` w adresie.
 *
 * Wcześniej patrzyliśmy też na `effectiveType` — czyli na to, jak przeglądarka
 * sama ocenia jakość łącza. Okazało się to bezużyteczne: Chrome na zwykłym,
 * szybkim łączu potrafi raportować „3g” i 0,45 Mb/s, bo jest to krocząca
 * średnia z ostatnich zapytań, a nie pomiar przepustowości. Skutek był taki,
 * że robot znikał i zostawało statyczne zdjęcie — u osoby z dobrym internetem.
 *
 * Zgadywanie nie jest tu zresztą potrzebne. Scena i tak doczytuje się w tle,
 * niczego nie blokuje, a gdyby naprawdę nie dotarła, po dwunastu sekundach
 * pokaże się plakat. Wolne łącze załatwia się więc samo, bez przewidywania.
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
  return Boolean(polaczenie?.saveData)
}

export function RobotStage({ className }: { className?: string }) {
  const stageRef = useRef<HTMLDivElement>(null)
  useSledzenieWskaznika(stageRef)
  const [isTouch, setIsTouch] = useState(false)
  const [lekkaWersja, setLekkaWersja] = useState(false)
  /** Scena 3D zgłosiła, że jest gotowa. */
  const [scenaGotowa, setScenaGotowa] = useState(false)
  /** Minął czas, po którym uznajemy, że scena już nie dojdzie. */
  const [scenaNieDoszla, setScenaNieDoszla] = useState(false)
  /** Czy pokazać podpowiedź „Dotknij mnie" przy głowie robota. */
  const [pokazPodpowiedz, setPokazPodpowiedz] = useState(false)

  // Decyzje zależne od urządzenia podejmujemy po zamontowaniu, żeby nie
  // rozjechał się pierwszy render.
  useEffect(() => {
    setLekkaWersja(oszczedzajTransfer())
    setIsTouch(
      typeof window !== 'undefined' &&
        (window.matchMedia('(pointer: coarse)').matches ||
          navigator.maxTouchPoints > 0),
    )
  }, [])

  // Ile czekamy, zanim pokażemy plakat zamiast sceny. Na wolnym łączu scena
  // potrafi schodzić kilka sekund i to normalne — dlatego próg jest wysoki.
  // Chodzi o odróżnienie „wolno” od „w ogóle nie przyjdzie”.
  useEffect(() => {
    if (lekkaWersja || scenaGotowa) return
    const id = window.setTimeout(() => setScenaNieDoszla(true), 12000)
    return () => window.clearTimeout(id)
  }, [lekkaWersja, scenaGotowa])

  /**
   * Podpowiedź przy głowie robota. Pojawia się, gdy scena jest już gotowa
   * (nad szkieletem nie miałaby sensu) i znika w chwili, gdy człowiek dotknie
   * ekranu albo ruszy myszą — czyli dokładnie wtedy, gdy widzi reakcję robota
   * na własne oczy i napis staje się zbędny.
   *
   * Celowo nie chowa się sama po czasie: ktoś może najpierw przeczytać wstęp,
   * a dopiero potem spojrzeć niżej. Znikanie po kilku sekundach sprawiłoby,
   * że część osób nigdy by jej nie zobaczyła.
   */
  useEffect(() => {
    if (lekkaWersja || !scenaGotowa) return
    setPokazPodpowiedz(true)

    const zamknij = () => setPokazPodpowiedz(false)

    // Liczy się wyłącznie ruch człowieka. Śledzenie wskaźnika podaje scenie
    // pozycję palca zdarzeniami tworzonymi w kodzie, a te mają
    // `isTrusted === false` — bez tego warunku podpowiedź gasłaby sama.
    const odCzlowieka = (e: Event) => {
      if (e.isTrusted) zamknij()
    }

    // `touchstart` obok `pointerdown`, bo na części przeglądarek mobilnych
    // dotknięcie płótna sceny 3D bywa przechwytywane i pointerdown nie dociera
    // do okna. Dwa nasłuchy kosztują tyle co nic, a gwarantują, że podpowiedź
    // zniknie po dotknięciu ekranu zawsze.
    window.addEventListener('pointerdown', odCzlowieka)
    window.addEventListener('pointermove', odCzlowieka)
    window.addEventListener('touchstart', odCzlowieka)
    return () => {
      window.removeEventListener('pointerdown', odCzlowieka)
      window.removeEventListener('pointermove', odCzlowieka)
      window.removeEventListener('touchstart', odCzlowieka)
    }
  }, [lekkaWersja, scenaGotowa])

  // Napis mówi wprost, co zrobić, żeby robot zareagował. „Dotknij mnie” było
  // mylące: samo dotknięcie nic nie daje, głowa idzie za RUCHEM palca.
  const trescPodpowiedzi = isTouch ? 'Przesuń palcem' : 'Poruszaj myszką'

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
          onLoad={() => setScenaGotowa(true)}
          className="relative h-full w-full [&>canvas]:!h-full [&>canvas]:!w-full"
        />
      </Suspense>

      {/*
        Plakat WYŁĄCZNIE jako ratunek, nigdy w czasie ładowania.
        Wcześniej leżał pod sceną przez cały czas i przez kilka sekund widać
        było zdjęcie robota w innej pozie, a potem podmieniał się na model 3D.
        Wyglądało to jak dwa różne roboty. Teraz pokazuje się dopiero wtedy,
        gdy scena nie dojdzie w rozsądnym czasie — czyli gdy serwery Spline
        albo unpkg są nieosiągalne z sieci w opactwie.
      */}
      {scenaNieDoszla && !scenaGotowa && (
        <img
          src={PLAKAT}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full object-contain object-bottom"
        />
      )}

      {/*
        Podpowiedź przy głowie robota. Bez niej większość osób nie zauważa, że
        robot w ogóle na nie reaguje — patrzą na statyczny obrazek i klikają
        Start. Znika przy pierwszym ruchu, więc nikomu nie wisi nad ekranem.

        `pointer-events-none` jest tu KRYTYCZNE: kursor musi przechodzić przez
        podpowiedź do płótna sceny, inaczej robot przestałby śledzić mysz
        dokładnie w tym miejscu, w którym zachęcamy do ruchu.
      */}
      {pokazPodpowiedz && (
        <div
          aria-hidden="true"
          className="podpowiedz-robota pointer-events-none absolute right-[7%] top-[12%] z-20 flex items-center gap-2"
        >
          <span className="h-px w-7 bg-gradient-to-l from-[#C9A14A]/75 to-transparent" />
          <span className="whitespace-nowrap rounded-full border border-[#C9A14A]/45 bg-[#070A12]/75 px-3 py-1.5 font-spacemono text-[10px] uppercase tracking-[0.18em] text-[#E2D2A6] backdrop-blur-sm">
            {trescPodpowiedzi}
          </span>
        </div>
      )}
    </div>
  )
}
