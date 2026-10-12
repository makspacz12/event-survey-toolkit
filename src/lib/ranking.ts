import type { Option } from '@/data/typy'

/**
 * A ranking answer as it may be trusted: only people still on the list, each
 * once, no more than there are places, in the order they were picked.
 *
 * WHY THIS EXISTS. Answers are cached on the device and the survey's content
 * can change underneath them: a speaker is swapped, the number of places is
 * lowered. A stored ranking can then name someone who is no longer an option.
 * Shown as-is, that person is invisible on screen but still holds first place,
 * the visible picks are numbered 2, 4, 5 with gaps, and the hidden name is
 * what gets submitted as the winner. Nobody chose that, and nobody could see
 * it to undo it.
 *
 * So the stored value is never used raw. Both the widget and the submission
 * read it through this function, which makes the two agree by construction:
 * what is sent is exactly what was on screen.
 */
export function cleanRanking(
  value: unknown,
  options: Option[],
  limit: number,
): string[] {
  if (!Array.isArray(value)) return []
  const allowed = new Set(
    options.map((o) => (typeof o === 'string' ? o : o.tekst)),
  )
  const out: string[] = []
  for (const v of value) {
    // Checked before the push, so a limit of zero lets nothing through.
    if (out.length >= limit) break
    if (typeof v !== 'string' || !allowed.has(v) || out.includes(v)) continue
    out.push(v)
  }
  return out
}
