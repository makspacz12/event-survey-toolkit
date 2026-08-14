import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import ankietaJson from '@/data/ankieta.json'
import type { Ankieta, Sekcja, Warunek, Wartosc } from '@/data/typy'
import {
  pustyStan,
  wczytajStan,
  wyczyscStan,
  zapiszStan,
  type StanAnkiety,
} from '@/lib/storage'
import { PytanieRenderer } from '@/components/survey/AnswerWidgets'
import { PodsumowanieOdpowiedzi } from '@/components/survey/PodsumowanieOdpowiedzi'
import { INTRO, SectionNav } from '@/components/survey/SectionNav'
import { IkonaCheck, IkonaPlus } from '@/components/ui/icons'
import {
  ileWKolejce,
  oproznijKolejke,
  wyslijOdpowiedzi,
  wysylkaSkonfigurowana,
  type StatusWysylki,
} from '@/lib/wyslij'
import { cn } from '@/lib/utils'

const ANKIETA = ankietaJson as Ankieta

/**
 * PRZEPŁYW ANKIETY — jasny motyw „papieru" + złoto (patrz DESIGN.md).
 * Kroki: intro („Chcesz się przedstawić?") → widoczne sekcje → podziękowanie.
 *
 * NAWIGACJA: listwa sekcji pod paskiem postępu — klik przeskakuje do dowolnej
 * sekcji (można POMIJAĆ). Pytania wymagane sprawdzane dopiero przy „Zakończ";
 * wtedy wracamy do pierwszej sekcji z brakiem.
 *
 * Pasek akcji jest PRZYKLEJONY DO DOŁU — kciuk zawsze go dosięga, nie trzeba
 * scrollować na koniec długiej sekcji.
 *
 * Cache: każda zmiana natychmiast do localStorage (razem z bieżącą sekcją).
 */

/** Fizyka sprężyny — jedna dla całej aplikacji (DESIGN.md §6). */
const SPRING = { type: 'spring' as const, stiffness: 120, damping: 20 }

/** Sprawdza warunek `pokaz_jesli` — wspólny dla sekcji i pojedynczych pytań. */
function spelniony(
  w: Warunek | undefined,
  odpowiedzi: Record<string, Wartosc>,
): boolean {
  if (!w) return true
  const wartosc = odpowiedzi[w.pytanie]
  if (w.rowne != null) return wartosc === w.rowne
  if (w.zawiera != null)
    return Array.isArray(wartosc) && wartosc.includes(w.zawiera)
  if (w.rozne_od != null) {
    // „Inna niż X” wymaga, żeby odpowiedź w ogóle padła. Inaczej pytanie
    // zależne migałoby przed udzieleniem odpowiedzi nadrzędnej.
    if (wartosc == null || wartosc === '') return false
    return wartosc !== w.rozne_od
  }
  return true
}

/** Czy sekcja jest widoczna przy obecnych odpowiedziach? */
function widoczna(sekcja: Sekcja, odpowiedzi: Record<string, Wartosc>): boolean {
  return spelniony(sekcja.pokaz_jesli, odpowiedzi)
}

type Krok = { rodzaj: 'intro' } | { rodzaj: 'sekcja'; index: number } | { rodzaj: 'koniec' }

