import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { IkonaCheck } from '@/components/ui/icons'
import type { Opcja, Pytanie, Wartosc } from '@/data/typy'

/**
 * WIDŻETY ODPOWIEDZI — styl „złoto na papierze" z prototypu rating speakers.
 * `PytanieRenderer` to JEDYNE miejsce, które patrzy na typ pytania i dobiera
 * kontrolkę. Nowy typ pytania = jedna gałąź w switchu niżej.
 *
 * Skala 1–10: działa KLIK i PRZECIĄGNIĘCIE (palcem/myszą) po linijce.
 * Opcja `nieobecnosc` dodaje chip „Nie było mnie na tym" — wtedy linijka
 * przygasa, a w odpowiedzi zapisuje się 'nieobecny'.
 */

const GOLD = '#C9A14A'
const GOLD_STRONG = '#9C7A2C'
const GOLD_LABEL = '#9C8345'
const INK = '#3B3121'

/** Sentinel zapisywany dla „nie było mnie". */
export const NIEOBECNY = 'nieobecny'

const opcjaTekst = (o: Opcja) => (typeof o === 'string' ? o : o.tekst)
const opcjaZdjecie = (o: Opcja) =>
  typeof o === 'string' ? undefined : o.zdjecie

/** Inicjały do awatara, gdy brak zdjęcia (np. „Aleksander Kutela" → „AK"). */
function inicjaly(tekst: string) {
  return tekst
    .replace(/\(.*?\)/g, '')
    .trim()
    .split(/\s+/)
    .filter((s) => /^\p{Lu}/u.test(s))
    .slice(0, 2)
    .map((s) => s[0])
    .join('')
}

export function PytanieRenderer({
  pytanie,
  wartosc,
  onChange,
}: {
  pytanie: Pytanie
  wartosc: Wartosc
  onChange: (w: Wartosc) => void
}) {
  switch (pytanie.typ) {
    case 'skala':
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
          absentLabel={pytanie.nieobecnosc_tekst ?? 'Nie było mnie na tym'}
        />
      )
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

/* ------------------------------------------- skala: „linijka" z dragiem --- */

function RulerScale({
  min,
  max,
  value,
  onChange,
  allowAbsent,
  absentLabel,
}: {
  min: number
  max: number
  value: number | typeof NIEOBECNY | null
  onChange: (v: Wartosc) => void
  allowAbsent: boolean
  absentLabel: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)

  const absent = value === NIEOBECNY
  const num = typeof value === 'number' ? value : null
  const ref = hover ?? num
  const items = Array.from({ length: max - min + 1 }, (_, i) => min + i)
  const pct = (n: number) => ((n - min) / (max - min)) * 100

  /** Wartość z pozycji kursora/palca — wspólna dla kliku i przeciągania. */
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

      {/* Linijka: klik, przeciągnięcie ORAZ klawiatura.
          touch-action: none → palec przeciąga po skali zamiast scrollować.
          role="slider" + strzałki: bez tego osoba bez myszy nie odpowie na
          pytanie wymagane, więc w ogóle nie wyśle ankiety. */}
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
          const teraz = num ?? min
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            e.preventDefault()
            onChange(Math.min(teraz + 1, max))
          } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            e.preventDefault()
            onChange(Math.max(teraz - 1, min))
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
            // Palec w czasie jednego przeciągnięcia wysyła ponad sto zdarzeń,
            // a ocena zmienia się przy nich najwyżej dziesięć razy. Bez tego
            // porównania każde drgnięcie przerysowywałoby całą sekcję —
            // na słabszym telefonie właśnie tak powstaje wrażenie klejenia.
            const nowa = valueFromClientX(e.clientX)
            if (nowa !== value) onChange(nowa)
          } else if (e.pointerType === 'mouse') {
            const podglad = valueFromClientX(e.clientX)
            if (podglad !== hover) setHover(podglad)
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

      {/* Chip „nie było mnie" — dyskretny, kreskowana ramka; po włączeniu
          linijka przygasa, a chip robi się złoty. */}
      {allowAbsent && (
        <div className="mt-2.5 flex justify-end">
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
            {absent && <IkonaCheck className="h-3.5 w-3.5" />}
            {absentLabel}
          </button>
        </div>
      )}
    </div>
  )
}

/* -------------------------------------------------------- tak_nie ----------- */

function SharpToggle({
  value,
  onChange,
}: {
  value: 'tak' | 'nie' | null
  onChange: (v: Wartosc) => void
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

/* ------------------------------------------------ chip (opcjonalne zdjęcie) - */

function OptionChip({
  option,
  active,
  withAvatars,
  onClick,
}: {
  option: Opcja
  active: boolean
  withAvatars: boolean
  onClick: () => void
}) {
  const tekst = opcjaTekst(option)
  const zdjecie = opcjaZdjecie(option)
  return (
    <button
      type="button"
      // Bez tego czytnik ekranu czyta samą treść opcji i nie mówi, czy jest
      // wybrana — osoba niewidoma nie ma jak sprawdzić, co zaznaczyła.
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
        (zdjecie ? (
          <img
            src={zdjecie}
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
            {inicjaly(tekst)}
          </span>
        ))}
      <span className="leading-snug">{tekst}</span>
    </button>
  )
}

/* -------------------------------------------------- jeden_wybor: chipy ------ */

function SharpTags({
  options,
  value,
  onChange,
}: {
  options: Opcja[]
  value: string | null
  onChange: (v: Wartosc) => void
}) {
  // Jeśli KTÓRAKOLWIEK opcja ma zdjęcie → wszystkie chipy dostają awatar
  // (zdjęcie lub inicjały), żeby lista wyglądała spójnie.
  const withAvatars = options.some((o) => opcjaZdjecie(o))
  return (
    <div className={cn('flex gap-2', withAvatars ? 'flex-col' : 'flex-wrap')}>
      {options.map((o) => {
        const tekst = opcjaTekst(o)
        const active = value === tekst
        return (
          <OptionChip
            key={tekst}
            option={o}
            active={active}
            withAvatars={withAvatars}
            onClick={() => onChange(active ? null : tekst)}
          />
        )
      })}
    </div>
  )
}

/* -------------------------------------------- wiele_wyborow: chipy multi ---- */

function SharpTagsMulti({
  options,
  value,
  onChange,
}: {
  options: Opcja[]
  value: string[]
  onChange: (v: Wartosc) => void
}) {
  const withAvatars = options.some((o) => opcjaZdjecie(o))
  const toggle = (tekst: string) =>
    value.includes(tekst)
      ? onChange(value.filter((v) => v !== tekst))
      : onChange([...value, tekst])
  return (
    <div className={cn('flex gap-2', withAvatars ? 'flex-col' : 'flex-wrap')}>
      {options.map((o) => {
        const tekst = opcjaTekst(o)
        return (
          <OptionChip
            key={tekst}
            option={o}
            active={value.includes(tekst)}
            withAvatars={withAvatars}
            onClick={() => toggle(tekst)}
          />
        )
      })}
    </div>
  )
}

/* -------------------------------------------------------- tekst ------------- */

function SharpTextarea({
  value,
  onChange,
  rows,
  placeholder,
}: {
  value: string
  onChange: (v: Wartosc) => void
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
