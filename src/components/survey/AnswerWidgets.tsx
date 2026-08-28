import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { IconCheck } from '@/components/ui/icons'
import type { Option, Question, Value } from '@/data/typy'

/**
 * ANSWER WIDGETS — "gold on paper" style from the rating-speakers prototype.
 * `QuestionRenderer` is the ONLY place that looks at the question type and
 * picks a control. A new question type = one new branch in the switch below.
 *
 * 1-10 scale: works with CLICK and DRAG (finger/mouse) along the ruler.
 * The `nieobecnosc` option adds an "I didn't attend" chip — when active,
 * the ruler dims and the answer stores 'nieobecny'.
 */

const GOLD = '#C9A14A'
const GOLD_STRONG = '#9C7A2C'
const GOLD_LABEL = '#9C8345'
const INK = '#3B3121'

/** Sentinel value stored for "I wasn't there". */
export const NIEOBECNY = 'nieobecny'

const optionText = (o: Option) => (typeof o === 'string' ? o : o.tekst)
const optionPhoto = (o: Option) =>
  typeof o === 'string' ? undefined : o.zdjecie

/** Initials for the avatar when there's no photo (e.g. "Aleksander Kutela" -> "AK"). */
function initials(text: string) {
  return text
    .replace(/\(.*?\)/g, '')
    .trim()
    .split(/\s+/)
    .filter((s) => /^\p{Lu}/u.test(s))
    .slice(0, 2)
    .map((s) => s[0])
    .join('')
}

export function QuestionRenderer({
  pytanie,
  wartosc,
  onChange,
  akcja,
}: {
  pytanie: Question
  wartosc: Value
  onChange: (w: Value) => void
  /**
   * Extra element in the control's bottom row — in practice the "Add
   * comment" button. On the scale it lands on the RIGHT side, across from
   * "I didn't attend", so both choices sit on one line.
   * For other types it just sits below the control, right-aligned.
   */
  akcja?: React.ReactNode
}) {
  // The scale lays out its own bottom row, so it gets the action slot inline.
  if (pytanie.typ === 'skala') {
    return (
      <RulerScale
        min={pytanie.min ?? 1}
        max={pytanie.max ?? 10}
        value={
          typeof wartosc === 'number'
            ? wartosc
            : wartosc === NIEOBECNY
              ? NIEOBECNY
              : null
        }
        onChange={onChange}
        allowAbsent={pytanie.nieobecnosc === true}
        absentLabel={pytanie.nieobecnosc_tekst ?? 'Nie brałem(-am) udziału'}
        akcja={akcja}
      />
    )
  }

  return (
    <>
      <Control pytanie={pytanie} wartosc={wartosc} onChange={onChange} />
      {akcja ? (
        <div className="mt-2.5 flex justify-end">{akcja}</div>
      ) : null}
    </>
  )
}

/** The control alone, without the bottom row — picks a widget by question type. */
function Control({
  pytanie,
  wartosc,
  onChange,
}: {
  pytanie: Question
  wartosc: Value
  onChange: (w: Value) => void
}) {
  switch (pytanie.typ) {
    case 'tak_nie':
      return (
        <SharpToggle
          value={wartosc === 'tak' || wartosc === 'nie' ? wartosc : null}
          onChange={onChange}
        />
      )
    case 'jeden_wybor':
      return (
        <SharpTags
          options={pytanie.opcje ?? []}
          value={typeof wartosc === 'string' ? wartosc : null}
          onChange={(v) => onChange(v)}
        />
      )
    case 'wiele_wyborow':
      return (
        <SharpTagsMulti
          options={pytanie.opcje ?? []}
          value={Array.isArray(wartosc) ? wartosc : []}
          onChange={(v) => onChange(v)}
        />
      )
    case 'tekst':
    default:
      return (
        <SharpTextarea
          value={typeof wartosc === 'string' ? wartosc : ''}
          onChange={(v) => onChange(v)}
          rows={4}
          placeholder={pytanie.placeholder ?? 'Twoja odpowiedź…'}
        />
      )
  }
}

/* ---------------------------------------------- scale: draggable ruler ---- */

