import * as React from 'react'
import { cn } from '@/lib/utils'

type Variant = 'gold' | 'platinum'

interface ActionButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant: Variant
  label: string
  sublabel?: string
}

const variants: Record<
  Variant,
  {
    border: string
    text: string
    hoverText: string
    fill: string
    glow: string
    line: string
  }
> = {
  gold: {
    border: 'border-[#C9A14A]/35',
    text: 'text-[#EBD9A8]',
    hoverText: 'group-hover:text-[#17110A]',
    fill: 'from-[#E6C77E] via-[#D4AD5C] to-[#C9A14A]',
    glow: 'group-hover:shadow-[0_14px_44px_-12px_rgba(201,161,74,0.6)]',
    line: 'bg-[#E6C77E]',
  },
  platinum: {
    border: 'border-[#9FB8C8]/35',
    text: 'text-[#DCE7EF]',
    hoverText: 'group-hover:text-[#0A141C]',
    fill: 'from-[#EEF4F8] via-[#C6D6E0] to-[#9FB8C8]',
    glow: 'group-hover:shadow-[0_14px_44px_-12px_rgba(159,184,200,0.55)]',
    line: 'bg-[#E3ECF2]',
  },
}

/**
 * Przycisk akcji (styl z prototypu):
 *  • idle   → szklana powierzchnia z metaliczną ramką
 *  • hover  → metal „wypełnia się" od dołu, tekst inwertuje, hairline u góry
 *  • active → wciśnięcie (scale + inset)
 */
export const ActionButton = React.forwardRef<
  HTMLButtonElement,
  ActionButtonProps
>(({ variant, label, sublabel, className, ...props }, ref) => {
  const v = variants[variant]
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        'group relative isolate flex min-h-[66px] w-full items-center justify-center overflow-hidden rounded-[14px] border bg-white/[0.025] px-2 py-2.5 backdrop-blur-md',
        'transition-[transform,box-shadow,border-color] duration-300 ease-out will-change-transform',
        'hover:-translate-y-[3px] active:translate-y-0 active:scale-[0.975] active:duration-100',
        'active:shadow-[inset_0_2px_14px_rgba(0,0,0,0.5)]',
        'focus:outline-none focus-visible:ring-1 focus-visible:ring-white/50',
        v.border,
        v.glow,
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        className={cn(
          'absolute inset-0 origin-bottom scale-y-0 bg-gradient-to-t transition-transform duration-[360ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-y-100',
          v.fill,
        )}
      />
      <span
        aria-hidden
        className={cn(
          'absolute left-1/2 top-0 h-px w-0 -translate-x-1/2 transition-[width] duration-500 ease-out group-hover:w-[88%]',
          v.line,
        )}
      />
      <span
        className={cn(
          'relative z-10 flex flex-col items-center gap-1 text-center transition-colors duration-300',
          v.text,
          v.hoverText,
        )}
      >
        <span className="font-display text-[14px] font-semibold uppercase leading-none tracking-[0.13em]">
          {label}
        </span>
        {sublabel && (
          <span className="text-[9.5px] font-normal normal-case leading-tight tracking-[0.02em] opacity-75">
            {sublabel}
          </span>
        )}
      </span>
    </button>
  )
})
ActionButton.displayName = 'ActionButton'
