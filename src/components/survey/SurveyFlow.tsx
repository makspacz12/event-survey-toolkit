import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import ankietaJson from '@/data/ankieta.json'
import type { Survey, Question, Section, Condition, Value } from '@/data/typy'
import {
  emptyState,
  loadState,
  clearState,
  saveState,
  type SurveyState,
} from '@/lib/storage'
import { NIEOBECNY, QuestionRenderer } from '@/components/survey/AnswerWidgets'
import { AnswerSummary } from '@/components/survey/AnswerSummary'
import { INTRO, SectionNav } from '@/components/survey/SectionNav'
import { IconCheck, IconPlus } from '@/components/ui/icons'
import {
  queueLength,
  drainQueue,
  submitAnswers,
  submitConfigured,
  forgetSession,
  type SubmitStatus,
} from '@/lib/submit'
import { cn } from '@/lib/utils'

const ANKIETA = ankietaJson as Survey

/**
 * SURVEY FLOW — light "paper" theme + gold (see DESIGN.md).
 * Steps: intro ("Want to introduce yourself?") -> visible sections -> thank you.
 *
 * NAVIGATION: the section strip under the progress bar — clicking jumps to any
 * section (sections CAN BE SKIPPED). Required questions are checked only when
 * hitting "Finish"; then we jump back to the first section with a gap.
 *
 * The action bar is STUCK TO THE BOTTOM — the thumb always reaches it, no need
 * to scroll to the end of a long section.
 *
 * Cache: every change goes to localStorage immediately (together with the
 * current section).
 */

/** Spring physics — one for the whole app (DESIGN.md §6). */
const SPRING = { type: 'spring' as const, stiffness: 120, damping: 20 }

/** Checks the `pokaz_jesli` condition — shared by sections and individual questions. */
function isSatisfied(
  w: Condition | undefined,
  odpowiedzi: Record<string, Value>,
): boolean {
  if (!w) return true
  const wartosc = odpowiedzi[w.pytanie]
  if (w.rowne != null) return wartosc === w.rowne
  if (w.zawiera != null)
    return Array.isArray(wartosc) && wartosc.includes(w.zawiera)
  if (w.rozne_od != null) {
    // "Other than X" requires that an answer was actually given. Otherwise the
    // dependent question would flicker before the parent answer is provided.
    if (wartosc == null || wartosc === '') return false
    return wartosc !== w.rozne_od
  }
  return true
}

/** Is the section visible given the current answers? */
function isVisible(sekcja: Section, odpowiedzi: Record<string, Value>): boolean {
  return isSatisfied(sekcja.pokaz_jesli, odpowiedzi)
}

type Step = { rodzaj: 'intro' } | { rodzaj: 'sekcja'; index: number } | { rodzaj: 'koniec' }

/**
 * A question together with a collapsible comment.
 *
 * The "Add comment" button doesn't sit under the control — it joins its
 * bottom row, on the right, opposite "Did not attend". So the
 * "expanded / collapsed" state has to live here, not in the text field itself.
 */
function AnswerField({
  pytanie,
  wartosc,
  onChange,
  komentarz,
  onKomentarz,
}: {
  pytanie: Question
  wartosc: Value
  onChange: (w: Value) => void
  komentarz: string
  onKomentarz: (v: string) => void
}) {
  const [otwarty, setOtwarty] = useState(komentarz !== '')

  // Whoever checked "Did not attend" has nothing to comment on — we hide both
  // the button and any previously entered text. Otherwise a comment about an
  // event someone didn't attend would end up in the spreadsheet.
  const nieobecny = wartosc === NIEOBECNY
  const chce = pytanie.komentarz === true && !nieobecny

  useEffect(() => {
    if (nieobecny && komentarz !== '') onKomentarz('')
    if (nieobecny && otwarty) setOtwarty(false)
  }, [nieobecny])

  const przycisk =
    chce && !otwarty ? (
      <button
        type="button"
        onClick={() => setOtwarty(true)}
        className="inline-flex min-h-[44px] items-center gap-1.5 font-spacemono text-[11px] tracking-[0.06em] text-[#9C8345] transition-colors hover:text-[#9C7A2C]"
      >
        <IconPlus className="h-3.5 w-3.5" />
        Dodaj komentarz
      </button>
    ) : null

  return (
    <>
      <QuestionRenderer
        pytanie={pytanie}
        wartosc={wartosc}
        onChange={onChange}
        akcja={przycisk}
      />
      {chce && otwarty && (
        <motion.textarea
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SPRING}
          autoFocus={komentarz === ''}
          value={komentarz}
          onChange={(e) => onKomentarz(e.target.value)}
          rows={2}
          placeholder="Twój komentarz…"
          className="mt-3 w-full resize-none rounded-md border border-dashed border-[#3B3121]/25 bg-[#FDFBF7] p-3 text-[14px] leading-relaxed text-ink placeholder:text-[#A99A78] focus:border-[#C9A14A] focus:outline-none focus:ring-2 focus:ring-[#C9A14A]/15"
        />
      )}
    </>
  )
}