/** Zwijane pole opcjonalnego komentarza pod pytaniem. */
function CommentField({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(value !== '')
  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 font-spacemono text-[11px] tracking-[0.06em] text-[#9C8345] transition-colors hover:text-[#9C7A2C]"
      >
        <IkonaPlus className="h-3.5 w-3.5" />
        Dodaj komentarz (opcjonalnie)
      </button>
    )
  return (
    <motion.textarea
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
      autoFocus={value === ''}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={2}
      placeholder="Twój komentarz…"
      className="mt-3 w-full resize-none rounded-md border border-dashed border-[#3B3121]/25 bg-[#FDFBF7] p-3 text-[14px] leading-relaxed text-ink placeholder:text-[#A99A78] focus:border-[#C9A14A] focus:outline-none focus:ring-2 focus:ring-[#C9A14A]/15"
    />
  )
}

export default function SurveyFlow() {
  // Stan wczytany z cache — użytkownik wraca tam, gdzie skończył
  // (łącznie z sekcją, na której był przed odświeżeniem strony).
  const [stan, setStan] = useState<StanAnkiety>(() => wczytajStan())
  const [krok, setKrok] = useState<Krok>(() => {
    const s = wczytajStan()
    if (!s.intro.przedstawienie) return { rodzaj: 'intro' }
    return { rodzaj: 'sekcja', index: s.biezacaSekcja }
  })
  const [blad, setBlad] = useState<string | null>(null)
  // Czy na ekranie końcowym rozwinięto pole „chcę się przedstawić".
  const [podpisOtwarty, setPodpisOtwarty] = useState(false)
  const [status, setStatus] = useState<StatusWysylki>(
    wysylkaSkonfigurowana ? 'gotowe' : 'brak-konfiguracji',
  )

  // Zaległe wysyłki (np. wypełnione bez zasięgu) ponawiamy przy starcie
  // aplikacji i gdy przeglądarka zgłosi powrót połączenia.
  useEffect(() => {
    if (!wysylkaSkonfigurowana) return
    const sprobuj = () => {
      if (ileWKolejce() > 0) void oproznijKolejke()
    }
    sprobuj()
    window.addEventListener('online', sprobuj)
    return () => window.removeEventListener('online', sprobuj)
  }, [])
  // Błąd „przenoszony" przy skoku do innej sekcji (patrz zakoncz()).
  const pendingBladRef = useRef<string | null>(null)
  // Pytanie, do którego trzeba przewinąć po zmianie sekcji.
  const pendingPrzewinRef = useRef<string | null>(null)
  // Pytanie z brakującą odpowiedzią — jego karta dostaje wyróżnienie.
  const [brakujacePytanie, setBrakujacePytanie] = useState<string | null>(null)

  /**
   * Przewija do karty pytania i zostawia ją w widocznej części ekranu.
   * `block: 'center'` daje margines na przyklejony nagłówek i stopkę.
   */
  const przewinDoPytania = (id: string) => {
    window.requestAnimationFrame(() => {
      document
        .getElementById(`pytanie-${id}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }

  /**
   * Zapis stanu do pamięci przeglądarki, ale NIE przy każdym naciśnięciu
   * klawisza. `localStorage.setItem` jest synchroniczny: przy pisaniu w polu
   * tekstowym każdy znak uruchamiał serializację całego stanu i blokował
   * wątek, przez co pisanie się zacinało. Odkładamy zapis o 400 ms od
   * ostatniej zmiany, a przy zamykaniu strony dopisujemy natychmiast.
   */
  const stanRef = useRef(stan)
  stanRef.current = stan

  useEffect(() => {
    const id = window.setTimeout(() => zapiszStan(stan), 400)
    return () => window.clearTimeout(id)
  }, [stan])

  useEffect(() => {
    const zapiszTeraz = () => zapiszStan(stanRef.current)
    // `pagehide` łapie też zamknięcie karty na iOS, gdzie `beforeunload`
    // bywa pomijany.
    window.addEventListener('pagehide', zapiszTeraz)
    document.addEventListener('visibilitychange', zapiszTeraz)
    return () => {
      zapiszTeraz()
      window.removeEventListener('pagehide', zapiszTeraz)
      document.removeEventListener('visibilitychange', zapiszTeraz)
    }
  }, [])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
    setBlad(pendingBladRef.current)
    pendingBladRef.current = null
    // Po skoku do sekcji z brakiem przewijamy do samego pytania.
    if (pendingPrzewinRef.current) {
      przewinDoPytania(pendingPrzewinRef.current)
      pendingPrzewinRef.current = null
    }
  }, [krok])

  const sekcje = useMemo(
    () => ANKIETA.sekcje.filter((s) => widoczna(s, stan.odpowiedzi)),
    [stan.odpowiedzi],
  )

  // Aktualna lista sekcji dostępna w nasłuchu historii, który jest rejestrowany
  // raz i nie widziałby świeżej wartości przez domknięcie.
  const sekcjeRef = useRef(sekcje)
  sekcjeRef.current = sekcje

  // Gdy zmiana odpowiedzi filtrujących SKRÓCI listę sekcji, a byliśmy na
  // sekcji spoza nowego zakresu — cofnij na ostatnią.
  useEffect(() => {
    if (
      krok.rodzaj === 'sekcja' &&
      sekcje.length > 0 &&
      krok.index >= sekcje.length
    ) {
      setKrok({ rodzaj: 'sekcja', index: sekcje.length - 1 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sekcje.length])

  const ustawOdpowiedz = (id: string, w: Wartosc) => {
    setStan((s) => ({ ...s, odpowiedzi: { ...s.odpowiedzi, [id]: w } }))
    // Wyróżnienie i komunikat znikają, gdy człowiek zrobi to, o co prosimy.
    if (brakujacePytanie === id) {
      setBrakujacePytanie(null)
      setBlad(null)
    }
  }

  const sekcjaRozpoczeta = (sekcja: Sekcja) =>
    sekcja.pytania.some((p) => {
      const w = stan.odpowiedzi[p.id]
      return w != null && w !== '' && (!Array.isArray(w) || w.length > 0)
    })

  const brakujace = (sekcja: Sekcja) =>
    sekcja.pytania.filter((p) => {
      if (!p.wymagane) return false
      // Pytanie ukryte warunkiem nie może blokować zakończenia ankiety.
      if (!spelniony(p.pokaz_jesli, stan.odpowiedzi)) return false
      const w = stan.odpowiedzi[p.id]
      return w == null || w === '' || (Array.isArray(w) && w.length === 0)
    })

  /**
   * NAWIGACJA A PRZYCISK „WSTECZ" W TELEFONIE
   * =========================================
   * Bez tego cofnięcie gestem albo przyciskiem systemowym wyrzucało z całej
   * ankiety, bo wszystkie sekcje dzieliły jeden adres. Każde przejście
   * dokłada teraz wpis do historii przeglądarki, więc „wstecz" cofa o jedną
   * sekcję, dokładnie tak, jak człowiek się spodziewa.
   *
   * `zHistorii` blokuje dopisywanie nowego wpisu, gdy zmiana kroku sama
   * pochodzi z cofnięcia — inaczej powstałaby pętla.
   */
  const zHistorii = useRef(false)

  const idzDo = (index: number) => {
    setKrok({ rodzaj: 'sekcja', index })
    setStan((s) => ({ ...s, biezacaSekcja: index }))
    if (!zHistorii.current) {
      window.history.pushState(
        { ankieta: index },
        '',
        `#/ankieta/${index + 1}`,
      )
    }
  }

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const stanHistorii = e.state as {
        ankieta?: number
        koniec?: boolean
      } | null
      zHistorii.current = true
      if (stanHistorii?.koniec) {
        // Powrót „do przodu” na ekran z podziękowaniem.
        setKrok({ rodzaj: 'koniec' })
      } else if (stanHistorii && typeof stanHistorii.ankieta === 'number') {
        // Indeks z historii może wskazywać sekcję, której już nie ma: ktoś
        // wszedł głęboko, wrócił do „Obecności", odznaczył dzień i lista się
        // skurczyła. Bez przycięcia render trafiałby w `undefined` i pokazał
        // pusty ekran w środku ankiety.
        const bezpieczny = Math.min(
          stanHistorii.ankieta,
          Math.max(sekcjeRef.current.length - 1, 0),
        )
        setKrok({ rodzaj: 'sekcja', index: bezpieczny })
        setStan((s) => ({ ...s, biezacaSekcja: bezpieczny }))
      } else {
        // Wpis bez naszego stanu = wejście na ankietę, czyli ekran startowy.
        setKrok({ rodzaj: 'intro' })
      }
      // Odblokowujemy dopiero po zastosowaniu zmiany.
      window.setTimeout(() => {
        zHistorii.current = false
      }, 0)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const dalej = () => {
    if (krok.rodzaj !== 'sekcja') return
    if (krok.index + 1 < sekcje.length) idzDo(krok.index + 1)
    else zakoncz()
  }

  /**
   * Zakończenie: sprawdź wymagane WE WSZYSTKICH widocznych sekcjach.
   *
   * Samo pokazanie komunikatu nie wystarcza: przy długiej sekcji ląduje on
   * poza ekranem, bo przycisk „Zakończ” siedzi w przyklejonej stopce, a treść
   * jest przewinięta wyżej. Człowiek klika i widzi, że nic się nie dzieje.
   * Dlatego dodatkowo przewijamy do brakującego pytania i podświetlamy jego
   * kartę.
   */
  const zakoncz = () => {
    for (let i = 0; i < sekcje.length; i++) {
      const brak = brakujace(sekcje[i])
      if (brak.length > 0) {
        const komunikat = `Uzupełnij jeszcze: „${brak[0].tresc}”`
        setBrakujacePytanie(brak[0].id)
        if (krok.rodzaj === 'sekcja' && krok.index === i) {
          setBlad(komunikat)
          przewinDoPytania(brak[0].id)
        } else {
          pendingBladRef.current = komunikat
          pendingPrzewinRef.current = brak[0].id
          idzDo(i)
        }
        return
      }
    }
    setBrakujacePytanie(null)
    setStan((s) => ({ ...s, ukonczona: true }))
    setKrok({ rodzaj: 'koniec' })
    // Ekran końcowy też dostaje własny wpis w historii. Bez tego dzielił go
    // z ostatnią sekcją, więc cofnięcie z „Dziękujemy” przeskakiwało o jedną
    // sekcję za daleko — zamiast do podsumowania, w środek ankiety.
    if (!zHistorii.current) {
      window.history.pushState({ koniec: true }, '', '#/ankieta/koniec')
    }
    void wyslij()
  }

  /** Wysyłka do arkusza. Nieudana próba trafia do kolejki i jest ponawiana. */
  const wyslij = async (stanDoWyslania: StanAnkiety = stanRef.current) => {
    if (!wysylkaSkonfigurowana) return
    setStatus('wysylanie')
    const ok = await wyslijOdpowiedzi(stanDoWyslania)
    setStatus(ok ? 'wyslano' : 'blad')
  }

  /**
   * DOSYŁKA Z EKRANU KOŃCOWEGO.
   *
   * Na ekranie końcowym można jeszcze dopisać komentarz i podpisać się
   * imieniem. Pierwsza wysyłka poszła wcześniej, więc bez tego te pola
   * zostawałyby wyłącznie w pamięci telefonu i nigdy nie trafiły do
   * organizatora — mimo że aplikacja je zbiera i wysyła w ładunku.
   *
   * Wysyłamy ponownie 2 s po ostatniej zmianie. Skrypt po stronie Google
   * rozpoznaje powtórkę po identyfikatorze sesji i oznacza poprzedni wiersz
   * jako nieaktualny, więc w arkuszu zostaje najnowsza, pełna wersja.
   */
  const dopisek = stan.odpowiedzi['koniec-dopisek']
  const podpis = stan.intro.imieNazwisko
  const pierwszaDosylka = useRef(true)

  useEffect(() => {
    if (krok.rodzaj !== 'koniec' || !wysylkaSkonfigurowana) return
    // Pomijamy przebieg tuż po zakończeniu — tamtą wysyłkę zrobił `zakoncz()`.
    if (pierwszaDosylka.current) {
      pierwszaDosylka.current = false
      return
    }
    const id = window.setTimeout(() => void wyslij(stanRef.current), 2000)
    return () => window.clearTimeout(id)
  }, [dopisek, podpis, krok.rodzaj])

  /**
   * Przycisk „Wstecz" ZDEJMUJE wpis z historii, zamiast dokładać nowy.
   * Wcześniej wołał `idzDo()`, które robi `pushState` — po kilku przejściach
   * tam i z powrotem historia puchła, a systemowe cofnięcie przenosiło
   * uczestnika do przodu, bo taki wpis był najnowszy.
   */
  const wstecz = () => {
    if (krok.rodzaj !== 'sekcja') return
    window.history.back()
  }

  // Do testów: `resetAnkiety()` w konsoli przeglądarki czyści stan i wraca na
  // początek. Uczestnik nie ma takiego przycisku — po wysłaniu odpowiedzi
  // przypadkowe wyczyszczenie byłoby dla niego stratą, nie udogodnieniem.
  useEffect(() => {
    ;(window as Window & { resetAnkiety?: () => void }).resetAnkiety = () => {
      wyczyscStan()
      setStan(pustyStan)
      setPodpisOtwarty(false)
      setKrok({ rodzaj: 'intro' })
    }
  }, [])

  const postep =
    krok.rodzaj === 'sekcja'
      ? (krok.index + 1) / (sekcje.length + 1)
      : krok.rodzaj === 'koniec'
        ? 1
        : 0

  const introGotowe =
    stan.intro.przedstawienie === 'anonimowo' ||
    (stan.intro.przedstawienie === 'imie' &&
      stan.intro.imieNazwisko.trim() !== '')

  return (
    <div className="relative flex min-h-[100dvh] w-full flex-col bg-gradient-to-b from-paper to-parchment text-ink">
      {/* ===================== NAGŁÓWEK (sticky) ===================== */}
      <header className="sticky top-0 z-30 border-b border-[#3B3121]/10 bg-paper/92 backdrop-blur-sm">
        <div className="mx-auto max-w-[26rem] px-5 pb-2.5 pt-[max(0.85rem,env(safe-area-inset-top))]">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-dmserif text-[16px] leading-none text-[#9C7A2C]">
              Masterclass Leadership
            </span>
            {krok.rodzaj !== 'sekcja' && (
              <span className="shrink-0 font-spacemono text-[10px] uppercase tracking-[0.18em] text-[#9C8345]">
                {krok.rodzaj === 'koniec' ? 'koniec' : 'start'}
              </span>
            )}
          </div>

          {/* Pasek segmentów zastąpił kafelki. Pierwszy segment to ekran
              „Przedstawienie", więc można tam wrócić w każdej chwili. */}
          {krok.rodzaj !== 'koniec' ? (
            <SectionNav
              sekcje={sekcje}
              aktywna={krok.rodzaj === 'intro' ? INTRO : krok.index}
              rozpoczeta={sekcjaRozpoczeta}
              introWypelnione={introGotowe}
              onWybierz={(i) =>
                i === INTRO ? setKrok({ rodzaj: 'intro' }) : idzDo(i)
              }
            />
          ) : (
            <div className="mt-3 h-[2px] w-full overflow-hidden rounded-full bg-[#3B3121]/10">
              <motion.div
                className="h-full rounded-full bg-[#C9A14A]"
                initial={false}
                animate={{ width: `${Math.max(postep * 100, 2)}%` }}
                transition={SPRING}
              />
            </div>
          )}
        </div>
      </header>

      {/* ===================== TREŚĆ ===================== */}
      <div className="flex-1">
        <AnimatePresence mode="wait">
          {/* ------------------------------- KROK: INTRO --- */}
          {krok.rodzaj === 'intro' && (
            <motion.section
              key="intro"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={SPRING}
              className="mx-auto flex min-h-[calc(100dvh-9rem)] max-w-[26rem] flex-col justify-center px-6 py-10"
            >
              <span className="font-spacemono text-[10px] uppercase tracking-[0.24em] text-[#9C8345]">
                Zanim zaczniemy
              </span>
              <h2 className="mt-2.5 font-dmserif text-[34px] leading-[1.08] text-[#3B3121]">
                Chcesz się przedstawić?
              </h2>
              <p className="mt-3 max-w-[24rem] text-[14.5px] leading-relaxed text-[#6B5D42]">
                To Twój wybór. Ankietę możesz wypełnić także w pełni anonimowo,
                a odpowiedzi i tak analizujemy zbiorczo.
              </p>

              <div className="mt-7 grid gap-2.5">
                {(
                  [
                    { klucz: 'imie', tytul: 'Przedstawię się', opis: 'podasz imię i nazwisko' },
                    { klucz: 'anonimowo', tytul: 'Wypełniam anonimowo', opis: 'bez żadnych danych o Tobie' },
                  ] as const
                ).map((opcja) => {
                  const aktywna = stan.intro.przedstawienie === opcja.klucz
                  return (
                    <button
                      key={opcja.klucz}
                      type="button"
                      onClick={() =>
                        setStan((s) => ({
                          ...s,
                          intro:
                            opcja.klucz === 'anonimowo'
                              ? { przedstawienie: 'anonimowo', imieNazwisko: '' }
                              : { ...s.intro, przedstawienie: 'imie' },
                        }))
                      }
                      className={cn(
                        'flex min-h-[44px] items-center justify-between gap-3 rounded-md border px-4 py-3.5 text-left transition-all duration-200',
                        aktywna
                          ? 'border-[#C9A14A] bg-[#C9A14A] text-white shadow-[0_6px_18px_-10px_rgba(201,161,74,0.7)]'
                          : 'border-[#3B3121]/15 bg-white text-[#4A3E29] hover:border-[#C9A14A]/50',
                      )}
                    >
                      <span>
                        <span className="block font-dmserif text-[19px] leading-tight">
                          {opcja.tytul}
                        </span>
                        <span
                          className={cn(
                            'mt-0.5 block text-[12px] leading-snug',
                            aktywna ? 'text-white/70' : 'text-[#8A7A55]',
                          )}
                        >
                          {opcja.opis}
                        </span>
                      </span>
                      {aktywna && <IkonaCheck className="h-4 w-4 shrink-0" />}
                    </button>
                  )
                })}

                {stan.intro.przedstawienie === 'imie' && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={SPRING}
                    className="rounded-md border border-[#3B3121]/12 bg-white/70 p-4"
                  >
                    <label
                      htmlFor="imie-nazwisko"
                      className="mb-2 block font-spacemono text-[10px] uppercase tracking-[0.2em] text-[#9C8345]"
                    >
                      Imię i nazwisko
                    </label>
                    <input
                      id="imie-nazwisko"
                      type="text"
                      autoFocus
                      autoComplete="name"
                      value={stan.intro.imieNazwisko}
                      onChange={(e) =>
                        setStan((s) => ({
                          ...s,
                          intro: { ...s.intro, imieNazwisko: e.target.value },
                        }))
                      }
                      placeholder="np. Anna Kowalska"
                      className="min-h-[44px] w-full rounded-md border border-[#3B3121]/20 bg-white p-3.5 text-[16px] text-ink placeholder:text-[#A99A78] focus:border-[#C9A14A] focus:outline-none focus:ring-2 focus:ring-[#C9A14A]/15"
                    />
                  </motion.div>
                )}
              </div>
            </motion.section>
          )}

          {/* ------------------------------ KROK: SEKCJA --- */}
          {krok.rodzaj === 'sekcja' && sekcje[krok.index] && (
            <motion.section
              key={sekcje[krok.index].id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={SPRING}
              className="mx-auto max-w-[26rem] px-5 pb-36 pt-7"
            >
              <span className="font-spacemono text-[10px] uppercase tracking-[0.24em] text-[#9C8345]">
                {sekcje[krok.index].kiedy ?? `Sekcja ${krok.index + 1}`}
              </span>
              <h2 className="mt-1.5 font-dmserif text-[30px] leading-[1.1] text-[#3B3121]">
                {sekcje[krok.index].tytul}
              </h2>
              {sekcje[krok.index].opis && (
                <p className="mt-2.5 text-[13.5px] leading-relaxed text-[#6B5D42]">
                  {sekcje[krok.index].opis}
                </p>
              )}

              {/* pytania — kaskada 60 ms na pozycję. Pytania z własnym
                  warunkiem znikają, gdy przestaje być spełniony (np. o ocenę
                  jury nie pytamy kogoś, kogo nie było na finale). */}
              <div className="mt-6 flex flex-col gap-3.5">
                {sekcje[krok.index].pytania
                  .filter((p) => spelniony(p.pokaz_jesli, stan.odpowiedzi))
                  .map((p, i) => (
                  <motion.div
                    key={p.id}
                    id={`pytanie-${p.id}`}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...SPRING, delay: i * 0.06 }}
                    className={cn(
                      'rounded-md border bg-white p-4 transition-shadow',
                      brakujacePytanie === p.id
                        ? 'border-[#C9A14A] shadow-[0_0_0_3px_rgba(201,161,74,0.18)]'
                        : 'border-[#3B3121]/10 shadow-[0_3px_16px_-10px_rgba(59,49,33,0.35)]',
                    )}
                  >
                    <div className="mb-4 flex items-start gap-3">
                      {p.zdjecie && (
                        <img
                          src={p.zdjecie}
                          alt=""
                          loading="lazy"
                          className="h-12 w-12 shrink-0 rounded-full border border-[#C9A14A]/40 object-cover object-top"
                        />
                      )}
                      {/* Oznaczenie „wymagane" jako mikroetykieta NAD treścią —
                          gwiazdka doklejana do tekstu spadała do osobnej linii
                          i wyglądała jak zgubiony znak. */}
                      <div>
                        {p.wymagane && (
                          <span className="mb-1.5 block font-spacemono text-[9px] uppercase tracking-[0.2em] text-[#C9A14A]">
                            wymagane
                          </span>
                        )}
                        <p className="text-[15px] font-medium leading-snug text-[#3B3121]">
                          {p.tresc}
                        </p>
                      </div>
                    </div>
                    <PytanieRenderer
                      pytanie={p}
                      wartosc={stan.odpowiedzi[p.id] ?? null}
                      onChange={(w) => ustawOdpowiedz(p.id, w)}
                    />
                    {p.komentarz && (
                      <CommentField
                        value={
                          typeof stan.odpowiedzi[`${p.id}::komentarz`] === 'string'
                            ? (stan.odpowiedzi[`${p.id}::komentarz`] as string)
                            : ''
                        }
                        onChange={(v) => ustawOdpowiedz(`${p.id}::komentarz`, v)}
                      />
                    )}
                  </motion.div>
                ))}
              </div>

              {blad && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 rounded-md border border-[#C9A14A]/40 bg-[#FBF3DF] px-3.5 py-2.5 text-[13px] leading-snug text-[#8A6A1E]"
                >
                  {blad}
                </motion.p>
              )}
            </motion.section>
          )}

          {/* ------------------------------ KROK: KONIEC --- */}
          {krok.rodzaj === 'koniec' && (
            <motion.section
              key="koniec"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={SPRING}
              className="mx-auto flex min-h-[calc(100dvh-6rem)] max-w-[26rem] flex-col justify-center px-6 py-10"
            >
              <div className="flex flex-col items-center text-center">
                <motion.span
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ ...SPRING, delay: 0.1 }}
                  className="flex h-16 w-16 items-center justify-center rounded-full border border-[#C9A14A]/45 bg-white text-[#C9A14A]"
                >
                  <IkonaCheck className="h-7 w-7" />
                </motion.span>
                <h2 className="mt-6 font-dmserif text-[32px] leading-[1.1] text-[#3B3121]">
                  Dziękujemy
                  {stan.intro.imieNazwisko
                    ? `, ${stan.intro.imieNazwisko.trim().split(' ')[0]}`
                    : ''}
                </h2>
                {/* Bez skonfigurowanej wysyłki odpowiedzi zostają wyłącznie na
                    telefonie uczestnika. Nie wolno wtedy twierdzić, że zostały
                    zapisane — to samo zdanie zobaczyłoby 300 osób, gdyby ktoś
                    kiedyś przegapił ponowne zbudowanie aplikacji po zmianie
                    konfiguracji. */}
                <p className="mt-3 max-w-[20rem] text-[14.5px] leading-relaxed text-[#6B5D42]">
                  {wysylkaSkonfigurowana
                    ? 'Twoje odpowiedzi zostały zapisane. Pomogą nam zbudować jeszcze lepszą edycję Masterclass Leadership.'
                    : 'Dziękujemy za wypełnienie ankiety. Twoje odpowiedzi pomogą nam zbudować jeszcze lepszą edycję Masterclass Leadership.'}
                </p>

                {/* Stan wysyłki. Pokazujemy tylko wtedy, gdy jest co pokazać:
                    w wersji bez podłączonego arkusza ekran zostaje bez zmian. */}
                {wysylkaSkonfigurowana && (
                  <div className="mt-4 min-h-[24px]">
                    {status === 'wysylanie' && (
                      <span className="font-spacemono text-[11px] uppercase tracking-[0.16em] text-[#9C8345]">
                        Wysyłanie…
                      </span>
                    )}
                    {status === 'wyslano' && (
                      <span className="inline-flex items-center gap-1.5 font-spacemono text-[11px] uppercase tracking-[0.16em] text-[#7A8C5A]">
                        <IkonaCheck className="h-3.5 w-3.5" />
                        Wysłano do organizatora
                      </span>
                    )}
                    {status === 'blad' && (
                      <div className="rounded-md border border-[#C9A14A]/40 bg-[#FBF3DF] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-[#8A6A1E]">
                        Nie udało się teraz wysłać. Odpowiedzi są bezpieczne na
                        tym urządzeniu i wyślemy je automatycznie, gdy tylko się
                        uda. Możesz spokojnie zamknąć stronę.
                        <button
                          type="button"
                          onClick={() => void wyslij()}
                          className="mt-2 block font-spacemono text-[11px] uppercase tracking-[0.14em] underline underline-offset-4"
                        >
                          Spróbuj teraz
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Wszystko poniżej jest OPCJONALNE — ankieta jest już skończona. */}
              <div className="mt-9 flex flex-col gap-3">
                {/* Zmiana zdania co do anonimowości: ktoś wypełnił anonimowo,
                    ale po namyśle chce się podpisać (np. liczy na kontakt). */}
                {stan.intro.przedstawienie !== 'imie' && (
                  <div className="rounded-md border border-dashed border-[#3B3121]/22 bg-white/60 p-4">
                    {!podpisOtwarty ? (
                      <>
                        <p className="text-[13.5px] leading-relaxed text-[#6B5D42]">
                          Wypełniłeś(-aś) anonimowo. Jeśli chcesz, możesz się
                          jeszcze podpisać. To nadal w pełni dobrowolne.
                        </p>
                        <button
                          type="button"
                          onClick={() => setPodpisOtwarty(true)}
                          className="mt-2.5 inline-flex min-h-[44px] items-center gap-1.5 font-spacemono text-[11px] uppercase tracking-[0.14em] text-[#9C8345] transition-colors hover:text-[#9C7A2C]"
                        >
                          <IkonaPlus className="h-3.5 w-3.5" />
                          Chcę się przedstawić
                        </button>
                      </>
                    ) : (
                      <>
                        <label className="mb-2 block font-spacemono text-[10px] uppercase tracking-[0.2em] text-[#9C8345]">
                          Imię i nazwisko (opcjonalnie)
                        </label>
                        <input
                          type="text"
                          autoFocus
                          value={stan.intro.imieNazwisko}
                          onChange={(e) =>
                            setStan((s) => ({
                              ...s,
                              intro: {
                                przedstawienie: 'imie',
                                imieNazwisko: e.target.value,
                              },
                            }))
                          }
                          placeholder="np. Anna Kowalska"
                          className="min-h-[44px] w-full rounded-md border border-[#3B3121]/20 bg-white p-3 text-[16px] text-ink placeholder:text-[#A99A78] focus:border-[#C9A14A] focus:outline-none focus:ring-2 focus:ring-[#C9A14A]/15"
                        />
                      </>
                    )}
                  </div>
                )}

                {/* Miejsce na cokolwiek, czego nie objęły pytania. */}
                <div className="rounded-md border border-dashed border-[#3B3121]/22 bg-white/60 p-4">
                  <label className="mb-2 block font-spacemono text-[10px] uppercase tracking-[0.2em] text-[#9C8345]">
                    Chcesz dodać coś od siebie? (opcjonalnie)
                  </label>
                  <textarea
                    rows={3}
                    value={
                      typeof stan.odpowiedzi['koniec-dopisek'] === 'string'
                        ? (stan.odpowiedzi['koniec-dopisek'] as string)
                        : ''
                    }
                    onChange={(e) =>
                      ustawOdpowiedz('koniec-dopisek', e.target.value)
                    }
                    placeholder="Cokolwiek, o co nie zapytaliśmy…"
                    className="w-full resize-none rounded-md border border-[#3B3121]/20 bg-white p-3 text-[15px] leading-relaxed text-ink placeholder:text-[#A99A78] focus:border-[#C9A14A] focus:outline-none focus:ring-2 focus:ring-[#C9A14A]/15"
                  />
                </div>

              </div>

              {/* Przegląd tego, co uczestnik wysłał. Zastąpił przyciski
                  pobierania pliku i wypełniania od nowa — po zakończeniu
                  ankiety człowiek chce zobaczyć swoje odpowiedzi, a nie
                  zarządzać plikami. */}
              <PodsumowanieOdpowiedzi odpowiedzi={stan.odpowiedzi} />
            </motion.section>
          )}
        </AnimatePresence>
      </div>

      {/* ============ PASEK AKCJI (przyklejony do dołu) ============ */}
      {krok.rodzaj !== 'koniec' && (
        <div className="sticky bottom-0 z-30 border-t border-[#3B3121]/10 bg-gradient-to-t from-parchment via-parchment/95 to-parchment/80 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3.5 backdrop-blur-sm">
          <div className="mx-auto max-w-[26rem]">
            {krok.rodzaj === 'intro' ? (
              <button
                type="button"
                disabled={!introGotowe}
                // Wracamy do sekcji, na której użytkownik był, zanim tu wszedł
                // (przy pierwszym przejściu jest to po prostu sekcja 1).
                onClick={() => idzDo(stan.biezacaSekcja)}
                // UWAGA: `disabled:bg-[#XXXXXX]/12` (arbitralny hex + alpha)
                // nie generuje się w Tailwind 3 — stan nieaktywny musi mieć
                // pełny, konkretny kolor.
                className="min-h-[52px] w-full rounded-md bg-[#C9A14A] font-display text-[13px] font-semibold uppercase tracking-[0.14em] text-white transition-all duration-200 hover:bg-[#B58E3E] active:translate-y-px disabled:cursor-not-allowed disabled:bg-[#E4DACA] disabled:text-[#9A8B6D]"
              >
                Kontynuuj
              </button>
            ) : (
              <div className="grid grid-cols-[auto_1fr] gap-2.5">
                <button
                  type="button"
                  onClick={wstecz}
                  className="min-h-[52px] rounded-md border border-[#3B3121]/20 bg-white px-5 font-display text-[13px] font-semibold uppercase tracking-[0.1em] text-[#6B5D42] transition-all hover:border-[#3B3121]/40 active:translate-y-px"
                >
                  Wstecz
                </button>
                <button
                  type="button"
                  onClick={dalej}
                  className="min-h-[52px] rounded-md bg-[#C9A14A] font-display text-[13px] font-semibold uppercase tracking-[0.14em] text-white transition-all hover:bg-[#B58E3E] active:translate-y-px"
                >
                  {krok.rodzaj === 'sekcja' && krok.index + 1 < sekcje.length
                    ? 'Dalej'
                    : 'Zakończ ankietę'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
