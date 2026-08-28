import { Component, type ReactNode } from 'react'

/**
 * SAFETY NET UNDER THE SURVEY
 * ==================================
 * The survey is lazily loaded from the network only after clicking "Start".
 * If there's no signal in that one second (an abbey, 300 people on one
 * transmitter), the import fails and React unmounts the ENTIRE tree — the
 * participant gets a blank white page with no explanation and no way to
 * retry.
 *
 * This component turns the blank page into a readable message with a button.
 * Answers stay safe no matter what: they live in the phone's storage and
 * come back when the page is reopened.
 *
 * This has to be a class — React has no equivalent of `componentDidCatch`
 * in function components.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    // Visible in the console, in case someone needs to diagnose a
    // participant's report.
    console.error('[ankieta] screen failure:', error)
  }

  render() {
    if (!this.state.error) return this.props.children

    const brakSieci = !navigator.onLine

    return (
      <div className="flex min-h-[100dvh] w-full flex-col items-center justify-center bg-gradient-to-b from-paper to-parchment px-6 text-center">
        <span
          className="font-spacemono text-[10px] uppercase tracking-[0.22em]"
          style={{ color: '#8A7A55' }}
        >
          {brakSieci ? 'brak połączenia' : 'coś poszło nie tak'}
        </span>
        <h2
          className="mt-3 font-dmserif text-[26px] leading-tight"
          style={{ color: '#3B3121' }}
        >
          {brakSieci
            ? 'Nie udało się wczytać ankiety'
            : 'Ankieta się nie otworzyła'}
        </h2>
        <p
          className="mt-3 max-w-[22rem] text-[13px] leading-relaxed"
          style={{ color: '#6B5D42' }}
        >
          {brakSieci
            ? 'Wygląda na to, że telefon stracił zasięg. Wróć w miejsce z lepszym połączeniem i spróbuj ponownie. Odpowiedzi, które już zaznaczyłeś(-aś), są zapisane w telefonie i nic z nich nie zniknie.'
            : 'Spróbuj otworzyć ją jeszcze raz. Odpowiedzi, które już zaznaczyłeś(-aś), są zapisane w telefonie.'}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-7 rounded-full px-7 py-3.5 font-display text-[14px] tracking-wide transition-transform active:translate-y-[1px]"
          style={{ backgroundColor: '#3B3121', color: '#F6F1E7' }}
        >
          Spróbuj ponownie
        </button>
      </div>
    )
  }
}
