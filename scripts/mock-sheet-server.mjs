/**
 * A LOCAL STAND-IN FOR THE DEPLOYED APPS SCRIPT ENDPOINT.
 *
 * WHY. Every end-to-end test of the survey ends with a POST to the web app
 * that writes a row into the organiser's real spreadsheet. That makes it
 * impossible to rehearse a crowd of a hundred participants without filling
 * the real sheet with a hundred test rows. This server speaks the same
 * protocol as the deployment (text/plain POST in, JSON out) and runs the
 * REAL script code from apps-script/Kod.gs — only the Google services
 * behind it are the in-memory fakes from scripts/lib/fake-google.mjs.
 *
 * So a browser pointed at a build made with
 *   VITE_ARKUSZ_URL=http://127.0.0.1:8787/exec
 * goes through exactly the code path participants will hit, and afterwards
 * the "sheet" can be read back over HTTP and checked cell by cell.
 *
 * Endpoints:
 *   POST /exec                    the endpoint the app calls
 *   GET  /rows                    the sheet as JSON: headers, labels, rows
 *   GET  /reset                   a fresh, empty spreadsheet
 *   GET  /control?delay=250&jitter=250&failNext=3&mode=html|drop|written-drop
 *                                 shape the next responses (see below)
 *
 * Response shaping, for rehearsing bad days:
 *   delay/jitter   how long each write takes (Apps Script needs ~0.3–2 s)
 *   failNext=N     the next N submissions fail; `mode` picks how:
 *                  html  → 200 with an HTML error page, like Google's own
 *                  drop  → the connection is cut with no response at all
 *                  written-drop → the row IS written, then the connection is
 *                  cut: a slow write the browser stopped waiting for
 *
 * Run:  node scripts/mock-sheet-server.mjs            (port 8787)
 *       MOCK_PORT=9000 node scripts/mock-sheet-server.mjs
 */

import http from 'node:http'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createEnvironment, createFile, loadScript } from './lib/fake-google.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const CODE = join(ROOT, 'apps-script', 'Kod.gs')
const PORT = Number(process.env.MOCK_PORT || 8787)

/** The token the app will send: same source the app's build reads. */
function tokenFromEnvLocal() {
  try {
    const m = readFileSync(join(ROOT, '.env.local'), 'utf8').match(/^VITE_ARKUSZ_TOKEN=(.*)$/m)
    return m ? m[1].trim() : ''
  } catch {
    return ''
  }
}
const TOKEN = process.env.MOCK_TOKEN || tokenFromEnvLocal() || 'masterclass'
/** The maintenance password, so `npm run sheet-admin` can be rehearsed here too. */
const ADMIN_TOKEN = process.env.MOCK_ADMIN_TOKEN || 'admin-mock'

/** Warsaw wall-clock time in the script's own format. */
function warsawNow() {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date())
  return parts.replace('T', ' ')
}

let holder
let script
const stats = { received: 0, written: 0, failed: 0, startedAt: new Date().toISOString() }
const shape = { delay: 250, jitter: 250, failNext: 0, mode: 'html' }

function boot() {
  holder = { file: createFile(), cache: {}, consoleErrors: [], loggerEntries: [] }
  const environment = createEnvironment(holder, { now: warsawNow })
  // The repository copy of the script carries a placeholder password; the
  // app sends the real one, so the two are lined up here.
  const source = readFileSync(CODE, 'utf8')
    .replace(/const TOKEN = '[^']*'/, `const TOKEN = '${TOKEN.replace(/'/g, "\\'")}'`)
    .replace(/const ADMIN_TOKEN = '[^']*'/, `const ADMIN_TOKEN = '${ADMIN_TOKEN}'`)
  script = loadScript(source, environment, ['doPost', 'prepareColumns', 'SHEET_NAME']).script
  stats.received = 0
  stats.written = 0
  stats.failed = 0
}
boot()

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { ...cors, 'Content-Type': type })
  res.end(body)
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (chunk) => (data += chunk))
    req.on('end', () => resolve(data))
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Submissions are serialised, as LockService serialises them on Google. */
let chain = Promise.resolve()

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)

  if (req.method === 'OPTIONS') return send(res, 204, '')

  if (req.method === 'POST' && url.pathname === '/exec') {
    const body = await readBody(req)
    stats.received++
    if (shape.failNext > 0) {
      shape.failNext--
      stats.failed++
      if (shape.mode === 'drop') return req.socket.destroy()
      if (shape.mode === 'written-drop') {
        const run = chain.then(async () => {
          await sleep(shape.delay + Math.random() * shape.jitter)
          return script.doPost({ postData: { contents: body } })
        })
        chain = run.catch(() => {})
        const out = await run
        if (JSON.parse(out.tresc).ok) stats.written++
        return req.socket.destroy()
      }
      return send(
        res,
        200,
        '<!DOCTYPE html><html><body>Sorry, unable to open the file at this time.</body></html>',
        'text/html; charset=utf-8',
      )
    }
    const run = chain.then(async () => {
      await sleep(shape.delay + Math.random() * shape.jitter)
      return script.doPost({ postData: { contents: body } })
    })
    chain = run.catch(() => {})
    const out = await run
    const answer = JSON.parse(out.tresc)
    if (answer.ok) stats.written++
    else stats.failed++
    return send(res, 200, out.tresc)
  }

  if (req.method === 'GET' && url.pathname === '/rows') {
    const tab = holder.file.tabs.get(script.SHEET_NAME)
    const data = tab ? tab.data : []
    return send(
      res,
      200,
      JSON.stringify({
        headers: data[0] ?? [],
        labels: data[1] ?? [],
        rows: data.slice(2),
        stats,
        consoleErrors: holder.consoleErrors,
      }),
    )
  }

  if (req.method === 'GET' && url.pathname === '/reset') {
    boot()
    return send(res, 200, JSON.stringify({ ok: true }))
  }

  if (req.method === 'GET' && url.pathname === '/control') {
    for (const key of ['delay', 'jitter', 'failNext']) {
      if (url.searchParams.has(key)) shape[key] = Number(url.searchParams.get(key))
    }
    if (url.searchParams.has('mode')) shape.mode = url.searchParams.get('mode')
    return send(res, 200, JSON.stringify(shape))
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    return send(res, 200, JSON.stringify({ ok: true, port: PORT, token: TOKEN.slice(0, 3) + '…' }))
  }

  send(res, 404, JSON.stringify({ ok: false, blad: 'nie-ma-takiej-sciezki' }))
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`mock Apps Script: http://127.0.0.1:${PORT}/exec  (token ${TOKEN.slice(0, 3)}…, delay ${shape.delay}+${shape.jitter} ms)`)
})
