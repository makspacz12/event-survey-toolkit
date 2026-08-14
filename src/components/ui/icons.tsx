import { cn } from '@/lib/utils'

/**
 * Ikony — wyłącznie inline SVG (DESIGN.md §4). Zakaz emoji i znaków
 * typograficznych w roli ikon: „✓" i „＋" renderują się inaczej w każdym
 * systemie i psują rytm typograficzny.
 *
 * Wszystkie dziedziczą kolor z `currentColor` i mają jednolitą grubość kreski.
 */

type Props = { className?: string }

const base = 'shrink-0'

export function IkonaCheck({ className }: Props) {
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

export function IkonaPlus({ className }: Props) {
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

/** Krzyżyk — odznaczenie / zamknięcie. */
export function IkonaX({ className }: Props) {
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
