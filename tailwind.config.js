/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      screens: {
        xs: '380px',
      },
      // Kroje wg DESIGN.md. Inter i generyczne szeryfy są zakazane —
      // zerują charakter i czytają się jak domyślny szablon.
      fontFamily: {
        sans: ['Outfit', 'system-ui', 'sans-serif'],
        display: ['Outfit', 'system-ui', 'sans-serif'],
        // `dmserif` to nazwa historyczna używana w komponentach —
        // wskazuje na aktualny krój nagłówkowy (Fraunces: ciepły,
        // charakterny szeryf o zmiennej optyce).
        dmserif: ['Fraunces', 'serif'],
        spacemono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        // Paleta z prototypu „rating speakers": złoto/szampan + chłodna platyna.
        gold: {
          DEFAULT: '#C9A14A',
          light: '#E6C77E',
          deep: '#9E7B33',
        },
        platinum: {
          DEFAULT: '#9FB8C8',
          light: '#E3ECF2',
        },
        // Jasny motyw ankiety: kremowy papier + atrament.
        paper: '#FBF8F3',
        parchment: '#F1E9DB',
        ink: '#3B3121',
      },
      keyframes: {
        spotlight: {
          '0%': { opacity: '0', transform: 'translate(-72%, -62%) scale(0.5)' },
          '100%': { opacity: '1', transform: 'translate(-50%, -40%) scale(1)' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' },
        },
      },
      animation: {
        spotlight: 'spotlight 2s ease 0.3s 1 forwards',
        'fade-up': 'fade-up 0.8s cubic-bezier(0.22, 1, 0.36, 1) forwards',
        'pulse-glow': 'pulse-glow 4s ease-in-out infinite',
        shimmer: 'shimmer 6s linear infinite',
      },
    },
  },
  plugins: [],
}
