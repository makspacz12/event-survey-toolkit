import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// Port 5190 + strictPort: prototyp „rating speakers" zajmuje 5188, inne appki
// na tej maszynie 5173/5180. Gdy 5190 zajęty — podmień liczbę, nie ubijaj procesów.
// host: true → adres w LAN do testu na telefonie (żyroskop wymaga HTTPS — tunel).
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: {
    port: 5190,
    strictPort: true,
    host: true,
    // Zrzuty ekranu z testów Playwright lądują w projekcie — bez tego wpisu
    // watcher Vite potrafi się wywrócić (EBUSY na Windows) albo przeładować
    // stronę w trakcie wypełniania ankiety.
    watch: {
      ignored: [
        '**/.playwright-mcp/**',
        '**/*.png',
        // Zdjęcia prelegentów: dogrywanie plików do public/ przy działającym
        // serwerze wywracało watcher (EBUSY na Windows). Zmiana zdjęcia i tak
        // nie wymaga przeładowania — wystarczy odświeżyć stronę.
        '**/public/prelegenci/**',
      ],
    },
  },
})
