/**
 * Animated, flowing SVG paths in the landing page background.
 *
 * PERFORMANCE — why this isn't framer-motion:
 * the previous version drew 72 paths (36 × 2 layers), each with its own
 * JavaScript animation setting SVG attributes on every frame. Combined with
 * the robot's 3D scene, this caused noticeable jank on phones.
 *
 * Now: 20 paths and pure CSS animation (`stroke-dashoffset`), which the
 * browser runs off the main thread. Same visual effect, several times
 * lighter load.
 */

function FloatingPaths({ position }: { position: number }) {
  const paths = Array.from({ length: 10 }, (_, i) => {
    const k = i * 3.6 // spread as if 36 paths, but every third one
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
      // Different durations offset the paths' motion relative to each other.
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