export default function SurveyFlow() {
  // State loaded from cache — the user returns to where they left off
  // (including the section they were on before the page refreshed).
  const [stan, setStan] = useState<SurveyState>(() => loadState())
  const [krok, setKrok] = useState<Step>(() => {
    const s = loadState()
    if (!s.intro.przedstawienie) return { rodzaj: 'intro' }
    return { rodzaj: 'sekcja', index: s.biezacaSekcja }
  })
  const [blad, setBlad] = useState<string | null>(null)
  const [status, setStatus] = useState<SubmitStatus>(
    submitConfigured ? 'gotowe' : 'brak-konfiguracji',
  )

  // Pending sends (e.g. filled out with no signal) are retried on app start
  // and whenever the browser reports the connection is back.
  useEffect(() => {
    if (!submitConfigured) return
    const sprobuj = () => {
      if (queueLength() > 0) void drainQueue()
    }
    sprobuj()
    window.addEventListener('online', sprobuj)
    return () => window.removeEventListener('online', sprobuj)
  }, [])
  // Error "carried over" when jumping to another section (see finish()).
  const pendingBladRef = useRef<string | null>(null)
  // Question to scroll to after a section change.
  const pendingPrzewinRef = useRef<string | null>(null)
  // Question with a missing answer — its card gets highlighted.
  const [brakujacePytanie, setBrakujacePytanie] = useState<string | null>(null)

  /**
   * Scrolls to a question's card and leaves it in the visible part of the
   * screen. `block: 'center'` leaves margin for the sticky header and footer.
   */
  const scrollToQuestion = (id: string) => {
    window.requestAnimationFrame(() => {
      document
        .getElementById(`pytanie-${id}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }

  /**
   * Save state to browser storage, but NOT on every keystroke.
   * `localStorage.setItem` is synchronous: while typing in a text field, each
   * character would trigger serialization of the whole state and block the
   * thread, causing typing to stutter. We defer the save by 400ms from the
   * last change, and write immediately when the page is closing.
   */
  const stanRef = useRef(stan)
  stanRef.current = stan

  /**
   * After a confirmed send, we clear the answers from the phone's storage and
   * from that point on they must not be written back. Without this lock, a
   * save on page exit would immediately recreate the cleared data — verified,
   * that's exactly what happens.
   */
  const zapisZablokowany = useRef(false)

  useEffect(() => {
    if (zapisZablokowany.current) return
    const id = window.setTimeout(() => saveState(stan), 400)
    return () => window.clearTimeout(id)
  }, [stan])

  useEffect(() => {
    const zapiszTeraz = () => {
      if (zapisZablokowany.current) return
      saveState(stanRef.current)
    }
    // `pagehide` also catches tab close on iOS, where `beforeunload` is
    // sometimes skipped.
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
    // After jumping to a section with a gap, scroll to the actual question.
    if (pendingPrzewinRef.current) {
      scrollToQuestion(pendingPrzewinRef.current)
      pendingPrzewinRef.current = null
    }
  }, [krok])

  /**
   * THE STARTING SECTION IS PART OF THE WELCOME SCREEN
   * ===================================================
   * Note from the recording: "those first two pages, introduction and
   * attendance, I'd merge — it doesn't need to be that big." So the first
   * section from the questions file is shown TOGETHER with the "introduce
   * myself / anonymous" choice, on one "Before we start" screen.
   *
   * That's why it's excluded from the list of sections to click through —
   * otherwise the same questions would show up a second time as a separate tab.
   */
  const sekcjaStartowa = ANKIETA.sekcje[0]

  const sekcje = useMemo(
    () => ANKIETA.sekcje.slice(1).filter((s) => isVisible(s, stan.odpowiedzi)),
    [stan.odpowiedzi],
  )

  // Current section list available in the history listener, which is
  // registered once and wouldn't see a fresh value through the closure.
  const sekcjeRef = useRef(sekcje)
  sekcjeRef.current = sekcje

  // For the same reason, the history listener needs the current step.
  const krokRef = useRef(krok)
  krokRef.current = krok

  // When a filtering answer change SHORTENS the section list, and we were on
  // a section outside the new range — go back to the last one.
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

  const ustawOdpowiedz = (id: string, w: Value) => {
    setStan((s) => ({ ...s, odpowiedzi: { ...s.odpowiedzi, [id]: w } }))
    // The highlight and message disappear once the person does what we asked.
    if (brakujacePytanie === id) {
      setBrakujacePytanie(null)
      setBlad(null)
    }
  }

  const sekcjaRozpoczeta = (sekcja: Section) =>
    sekcja.pytania.some((p) => {
      const w = stan.odpowiedzi[p.id]
      return w != null && w !== '' && (!Array.isArray(w) || w.length > 0)
    })

  const missingAnswers = (sekcja: Section) =>
    sekcja.pytania.filter((p) => {
      if (!p.wymagane) return false
      // A question hidden by a condition must not block finishing the survey.
      if (!isSatisfied(p.pokaz_jesli, stan.odpowiedzi)) return false
      const w = stan.odpowiedzi[p.id]
      return w == null || w === '' || (Array.isArray(w) && w.length === 0)
    })

  /**
   * NAVIGATION VS. THE PHONE'S "BACK" BUTTON
   * =========================================
   * Without this, going back via gesture or the system button would throw you
   * out of the whole survey, because all sections shared one address. Every
   * transition now adds an entry to browser history, so "back" now goes back
   * one section, exactly as a person would expect.
   *
   * `zHistorii` blocks pushing a new entry when the step change itself comes
   * from going back — otherwise a loop would form.
   */
  const zHistorii = useRef(false)

  /** Currently exiting the survey to the start screen (see the listener below). */
  const wychodzimy = useRef(false)

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

  /**
   * GOING BACK MOVES ONE TAB BACK, NOT TO THE PREVIOUSLY VISITED ONE
   * ===================================================================
   * By default, the browser goes back to where the participant WAS. So if
   * they had jumped with the top bar from "Attendance" straight to
   * "Summary", going back would throw them right back to "Attendance" —
   * skipping five tabs. A person expects something else: to return to the
   * tab NEXT TO the current one, i.e. one step back in survey order.
   *
   * So we intercept the back navigation and decide ourselves where it leads.
   * After intercepting we push an entry back, so the next back-navigation
   * also lands with us instead of throwing the user off the page. History
   * depth doesn't change: going back removes one entry, we add one back.
   *
   * The exception is the introduction screen — going back from it leads to
   * the start screen, because that's actually where the survey ends.
   */
  useEffect(() => {
    const onPop = () => {
      const biezacy = krokRef.current
      const ostatniaSekcja = Math.max(sekcjeRef.current.length - 1, 0)

      let cel: Step | null = null
      if (biezacy.rodzaj === 'koniec') {
        cel = { rodzaj: 'sekcja', index: ostatniaSekcja }
      } else if (biezacy.rodzaj === 'sekcja') {
        // Clamp to range: the section list may have shrunk if someone went
        // back to "Attendance" and unchecked a day. Without this, the render
        // would hit `undefined` and show a blank screen mid-survey.
        const poprzednia = Math.min(biezacy.index, ostatniaSekcja) - 1
        cel = poprzednia >= 0 ? { rodzaj: 'sekcja', index: poprzednia } : { rodzaj: 'intro' }
      }

      // Going back from the introduction screen leads to the start screen —
      // that's where the survey actually begins. `replace` instead of a
      // regular exit, because older section entries sit underneath and the
      // participant would land mid-survey with an address that doesn't match
      // what they see.
      //
      // The `wychodzimy` guard is necessary: changing the address within the
      // same page can trigger this same listener again IMMEDIATELY. Without
      // it, an infinite loop would form and the browser would report a stack
      // overflow.
      if (!cel) {
        if (!wychodzimy.current) {
          wychodzimy.current = true
          window.location.replace('#/')
        }
        return
      }

      zHistorii.current = true
      if (cel.rodzaj === 'sekcja') {
        window.history.pushState(
          { ankieta: cel.index },
          '',
          `#/ankieta/${cel.index + 1}`,
        )
        setStan((s) => ({ ...s, biezacaSekcja: cel.index }))
      } else {
        window.history.pushState({ intro: true }, '', '#/ankieta')
      }
      setKrok(cel)

      // Unlock only after the change has been applied.
      window.setTimeout(() => {
        zHistorii.current = false
      }, 0)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  /**
   * "Next" guards the REQUIRED questions in the current section.
   *
   * This is mostly about the first question, about days of attendance: which
   * sections show up at all depends on it. Leaving it empty means a survey
   * missing half its questions, so it must not be skipped. Previously only the
   * "Finish survey" button checked this — i.e. at the very end, when the
   * participant's mind was already elsewhere.
   *
   * We don't disable the button itself. A greyed-out button explains nothing;
   * a person clicks and doesn't know why nothing happens. Instead we show a
   * message, highlight the question's card, and scroll to it — exactly as
   * when finishing the survey.
   *
   * Optional questions can be skipped. That was always the case and stays
   * that way.
   */
  const dalej = () => {
    if (krok.rodzaj !== 'sekcja') return

    const brak = missingAnswers(sekcje[krok.index])
    if (brak.length > 0) {
      setBlad(`Uzupełnij jeszcze: „${brak[0].tresc}”`)
      setBrakujacePytanie(brak[0].id)
      scrollToQuestion(brak[0].id)
      return
    }

    if (krok.index + 1 < sekcje.length) idzDo(krok.index + 1)
    else zakoncz()
  }

  /**
   * Finishing: check required questions in ALL visible sections.
   *
   * Just showing the message isn't enough: in a long section it ends up off
   * screen, because the "Finish" button sits in the sticky footer while the
   * content is scrolled up above it. The person clicks and sees nothing
   * happen. So we additionally scroll to the missing question and highlight
   * its card.
   */
  const zakoncz = () => {
    // The starting section lives on the welcome screen and isn't in `sekcje`,
    // so without this its required questions would never get checked.
    const brakNaStarcie = missingAnswers(sekcjaStartowa)
    if (brakNaStarcie.length > 0) {
      setBrakujacePytanie(brakNaStarcie[0].id)
      pendingBladRef.current = `Uzupełnij jeszcze: „${brakNaStarcie[0].tresc}”`
      pendingPrzewinRef.current = brakNaStarcie[0].id
      setKrok({ rodzaj: 'intro' })
      return
    }

    for (let i = 0; i < sekcje.length; i++) {
      const brak = missingAnswers(sekcje[i])
      if (brak.length > 0) {
        const komunikat = `Uzupełnij jeszcze: „${brak[0].tresc}”`
        setBrakujacePytanie(brak[0].id)
        if (krok.rodzaj === 'sekcja' && krok.index === i) {
          setBlad(komunikat)
          scrollToQuestion(brak[0].id)
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
    // The final screen also gets its own history entry. Without this it
    // shared one with the last section, so going back from "Thank you" would
    // skip one section too far — instead of the summary, it landed mid-survey.
    if (!zHistorii.current) {
      window.history.pushState({ koniec: true }, '', '#/ankieta/koniec')
    }
    void wyslij()
  }

  /** Send to the spreadsheet. A failed attempt goes to the queue and is retried. */
  const wyslij = async (stanDoWyslania: SurveyState = stanRef.current) => {
    if (!submitConfigured) return
    setStatus('wysylanie')
    const ok = await submitAnswers(stanDoWyslania)
    setStatus(ok ? 'wyslano' : 'blad')
  }

  /**
   * CLEANING UP STORAGE AFTER A CONFIRMED SEND
   * ============================================
   * Once the answers are safely in the spreadsheet, there's no reason for them
   * to keep sitting on the phone. After clearing, the next page open starts
   * the survey from scratch, instead of showing the thank-you screen.
   *
   * THREE CONDITIONS THAT MUST ALL HOLD AT ONCE — each protects against
   * deleting something the organizer would never get to see:
   *
   *  1. `status === 'wyslano'` — the server CONFIRMED the write. It's not
   *     enough that the send went out; we wait for an "ok" response. On
   *     failure the answers stay on the phone and are retried.
   *  2. the queue is empty — if an older, failed send were still waiting in
   *     it, clearing would take away its last chance.
   *  3. sending is configured at all — without a connected spreadsheet the
   *     answers exist ONLY on the phone, and deleting them would be a plain
   *     data loss.
   *
   * We only clear persistent storage. The app's in-memory state stays
   * untouched, so the summary on the final screen keeps showing.
   */
  useEffect(() => {
    if (krok.rodzaj !== 'koniec') return
    if (!submitConfigured || status !== 'wyslano') return
    if (queueLength() > 0) return

    zapisZablokowany.current = true
    clearState()
    forgetSession()
  }, [krok.rodzaj, status])

  /**
   * The "Back" button REMOVES an entry from history instead of pushing a new
   * one. It used to call `idzDo()`, which does a `pushState` — after a few
   * back-and-forths history would bloat, and the system back-navigation would
   * move the participant forward, because that entry was the newest.
   */
  const wstecz = () => {
    if (krok.rodzaj !== 'sekcja') return
    window.history.back()
  }

  // For testing: `resetAnkiety()` in the browser console clears the state and
  // returns to the start. The participant has no such button — after
  // submitting, an accidental clear would be a loss for them, not a convenience.
  useEffect(() => {
    ;(window as Window & { resetAnkiety?: () => void }).resetAnkiety = () => {
      clearState()
      setStan(emptyState)
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
      {/* ===================== HEADER (sticky) ===================== */}
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

          {/* The segmented bar replaced the tiles. The first segment is the
              "Introduction" screen, so you can return to it anytime. */}
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

      {/* ===================== CONTENT ===================== */}
      <div className="flex-1">
        <AnimatePresence mode="wait">
          {/* ------------------------------- STEP: INTRO --- */}
          {krok.rodzaj === 'intro' && (
            <motion.section
              key="intro"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={SPRING}
              className="mx-auto max-w-[26rem] px-5 pb-36 pt-7"
            >
              <span className="font-spacemono text-[10px] uppercase tracking-[0.24em] text-[#9C8345]">
                {sekcjaStartowa.kiedy ?? 'na start'}
              </span>
              <h2 className="mt-2.5 font-dmserif text-[34px] leading-[1.08] text-[#3B3121]">
                {sekcjaStartowa.tytul}
              </h2>

              {/* The "we analyze answers in aggregate" paragraph was removed —
                  from the recording: "it doesn't add anything". Just the
                  question remains. */}
              <p className="mt-6 text-[15px] font-medium leading-snug text-[#3B3121]">
                Chcesz się przedstawić?
              </p>

              <div className="mt-3 grid gap-2.5">
                {(
                  [
                    { klucz: 'imie', tytul: 'Tak, przedstawię się' },
                    { klucz: 'anonimowo', tytul: 'Nie, wypełniam anonimowo' },
                  ] as const
                ).map((opcja) => {
                  const aktywna = stan.intro.przedstawienie === opcja.klucz
                  return (
                    <Fragment key={opcja.klucz}>
                    <button
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
                      <span className="font-dmserif text-[19px] leading-tight">
                        {opcja.tytul}
                      </span>
                      {aktywna && <IconCheck className="h-4 w-4 shrink-0" />}
                    </button>
                      {opcja.klucz === 'imie' && aktywna && (
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
                    </Fragment>
                  )
                })}

              </div>

              {/* Questions from the starting section — on the same screen as
                  the choice above. Previously a separate "Your attendance" page. */}
              <div className="mt-7 flex flex-col gap-3.5">
                {sekcjaStartowa.pytania
                  .filter((q) => isSatisfied(q.pokaz_jesli, stan.odpowiedzi))
                  .map((q) => (
                    <div
                      key={q.id}
                      id={`pytanie-${q.id}`}
                      className={cn(
                        'rounded-md border bg-white p-4 transition-shadow',
                        brakujacePytanie === q.id
                          ? 'border-[#C9A14A] shadow-[0_0_0_3px_rgba(201,161,74,0.18)]'
                          : 'border-[#3B3121]/10 shadow-[0_3px_16px_-10px_rgba(59,49,33,0.35)]',
                      )}
                    >
                      {q.wymagane && (
                        <span className="mb-1 block font-spacemono text-[9.5px] uppercase tracking-[0.2em] text-[#9C7A2C]">
                          wymagane
                        </span>
                      )}
                      <p className="mb-4 text-[15px] font-medium leading-snug text-[#3B3121]">
                        {q.tresc}
                      </p>
                      <QuestionRenderer
                        pytanie={q}
                        wartosc={stan.odpowiedzi[q.id] ?? null}
                        onChange={(w) => ustawOdpowiedz(q.id, w)}
                      />
                    </div>
                  ))}
              </div>

              {blad && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-5 rounded-md border border-[#C9A14A]/40 bg-[#FBF3DF] px-3.5 py-2.5 text-[13px] leading-relaxed text-[#8A6A1E]"
                >
                  {blad}
                </motion.p>
              )}
            </motion.section>
          )}

          {/* ------------------------------ STEP: SECTION --- */}
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

              {/* questions — 60ms cascade per item. Questions with their own
                  condition disappear once it stops being met (e.g. we don't
                  ask about the jury score someone who wasn't at the final). */}
              <div className="mt-6 flex flex-col gap-3.5">
                {sekcje[krok.index].pytania
                  .filter((p) => isSatisfied(p.pokaz_jesli, stan.odpowiedzi))
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
                      {/* "required" marker as a micro-label ABOVE the text —
                          an asterisk appended to the text dropped to its own
                          line and looked like a stray character. */}
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
                    <AnswerField
                      pytanie={p}
                      wartosc={stan.odpowiedzi[p.id] ?? null}
                      onChange={(w) => ustawOdpowiedz(p.id, w)}
                      komentarz={
                        typeof stan.odpowiedzi[`${p.id}::komentarz`] === 'string'
                          ? (stan.odpowiedzi[`${p.id}::komentarz`] as string)
                          : ''
                      }
                      onKomentarz={(v) => ustawOdpowiedz(`${p.id}::komentarz`, v)}
                    />
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

          {/* ------------------------------ STEP: END --- */}
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
                  <IconCheck className="h-7 w-7" />
                </motion.span>
                {/* No name, even if someone introduced themselves at the start.
                    The name goes into the spreadsheet and that's enough — on
                    screen it's unnecessary, and when filling out on someone
                    else's phone it would expose it to a bystander. */}
                <h2 className="mt-6 font-dmserif text-[32px] leading-[1.1] text-[#3B3121]">
                  Dziękujemy
                </h2>
                {/* Without a configured send, answers stay only on the
                    participant's phone. We must not then claim they were
                    saved — the same sentence would be seen by 300 people if
                    someone ever forgot to rebuild the app after a config change. */}
                <p className="mt-3 max-w-[20rem] text-[14.5px] leading-relaxed text-[#6B5D42]">
                  {submitConfigured
                    ? 'Twoje odpowiedzi zostały zapisane. Pomogą nam zbudować jeszcze lepszą edycję Masterclass Leadership.'
                    : 'Dziękujemy za wypełnienie ankiety. Twoje odpowiedzi pomogą nam zbudować jeszcze lepszą edycję Masterclass Leadership.'}
                </p>

                {/* Send status. Shown only when there's something to show: in
                    the build without a connected spreadsheet the screen stays
                    unchanged. */}
                {submitConfigured && (
                  <div className="mt-4 min-h-[24px]">
                    {status === 'wysylanie' && (
                      <span className="font-spacemono text-[11px] uppercase tracking-[0.16em] text-[#9C8345]">
                        Wysyłanie…
                      </span>
                    )}
                    {status === 'wyslano' && (
                      <span className="inline-flex items-center gap-1.5 font-spacemono text-[11px] uppercase tracking-[0.16em] text-[#7A8C5A]">
                        <IconCheck className="h-3.5 w-3.5" />
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

              {/* Overview of what the participant submitted. Replaced the file
                  download and refill buttons — after finishing the survey a
                  person wants to see their answers, not manage files. */}
              <AnswerSummary odpowiedzi={stan.odpowiedzi} />
            </motion.section>
          )}
        </AnimatePresence>
      </div>

      {/* ============ ACTION BAR (stuck to the bottom) ============ */}
      {krok.rodzaj !== 'koniec' && (
        <div className="sticky bottom-0 z-30 border-t border-[#3B3121]/10 bg-gradient-to-t from-parchment via-parchment/95 to-parchment/80 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3.5 backdrop-blur-sm">
          <div className="mx-auto max-w-[26rem]">
            {krok.rodzaj === 'intro' ? (
              <button
                type="button"
                disabled={!introGotowe}
                // We return to the section the user was on before entering here
                // (on the first pass this is simply section 1).
                //
                // This screen now also has required attendance questions, so we
                // check them the same way as in every other section.
                onClick={() => {
                  const brak = missingAnswers(sekcjaStartowa)
                  if (brak.length > 0) {
                    setBlad(`Uzupełnij jeszcze: „${brak[0].tresc}”`)
                    setBrakujacePytanie(brak[0].id)
                    scrollToQuestion(brak[0].id)
                    return
                  }
                  idzDo(stan.biezacaSekcja)
                }}
                // NOTE: `disabled:bg-[#XXXXXX]/12` (arbitrary hex + alpha) isn't
                // generated by Tailwind 3 — the disabled state needs a full,
                // concrete color.
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
