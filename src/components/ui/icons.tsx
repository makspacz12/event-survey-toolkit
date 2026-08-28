import { cn } from '@/lib/utils'

/**
 * Icons — inline SVG only (DESIGN.md §4). Emoji and typographic symbols
 * are banned as icons: "✓" and "＋" render differently on every system
 * and break the typographic rhythm.
 *
 * All icons inherit their color from `currentColor` and share one stroke
 * weight.
 */

type Props = { className?: string }

const base = 'shrink-0'

export function IconCheck({ className }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn(base, className)}
    >
      <path d="M4 12.5l5.2 5.2L20 7" />
    </svg>
  )
}

export function IconPlus({ className }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      aria-hidden
      className={cn(base, className)}
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

/** X mark — deselect / close. */
export function IconX({ className }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      aria-hidden
      className={cn(base, className)}
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}
