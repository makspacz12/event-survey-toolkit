import { useEffect } from 'react'

/**
 * ROBOT ŚLEDZI KURSOR I PALEC
 * ============================
 * Scena Spline ma wbudowane zachowanie „patrz na wskaźnik", ale reaguje tylko
 * na mysz. Na telefonie nie dzieje się nic, bo palec generuje zdarzenia
 * dotyku, nie ruchy myszy.
 *
 * Ten hook to tłumaczenie: bierze prawdziwy ruch palca po ekranie i podaje go
 * scenie jako ruch myszy nad płótnem. Efekt jest taki, że robot wodzi głową
 * za palcem dokładnie tak, jak na komputerze za kursorem.
 *
 * CO TU BYŁO WCZEŚNIEJ I DLACZEGO ZNIKŁO
 * Wcześniej sterował tym żyroskop: robot miał reagować na przechylanie
 * telefonu. Miało to dwie wady. Po pierwsze, w praktyce nie działało — iOS
 * wymaga osobnej zgody, część przeglądarek nie wysyła odczytów wcale, a przez
 * HTTP sensory są zablokowane. Po drugie, i gorzej: pętla żyroskopu wysyłała
 * scenie pozycję około 50 razy na sekundę NIEZALEŻNIE od tego, czy przyszły
 * jakiekolwiek odczyty z czujnika. Na laptopie z ekranem dotykowym i na
 * telefonie bez działającego żyroskopu oznaczało to, że scena bez przerwy
 * dostawała „wskaźnik jest na środku" i natychmiast kasowała ruch prawdziwego
 * kursora. Robot szarpał się i wracał na środek zamiast płynnie wodzić głową.
 *
 * Teraz nie ma żadnej pętli w tle: zdarzenie leci wyłącznie wtedy, gdy człowiek
 * naprawdę przesunie palcem.
 */
export function useSledzenieWskaznika(
  containerRef: React.RefObject<HTMLElement>,
) {
  useEffect(() => {
    const kontener = containerRef.current
    if (!kontener) return

    let oczekujaca: { x: number; y: number } | null = null
    let klatka: number | null = null

    /**
     * Wysyłamy najwyżej raz na klatkę. Palec potrafi wygenerować kilkaset
     * zdarzeń na sekundę, a scena i tak przerysowuje się 60 razy — bez tego
     * ograniczenia robilibyśmy pracę, której nikt nie zobaczy.
     */
    const zaplanuj = (x: number, y: number) => {
      oczekujaca = { x, y }
      if (klatka != null) return
      klatka = requestAnimationFrame(() => {
        klatka = null
        const poz = oczekujaca
        oczekujaca = null
        if (!poz) return
        const canvas = kontener.querySelector('canvas')
        if (!canvas) return
        const opcje: PointerEventInit & MouseEventInit = {
          clientX: poz.x,
          clientY: poz.y,
          bubbles: true,
          cancelable: true,
          view: window,
        }
        // `pointerType: 'mouse'` jest tu celowe: scena rozpoznaje w ten sposób
        // wskaźnik, za którym ma wodzić wzrokiem.
        canvas.dispatchEvent(
          new PointerEvent('pointermove', { ...opcje, pointerType: 'mouse' }),
        )
        canvas.dispatchEvent(new MouseEvent('mousemove', opcje))
      })
    }

    // Mysz obsługuje sama scena — tu zajmujemy się wyłącznie dotykiem.
    const naDotyk = (e: TouchEvent) => {
      const t = e.touches[0]
      if (t) zaplanuj(t.clientX, t.clientY)
    }
    const naWskaznik = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return
      zaplanuj(e.clientX, e.clientY)
    }

    // `passive: true` — nie blokujemy przewijania strony tym nasłuchem.
    kontener.addEventListener('touchmove', naDotyk, { passive: true })
    kontener.addEventListener('touchstart', naDotyk, { passive: true })
    kontener.addEventListener('pointermove', naWskaznik, { passive: true })
    kontener.addEventListener('pointerdown', naWskaznik, { passive: true })

    return () => {
      kontener.removeEventListener('touchmove', naDotyk)
      kontener.removeEventListener('touchstart', naDotyk)
      kontener.removeEventListener('pointermove', naWskaznik)
      kontener.removeEventListener('pointerdown', naWskaznik)
      if (klatka != null) cancelAnimationFrame(klatka)
    }
  }, [containerRef])
}
