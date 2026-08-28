import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// Port 5190 + strictPort: the "rating speakers" prototype uses 5188, other apps
// on this machine use 5173/5180. If 5190 is taken — change the number, don't kill processes.
// host: true → LAN address for testing on a phone (gyroscope requires HTTPS — use a tunnel).
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: {
    port: 5190,
    strictPort: true,
    host: true,
    // Playwright test screenshots land in the project — without this entry
    // the Vite watcher can crash (EBUSY on Windows) or reload the page
    // while the survey is being filled out.
    watch: {
      ignored: [
        '**/.playwright-mcp/**',
        '**/*.png',
        // Speaker photos: dropping files into public/ while the server is
        // running crashed the watcher (EBUSY on Windows). A photo change doesn't
        // need a reload anyway — refreshing the page is enough.
        '**/public/prelegenci/**',
      ],
    },
  },
})
