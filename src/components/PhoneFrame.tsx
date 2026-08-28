import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Phone frame — the app is mobile-first (max 440px wide).
 * On a phone the frame fills the whole screen; on desktop the content sits
 * centered, with DECORATIVE PANELS (gold lines + labels) on the sides so a
 * large screen doesn't look empty. Overflowing content scrolls internally —
 * the scrollbars are styled in index.css.
 */

function SideOrnament({ side }: { side: 'left' | 'right' }) {
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none fixed inset-y-0 z-0 hidden w-[max(0px,calc((100vw-440px)/2))] items-center justify-center md:flex',
        side === 'left' ? 'left-0' : 'right-0',
      )}
    >
      {/* vertical gold lines (hairlines) */}
      <div
        className={cn(
          'absolute inset-y-0 flex gap-3',
          side === 'left' ? 'right-10' : 'left-10',
        )}
      >
        <span className="h-full w-px bg-gradient-to-b from-transparent via-[#C9A14A]/30 to-transparent" />
        <span className="h-full w-px bg-gradient-to-b from-transparent via-[#8A7A55]/20 to-transparent" />
      </div>
      {/* vertical label */}
      <span
        className="animate-pulse-glow select-none font-spacemono text-[11px] uppercase tracking-[0.6em] text-[#9C7A2C]/40"
        style={{ writingMode: 'vertical-rl' }}
      >
        Masterclass Leadership · Tyniec 2026
      </span>
    </div>
  )
}

export function PhoneFrame({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className="relative flex min-h-[100dvh] w-full justify-center bg-parchment">
      <SideOrnament side="left" />
      <SideOrnament side="right" />
      {/* the actual "phone glass" */}
      <div
        className={cn(
          'relative z-10 min-h-[100dvh] w-full max-w-[440px] border-x border-[#3B3121]/10 shadow-[0_0_80px_-20px_rgba(201,161,74,0.35)]',
          className,
        )}
      >
        {children}
      </div>
    </div>
  )
}
