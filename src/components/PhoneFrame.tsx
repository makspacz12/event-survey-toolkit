import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Ramka telefonu — aplikacja jest mobile-first (max 440 px szerokości).
 * Na telefonie ramka wypełnia cały ekran; na komputerze treść stoi na środku,
 * a po bokach pojawiają się OZDOBNE PANELE (złote linie + napisy), żeby duży
 * ekran nie świecił pustką. Nadmiar treści przewija się wewnątrz — paski
 * przewijania są ostylowane w index.css.
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
      {/* pionowe złote linie (hairlines) */}
      <div
        className={cn(
          'absolute inset-y-0 flex gap-3',
          side === 'left' ? 'right-10' : 'left-10',
        )}
      >
        <span className="h-full w-px bg-gradient-to-b from-transparent via-[#C9A14A]/30 to-transparent" />
        <span className="h-full w-px bg-gradient-to-b from-transparent via-[#9FB8C8]/20 to-transparent" />
      </div>
      {/* pionowy napis */}
      <span
        className="animate-pulse-glow select-none font-spacemono text-[11px] uppercase tracking-[0.6em] text-[#C9A14A]/35"
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
    <div className="relative flex min-h-[100dvh] w-full justify-center bg-[#070A12]">
      <SideOrnament side="left" />
      <SideOrnament side="right" />
      {/* właściwa „szyba telefonu" */}
      <div
        className={cn(
          'relative z-10 min-h-[100dvh] w-full max-w-[440px] border-x border-white/[0.06] shadow-[0_0_80px_-20px_rgba(201,161,74,0.15)]',
          className,
        )}
      >
        {children}
      </div>
    </div>
  )
}