function RulerScale({
  min,
  max,
  value,
  onChange,
  allowAbsent,
  absentLabel,
  akcja,
}: {
  min: number
  max: number
  value: number | typeof NIEOBECNY | null
  onChange: (v: Value) => void
  allowAbsent: boolean
  absentLabel: string
  akcja?: React.ReactNode
}) {
  const [hover, setHover] = useState<number | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)

  const absent = value === NIEOBECNY
  const num = typeof value === 'number' ? value : null
  const ref = hover ?? num
  const items = Array.from({ length: max - min + 1 }, (_, i) => min + i)
  const pct = (n: number) => ((n - min) / (max - min)) * 100

  /** Value from cursor/finger position — shared by click and drag. */
  const valueFromClientX = (clientX: number) => {
    const el = trackRef.current
    if (!el) return min
    const rect = el.getBoundingClientRect()
    const ratio = Math.min(
      1,
      Math.max(0, (clientX - rect.left - 4) / (rect.width - 8)),
    )
    return Math.round(min + ratio * (max - min))
  }

  return (
    <div>
      <div className="mb-2 flex items-end justify-between">
        <span
          className="font-spacemono text-[10px] uppercase tracking-[0.22em]"
          style={{ color: GOLD_LABEL }}
        >
          Twoja ocena
        </span>
        <span
          className="font-dmserif text-[28px] leading-none tabular-nums"
          style={{ color: GOLD_STRONG }}
        >
          {absent ? '·' : (num ?? '·')}
          <span
            className="font-spacemono text-[12px]"
            style={{ color: GOLD_LABEL }}
          >
            /{max}
          </span>
        </span>
      </div>

      {/* Ruler: click, drag AND keyboard.
          touch-action: none -> the finger drags along the scale instead of scrolling.
          role="slider" + arrow keys: without this, someone without a mouse
          couldn't answer a required question, and couldn't submit the survey at all. */}
      <div
        ref={trackRef}
        role="slider"
        tabIndex={absent ? -1 : 0}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={num ?? undefined}
        aria-valuetext={
          num == null ? 'brak oceny' : `${num} z ${max}`
        }
        aria-label={`Ocena w skali od ${min} do ${max}`}
        onKeyDown={(e) => {
          if (absent) return
          const current = num ?? min
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            e.preventDefault()
            onChange(Math.min(current + 1, max))
          } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            e.preventDefault()
            onChange(Math.max(current - 1, min))
          } else if (e.key === 'Home') {
            e.preventDefault()
            onChange(min)
          } else if (e.key === 'End') {
            e.preventDefault()
            onChange(max)
          }
        }}
        className={cn(
          'relative h-12 select-none rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A14A] focus-visible:ring-offset-2',
          absent ? 'pointer-events-none opacity-30' : 'cursor-pointer',
        )}
        style={{ touchAction: 'none' }}
        onPointerDown={(e) => {
          draggingRef.current = true
          e.currentTarget.setPointerCapture(e.pointerId)
          onChange(valueFromClientX(e.clientX))
        }}
        onPointerMove={(e) => {
          if (draggingRef.current) {
            // A finger fires well over a hundred events during one drag,
            // while the rating only changes at most ten times. Without this
            // comparison every twitch would re-render the whole section —
            // on a weaker phone that's exactly what makes it feel laggy.
            const next = valueFromClientX(e.clientX)
            if (next !== value) onChange(next)
          } else if (e.pointerType === 'mouse') {
            const preview = valueFromClientX(e.clientX)
            if (preview !== hover) setHover(preview)
          }
        }}
        onPointerUp={() => {
          draggingRef.current = false
        }}
        onPointerCancel={() => {
          draggingRef.current = false
        }}
        onPointerLeave={() => setHover(null)}
      >
        <div className="absolute left-1 right-1 top-[14px] h-[2px] bg-[#3B3121]/15" />
        {ref != null ? (
          <div
            className="absolute left-1 top-[14px] h-[2px]"
            style={{
              width: `calc((100% - 8px) * ${pct(ref) / 100})`,
              background: GOLD,
            }}
          />
        ) : null}
        <div className="absolute inset-x-1 top-0 flex justify-between">
          {items.map((n) => {
            const on = ref != null && n <= ref
            return (
              <span
                key={n}
                className="pointer-events-none flex flex-col items-center gap-1"
              >
                <span
                  className="h-[14px] w-[2px] transition-colors duration-150"
                  style={{ background: on ? GOLD : 'rgba(59,49,33,0.25)' }}
                />
                <span
                  className={cn(
                    'font-spacemono text-[10px] tabular-nums transition-colors duration-150',
                    n === num ? 'font-bold' : '',
                  )}
                  style={{ color: n === num ? GOLD_STRONG : GOLD_LABEL }}
                >
                  {n}
                </span>
              </span>
            )
          })}
        </div>
        {num != null ? (
          <motion.div
            className="pointer-events-none absolute top-[14px] h-4 w-4 -translate-x-1/2 -translate-y-1/2 border-2 bg-white"
            style={{ borderColor: GOLD }}
            initial={false}
            animate={{ left: `calc(4px + (100% - 8px) * ${pct(num) / 100})` }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
          />
        ) : null}
      </div>

      {/* "I wasn't there" chip — subtle, dashed border; once toggled on
          the ruler dims and the chip turns gold. */}
      {(allowAbsent || akcja) && (
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
          {allowAbsent ? (
            <button
              type="button"
              aria-pressed={absent}
              onClick={() => onChange(absent ? null : NIEOBECNY)}
              className="flex min-h-[44px] items-center gap-1.5 rounded-md border border-dashed px-3 font-spacemono text-[11px] transition-all duration-200 focus:outline-none"
              style={
                absent
                  ? { borderColor: GOLD, background: GOLD, color: '#fff' }
                  : {
                      borderColor: 'rgba(59,49,33,0.28)',
                      background: 'transparent',
                      color: '#8A7A55',
                    }
              }
            >
              {absent && <IconCheck className="h-3.5 w-3.5" />}
              {absentLabel}
            </button>
          ) : (
            <span />
          )}
          {akcja}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------- tak_nie ----------- */

function SharpToggle({
  value,
  onChange,
}: {
  value: 'tak' | 'nie' | null
  onChange: (v: Value) => void
}) {
  const opts: { value: 'tak' | 'nie'; label: string }[] = [
    { value: 'tak', label: 'Tak' },
    { value: 'nie', label: 'Nie' },
  ]
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {opts.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(active ? null : opt.value)}
            className="h-12 rounded-md border font-dmserif text-[19px] transition-all duration-200 focus:outline-none"
            style={
              active
                ? { borderColor: GOLD, background: GOLD, color: '#fff' }
                : {
                    borderColor: 'rgba(59,49,33,0.2)',
                    background: '#fff',
                    color: '#4A3E29',
                  }
            }
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

/* ---------------------------------------------- chip (optional photo) ----- */

function OptionChip({
  option,
  active,
  withAvatars,
  onClick,
}: {
  option: Option
  active: boolean
  withAvatars: boolean
  onClick: () => void
}) {
  const text = optionText(option)
  const photo = optionPhoto(option)
  return (
    <button
      type="button"
      // Without this, a screen reader only reads the option's text and
      // doesn't say whether it's selected — a blind user has no way to
      // check what they picked.
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex min-h-[44px] items-center gap-2.5 rounded-md border text-left font-spacemono text-[12px] leading-snug transition-all duration-200 focus:outline-none',
        withAvatars ? 'w-full px-2.5 py-2' : 'px-3.5 py-2',
      )}
      style={
        active
          ? { borderColor: GOLD, background: GOLD, color: '#fff' }
          : {
              borderColor: 'rgba(59,49,33,0.18)',
              background: '#fff',
              color: '#4A3E29',
            }
      }
    >
      {withAvatars &&
        (photo ? (
          <img
            src={photo}
            alt=""
            loading="lazy"
            className="h-10 w-10 shrink-0 rounded-full border object-cover object-top"
            style={{ borderColor: active ? '#fff' : 'rgba(201,161,74,0.5)' }}
          />
        ) : (
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border font-dmserif text-[15px]"
            style={
              active
                ? { borderColor: '#fff', color: '#fff' }
                : {
                    borderColor: 'rgba(201,161,74,0.5)',
                    background: '#FBF3DF',
                    color: GOLD_STRONG,
                  }
            }
          >
            {initials(text)}
          </span>
        ))}
      <span className="leading-snug">{text}</span>
    </button>
  )
}

/* -------------------------------------------------- jeden_wybor: chips ----- */

function SharpTags({
  options,
  value,
  onChange,
}: {
  options: Option[]
  value: string | null
  onChange: (v: Value) => void
}) {
  // If ANY option has a photo -> all chips get an avatar (photo or
  // initials), so the list looks consistent.
  const withAvatars = options.some((o) => optionPhoto(o))
  return (
    <div className={cn('flex gap-2', withAvatars ? 'flex-col' : 'flex-wrap')}>
      {options.map((o) => {
        const text = optionText(o)
        const active = value === text
        return (
          <OptionChip
            key={text}
            option={o}
            active={active}
            withAvatars={withAvatars}
            onClick={() => onChange(active ? null : text)}
          />
        )
      })}
    </div>
  )
}

/* -------------------------------------------- wiele_wyborow: multi chips --- */

function SharpTagsMulti({
  options,
  value,
  onChange,
}: {
  options: Option[]
  value: string[]
  onChange: (v: Value) => void
}) {
  const withAvatars = options.some((o) => optionPhoto(o))
  const toggle = (text: string) =>
    value.includes(text)
      ? onChange(value.filter((v) => v !== text))
      : onChange([...value, text])
  return (
    <div className={cn('flex gap-2', withAvatars ? 'flex-col' : 'flex-wrap')}>
      {options.map((o) => {
        const text = optionText(o)
        return (
          <OptionChip
            key={text}
            option={o}
            active={value.includes(text)}
            withAvatars={withAvatars}
            onClick={() => toggle(text)}
          />
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------- tekst ------- */

function SharpTextarea({
  value,
  onChange,
  rows,
  placeholder,
}: {
  value: string
  onChange: (v: Value) => void
  rows: number
  placeholder: string
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      className="w-full resize-none rounded-md border border-[#3B3121]/20 bg-white p-3.5 text-[16px] leading-relaxed placeholder:text-[#A99A78] focus:border-[#C9A14A] focus:outline-none focus:ring-2 focus:ring-[#C9A14A]/15"
      style={{ color: INK }}
    />
  )
}
