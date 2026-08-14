/**
 * Animowane, płynące ścieżki SVG w tle landingu.
 *
 * WYDAJNOŚĆ — powód, dla którego to nie jest framer-motion:
 * poprzednia wersja rysowała 72 ścieżki (36 × 2 warstwy), każdą z własną
 * animacją JavaScriptu ustawiającą atrybuty SVG w każdej klatce. Razem ze
 * sceną 3D robota dawało to na telefonie zauważalne przycinanie.
 *
 * Teraz: 20 ścieżek i animacja czystym CSS-em (`stroke-dashoffset`), którą
 * przeglądarka wykonuje poza głównym wątkiem. Efekt wizualny ten sam,
 * obciążenie kilkukrotnie mniejsze.
 */

function FloatingPaths({ position }: { position: number }) {
  const paths = Array.from({ length: 10 }, (_, i) => {
    const k = i * 3.6 // rozrzut jak przy 36 ścieżkach, ale co trzecia
    return {
      id: i,
      d: `M-${380 - k * 5 * position} -${189 + k * 6}C-${
        380 - k * 5 * position
      } -${189 + k * 6} -${312 - k * 5 * position} ${216 - k * 6} ${
        152 - k * 5 * position
      } ${343 - k * 6}C${616 - k * 5 * position} ${470 - k * 6} ${
        684 - k * 5 * position
      } ${875 - k * 6} ${684 - k * 5 * position} ${875 - k * 6}`,
      width: 0.5 + k * 0.03,
      opacity: 0.06 + i * 0.028,
      // Różne czasy trwania rozsuwają ruch ścieżek względem siebie.
      duration: 22 + i * 2.4,
    }
  })

  return (
    <div className="pointer-events-none absolute inset-0">
      <svg
        className="h-full w-full text-[#C9A14A]"
        viewBox="0 0 696 316"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        {paths.map((path) => (
          <path
            key={path.id}
            d={path.d}
            stroke="currentColor"
            strokeWidth={path.width}
            strokeOpacity={path.opacity}
            className="sciezka-tla"
            style={{ animationDuration: `${path.duration}s` }}
          />
        ))}
      </svg>
    </div>
  )
}

export function BackgroundPaths() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <FloatingPaths position={1} />
      <FloatingPaths position={-1} />
    </div>
  )
}
