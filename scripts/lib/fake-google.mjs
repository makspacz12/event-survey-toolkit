/**
 * A STAND-IN FOR THE GOOGLE SERVICES THE APPS SCRIPT TALKS TO.
 *
 * The real script (apps-script/Kod.gs) calls SpreadsheetApp, LockService,
 * CacheService and friends. None of those exist outside Google, so to run
 * the script on this machine we hand it look-alikes: an in-memory sheet that
 * behaves like the few Sheets methods the script uses, a cache that
 * remembers values between calls, a lock that always succeeds.
 *
 * Two things use this file and must agree on it: the unit tests
 * (scripts/test-script.mjs) and the local mock of the web app endpoint
 * (scripts/mock-sheet-server.mjs), which lets a browser-driven survey be
 * submitted end to end without touching the organiser's real spreadsheet.
 */

let nextSheetId = 1
let nextFileId = 1

/**
 * What Sheets does with a value that arrives through `appendRow` or
 * `setValue`: it reads it like typing. A leading apostrophe means "this is
 * text" and is dropped; a leading "=" turns the cell into a formula. The
 * fake keeps a formula as a marker object instead of a string, so any test
 * that compares cells to strings fails loudly the moment a participant's
 * text is about to run as a formula in the organiser's sheet.
 */
export function enterLikeSheets(value) {
  if (typeof value !== 'string') return value
  // Sheets refuses the whole write, and with it the whole row.
  if (value.length > 50000) {
    throw new Error(
      'Your input contains more than the maximum of 50000 characters in a single cell.',
    )
  }
  if (value.startsWith("'")) return value.slice(1)
  // "=" always starts a formula; "+" and "-" do too, unless what follows is
  // just a number ("+1" and "-5" are the numbers 1 and -5).
  const number = /^[+-]?\d+([.,]\d+)?$/.test(value.trim())
  if (/^\s*[=+-]/.test(value) && !number) return { formula: value }
  return value
}

/** One tab of a spreadsheet: a grid of cells plus the bits of formatting state the script touches. */
export function createSheet(name, parent) {
  let nazwa = name
  const data = [] // array of rows, each an array of cells
  const id = nextSheetId++ // every tab gets a fresh id, like in Sheets
  let frozen = 0
  const hidden = []
  // A fresh tab has 26 columns; writes past the edge widen the grid, and so
  // does an explicit insertColumnsAfter.
  let maxColumns = 26

  const cell = (r, c) => {
    while (data.length < r) data.push([])
    const row = data[r - 1]
    while (row.length < c) row.push('')
    return row
  }

  const sheet = {
    get name() {
      return nazwa
    },
    data,
    _state: () => ({ frozen, hidden }),
    getName: () => nazwa,
    // Renaming moves the tab under its new name in the file, as in Sheets.
    setName: (n) => {
      if (parent && parent.tabs) {
        parent.tabs.delete(nazwa)
        parent.tabs.set(n, sheet)
      }
      nazwa = n
      return sheet
    },
    getSheetId: () => id,
    getParent: () => parent,
    // Removes one column from every row, the way Sheets does.
    deleteColumn: (n) => data.forEach((row) => row.splice(n - 1, 1)),
    getLastRow: () => data.length,
    getLastColumn: () => data.reduce((m, w) => Math.max(m, w.length), 0),
    getMaxColumns: () => Math.max(maxColumns, sheet.getLastColumn()),
    insertColumnsAfter: (after, count) => {
      maxColumns = Math.max(maxColumns, after) + count
      return sheet
    },
    appendRow: (row) => data.push(row.map(enterLikeSheets)),
    setFrozenRows: (n) => {
      frozen = n
    },
    hideRows: (n) => hidden.push(n),
    getRange: (r, c, rowCount = 1, colCount = 1) => ({
      getValues: () => {
        const result = []
        for (let i = 0; i < rowCount; i++) {
          const row = []
          for (let j = 0; j < colCount; j++) {
            const src = data[r - 1 + i] || []
            row.push(src[c - 1 + j] === undefined ? '' : src[c - 1 + j])
          }
          result.push(row)
        }
        return result
      },
      getValue: () => {
        const src = data[r - 1] || []
        return src[c - 1] === undefined ? '' : src[c - 1]
      },
      setValue: function (v) {
        const row = cell(r, c)
        row[c - 1] = enterLikeSheets(v)
        return this // allows chaining .setFontColor()
      },
      // Writes a whole row at once — that's how `prepareColumns` does it,
      // because at 54 columns individual setValue calls would be 54 round
      // trips to Google.
      setValues: function (matrix) {
        matrix.forEach((row, i) => {
          row.forEach((v, j) => {
            const dst = cell(r + i, c + j)
            dst[c - 1 + j] = enterLikeSheets(v)
          })
        })
        return this
      },
      setFontColor: function () {
        return this
      },
      setFontWeight: function () {
        return this
      },
    }),
  }
  return sheet
}

/** A spreadsheet file: a named set of tabs with an id of its own. */
export function createFile() {
  const tabs = new Map()
  const id = `plik-${nextFileId++}`
  const file = {
    tabs,
    getId: () => id,
    getSpreadsheetTimeZone: () => 'Europe/Warsaw',
    getSheetByName: (n) => tabs.get(n) || null,
    getSheets: () => [...tabs.values()],
    insertSheet: (n) => {
      const a = createSheet(n, file)
      tabs.set(n, a)
      return a
    },
  }
  return file
}

/**
 * The globals the script expects, wired to a `holder`:
 *   { file, cache, consoleErrors, loggerEntries }
 *
 * Everything is read through the holder on each call, never captured once,
 * so a caller may swap `holder.cache = {}` or `holder.file = createFile()`
 * and the already-loaded script sees the change.
 */
export function createEnvironment(holder, options = {}) {
  const now = options.now ?? (() => '2026-10-18 19:12:04')
  return {
    SpreadsheetApp: {
      // Default path from the instructions: the script was created from
      // inside the sheet (Extensions → Apps Script), so it's bound to it and
      // the SPREADSHEET_ID constant stays empty. Both ways of finding the
      // file lead to the same place here.
      openById: () => holder.file,
      getActiveSpreadsheet: () => holder.file,
    },
    LockService: {
      // `tryLock` returns true/false instead of throwing — the script relies
      // on this version so that under contention it responds with an error
      // instead of crashing.
      getScriptLock: () => ({
        tryLock: () => true,
        waitLock: () => {},
        releaseLock: () => {},
      }),
    },
    // Header cache. The fake has to behave like the real thing: keep a value
    // between calls, since that's the whole point of the savings being tested.
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (k in holder.cache ? holder.cache[k] : null),
        put: (k, v) => {
          holder.cache[k] = v
        },
        remove: (k) => {
          delete holder.cache[k]
        },
      }),
    },
    Utilities: {
      formatDate: () => now(),
    },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (t) => ({ setMimeType: () => ({ tresc: t }) }),
    },
    console: {
      log: () => {},
      error: (m) => holder.consoleErrors.push(String(m)),
    },
    Logger: {
      log: (m) => holder.loggerEntries.push(String(m)),
    },
  }
}

/**
 * Evaluates the script source with the environment's globals in scope and
 * returns the named top-level bindings. `factory` is exposed too, so a test
 * can re-run the same source against a different environment.
 */
export function loadScript(source, environment, exportNames) {
  const names = Object.keys(environment)
  const factory = new Function(
    ...names,
    `${source}\n;return { ${exportNames.join(', ')} };`,
  )
  return { factory, script: factory(...Object.values(environment)) }
}
