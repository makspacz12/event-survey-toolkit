import { Component, type ReactNode } from 'react'

/**
 * SIATKA BEZPIECZEŃSTWA POD ANKIETĄ
 * ==================================
 * Ankieta doładowuje się z sieci dopiero po kliknięciu „Start”. Jeśli w tej
 * jednej sekundzie zabraknie zasięgu (opactwo, 300 osób na jednym nadajniku),
 * import się nie udaje i React wygasza CAŁE drzewo — uczestnik dostaje białą
 * stronę bez słowa wyjaśnienia i bez sposobu, żeby spróbować ponownie.
 *
 * Ten komponent zamienia białą stronę na czytelny komunikat z przyciskiem.
 * Odpowiedzi są bezpieczne niezależnie od wszystkiego: siedzą w pamięci
 * telefonu i wracają po ponownym otwarciu strony.
 *
 * Musi to być klasa — React nie ma odpowiednika `componentDidCatch`
 * w komponentach funkcyjnych.
 */
export class GranicaBledu extends Component<
  { children: ReactNode },
  { blad: Error | null }
> {
  state: { blad: Error | null } = { blad: null }

  static getDerivedStateFromError(blad: Error) {
    return { blad }
  }

  componentDidCatch(blad: Error) {
    // Widoczne w konsoli, gdyby ktoś diagnozował zgłoszenie uczestnika.
    console.error('[ankieta] awaria ekranu:', blad)
  }

  render() {
    if (!this.state.blad) return this.props.children

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
