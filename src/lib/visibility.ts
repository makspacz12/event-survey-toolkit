import type { Condition, Question, Section, Survey, Value } from '@/data/typy'

/**
 * ONE PLACE THAT DECIDES WHAT THE PARTICIPANT CAN SEE.
 *
 * Three things have to agree on which questions are on screen: the survey
 * flow (what to render and what to require), the closing summary (what to
 * read back) and the submission (what to send). They used to carry their own
 * copies of this logic, and the submission had none at all — it sent every
 * stored answer, so a Friday rating given before someone changed their mind
 * about Friday still reached the organiser's sheet. Now all three ask here.
 */

export type Answers = Record<string, Value>

/**
 * Does a `pokaz_jesli` / `ukryj_jesli` condition hold for these answers?
 *
 *  • `rowne`    — the answer must be exactly this value
 *  • `zawiera`  — a multi-choice answer must include this option
 *  • `rozne_od` — the answer must be given AND differ from this value; an
 *                 unanswered question does not count as "different"
 */
export function isSatisfied(w: Condition | undefined, answers: Answers): boolean {
  if (!w) return true
  const v = answers[w.pytanie]
  if (w.rowne != null) return v === w.rowne
  if (w.zawiera != null) return Array.isArray(v) && v.includes(w.zawiera)
  if (w.rozne_od != null) {
    if (v == null || v === '') return false
    return v !== w.rozne_od
  }
  return true
}

export function isSectionVisible(s: Section, answers: Answers): boolean {
  return isSatisfied(s.pokaz_jesli, answers)
}

/**
 * A question shows when its `pokaz_jesli` holds and its `ukryj_jesli` does
 * not. The two read naturally in the survey file: "show if the person was
 * at the final", "hide if they marked the debate as not attended".
 */
export function isQuestionVisible(q: Question, answers: Answers): boolean {
  if (!isSatisfied(q.pokaz_jesli, answers)) return false
  if (q.ukryj_jesli && isSatisfied(q.ukryj_jesli, answers)) return false
  return true
}

/** Ids of every question the participant can currently see, section gates included. */
export function visibleQuestionIds(survey: Survey, answers: Answers): Set<string> {
  const ids = new Set<string>()
  for (const s of survey.sekcje) {
    if (!isSectionVisible(s, answers)) continue
    for (const q of s.pytania) {
      if (isQuestionVisible(q, answers)) ids.add(q.id)
    }
  }
  return ids
}

/**
 * Questions CANCELLED by their own `ukryj_jesli` while their section is
 * still on screen. Their answers are dropped: "I did not attend this debate"
 * cancels "this speaker contributed most to it", and keeping the pick would
 * send a contradiction to the sheet.
 *
 * Two kinds of hidden question are deliberately NOT on this list. A whole
 * hidden section: a mis-tap on the attendance question must not wipe twenty
 * answers. And a question whose `pokaz_jesli` gate is merely not met: the
 * gate may open again a moment later (a toggled answer), and the submission
 * leaves unseen questions out on its own.
 */
export function answersToDrop(survey: Survey, answers: Answers): string[] {
  const drop: string[] = []
  for (const s of survey.sekcje) {
    if (!isSectionVisible(s, answers)) continue
    for (const q of s.pytania) {
      if (!(q.ukryj_jesli && isSatisfied(q.ukryj_jesli, answers))) continue
      const v = answers[q.id]
      const filled = v != null && v !== '' && (!Array.isArray(v) || v.length > 0)
      if (filled) drop.push(q.id)
      const comment = answers[`${q.id}::komentarz`]
      if (typeof comment === 'string' && comment !== '') drop.push(`${q.id}::komentarz`)
    }
  }
  return drop
}
