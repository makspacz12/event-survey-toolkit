/**
 * RECEIVING SURVEY RESPONSES → GOOGLE SHEET
 * ================================================
 * This script lives INSIDE the Google Sheet (Extensions → Apps Script)
 * and runs under the sheet owner's account. The application has no
 * Google credentials of any kind: it only sends data to the deployment
 * address, and Google authorizes the write on its own side.
 *
 * DEPLOYMENT (once, about 15 minutes):
 *  1. Open the sheet under the CTN Foundation account.
 *  2. Extensions → Apps Script. Delete whatever is there and paste this file.
 *  3. Change TOKEN below to your own random string (the longer the better).
 *  4. Deploy → New deployment → type: Web app.
 *       Execute as: Me
 *       Who has access: Anyone
 *  5. Google will show a warning about an unverified app:
 *       Advanced → Go to (project name). This is normal for your own scripts.
 *  6. Copy the deployment address (ends in /exec) and hand it to whoever
 *     wires it up to the application.
 *
 * UPDATING THE SCRIPT: after every code change, do Deploy → Manage deployments
 * → edit → Version: New. Without this the address keeps serving the old version.
 */

/**
 * Password for the endpoint. Must match VITE_ARKUSZ_TOKEN in the app exactly.
 *
 * NOTE: this file lives in a public repository, so it only ever holds a
 * placeholder value here. The real password is entered in the Apps Script
 * editor and stays there — it never makes it back into the repository.
 */
const TOKEN = 'ENTER-YOUR-OWN-PASSWORD'

/**
 * ID of the spreadsheet to write to.
 *
 * LEAVE EMPTY if the script was created from inside the sheet
 * (Extensions → Apps Script) — it will then find its own sheet automatically.
 *
 * FILL IN if the script is a standalone project created on script.google.com.
 * You'll find the ID in the sheet's URL, between "/d/" and "/edit":
 *
 *   docs.google.com/spreadsheets/d/1AbC...XyZ/edit
 *                                  └────┬────┘
 *                                 paste this
 */
const SPREADSHEET_ID = ''

/** Name of the tab holding responses. Created automatically if missing. */
const SHEET_NAME = 'Odpowiedzi'

/**
 * Second password, for maintenance commands sent to the web app (see
 * `adminAction`). Unlike TOKEN it is NOT part of the application's code,
 * so only whoever prepared this file knows it. Leave empty to switch remote
 * maintenance off altogether.
 */
const ADMIN_TOKEN = ''

/** Reported by the "status" command, so you can tell which code is live. */
const SCRIPT_VERSION = '2026-10-13.1'

/** Fixed columns, always first, in this order. */
const FIXED_COLUMNS = [
  'Data wysłania',
  'Identyfikator sesji',
  'Kto wypełnił',
  'Wersja ankiety',
]

/**
 * Entry point: the application sends a POST here with JSON.
 *
 * Expected data shape:
 * {
 *   token: "...",
 *   sesja: "device uuid",
 *   kto: "Anna Kowalska" | "anonimowo",
 *   wersja: "2026-08-13",
 *   pulapka: "",                       // hidden field, bots fill it in
 *   odpowiedzi: { "question-id": "value", ... },
 *   etykiety:   { "question-id": "Question text", ... }
 * }
 */
function doPost(e) {
  try {
    // Running this from the editor with the "Run" button passes no data at
    // all, so `e` is empty. Without this message Google only shows
    // "Cannot read properties of undefined", which explains nothing.
    if (!e || !e.postData) {
      throw new Error(
        'doPost receives data from the application and cannot be run ' +
          'manually. To test writing to the sheet, pick "testSave" from ' +
          'the function list and click Run.',
      )
    }

    const dane = JSON.parse(e.postData.contents)

    if (dane.token !== TOKEN) {
      return respond({ ok: false, blad: 'zly-token' })
    }

    // Honeypot field: invisible to a human, bots fill in everything.
    if (dane.pulapka) {
      // Pretend success so the bot doesn't keep trying.
      return respond({ ok: true })
    }

    // Maintenance commands: what the editor's "Run" button does, callable
    // from a terminal once the script is deployed. Guarded by a second
    // password that lives only in this file.
    if (dane.akcja) {
      if (!ADMIN_TOKEN || dane.adminToken !== ADMIN_TOKEN) {
        return respond({ ok: false, blad: 'zly-token-admina' })
      }
      return respond(adminAction(String(dane.akcja)))
    }

    // The sheet handle is taken BEFORE the lock. Opening the file and
    // finding the tab are round trips to Google that every request can do
    // at the same time; only the append has to wait its turn. Measured on a
    // plain Gmail account, where each round trip costs about 0.35 s: with
    // five calls under the lock the script managed 0.6 writes a second and
    // lost two thirds of a 300-person rush; with one call it keeps up.
    const arkusz = getSheet()

    // Lock: writes queue up, so two people submitting at the same instant
    // don't collide on the same row.
    //
    // We wait 120 s, not 30. At peak load (an email blast to everyone at
    // once) the queue can get long, and a rejection means a SILENT LOSS of
    // the response: the browser sends without reading the reply, so the app
    // never learns about the error. Better for the participant to wait than
    // to lose their survey. The script execution time limit is 6 minutes,
    // so 120 s leaves plenty of margin.
    const lock = LockService.getScriptLock()
    if (!lock.tryLock(120000)) {
      console.error('Failed to acquire the lock within 120 s — write skipped.')
      return respond({ ok: false, blad: 'kolejka-przepelniona' })
    }
    try {
      save(dane, arkusz)
    } finally {
      lock.releaseLock()
    }

    // Marking a person's earlier submissions requires reading the whole
    // session-id column — the most expensive operation in the entire write.
    // We do it AFTER releasing the lock, so it doesn't block the next person.
    try {
      markPrevious(arkusz, dane.sesja)
    } catch (err) {
      console.error('Marking previous entries failed: ' + err)
    }

    return respond({ ok: true })
  } catch (err) {
    // Log visible under Apps Script → Executions. Makes diagnosis easier
    // without having to guess.
    console.error('Write error: ' + err)
    return respond({ ok: false, blad: String(err) })
  }
}

/**
 * Writes a single survey submission as one row.
 *
 * SPEED MATTERS. Each Sheets API call takes about 0.2–0.5 s, and all writes
 * queue behind one lock (in `doPost`). If a single write takes 2 s, then
 * with 50 people clicking at once the last ones wait over 30 s and fall out
 * of the lock — their responses are lost. A load test showed exactly that:
 * 22 writes out of 50 attempts.
 *
 * That's why the critical section does the MINIMUM: read headers (from
 * cache) and append the row — one round trip to Google when the cache is
 * warm. Everything else happens outside the lock.
 */
function save(dane, arkusz) {
  let naglowki = headersFromCache(arkusz)

  // New questions (e.g. added mid-collection) get a column at the end.
  // Older rows are blank there, and that's accurate: those people simply
  // never saw that question.
  const brakujace = Object.keys(dane.odpowiedzi || {}).filter(
    (id) => naglowki.indexOf(id) === -1,
  )
  if (brakujace.length > 0) {
    addColumns(arkusz, naglowki, brakujace, dane.etykiety || {})
    naglowki = naglowki.concat(brakujace)
    saveHeadersToCache(arkusz, naglowki)
  }

  const czas = Utilities.formatDate(
    new Date(),
    'Europe/Warsaw',
    'yyyy-MM-dd HH:mm:ss',
  )
  const wiersz = naglowki.map(function (id) {
    if (id === 'Data wysłania') return czas
    if (id === 'Identyfikator sesji') return dane.sesja || ''
    if (id === 'Kto wypełnił') return plainText(dane.kto || 'anonimowo')
    if (id === 'Wersja ankiety') return dane.wersja || ''
    const w = (dane.odpowiedzi || {})[id]
    return w === undefined || w === null ? '' : plainText(w)
  })

  arkusz.appendRow(wiersz)
}

/**
 * A participant's words go into the sheet as words, never as a formula.
 *
 * Sheets reads what `appendRow` and `setValue` write the way it reads typing:
 * a cell that starts with "=" becomes a formula, and "+1+1" or "-1+1" become
 * arithmetic. A comment such as `=HYPERLINK(...)` or `=IMPORTRANGE(...)`
 * would then RUN inside the organiser's spreadsheet, with the organiser's
 * access. The leading apostrophe is the sheet's own "this is text" mark: it
 * is not displayed and is not part of the stored value, so the cell reads
 * exactly what the participant typed.
 *
 * Plain numbers are left alone. A rating of "7" has to stay a number so it
 * can be averaged, and "-5" in a comment is harmless.
 *
 * A text that itself starts with an apostrophe gets a second one, because
 * the sheet would otherwise swallow the participant's own.
 */
function plainText(value) {
  const s = String(value)
  const risky = /^\s*[=+\-@']/.test(s)
  const plainNumber = /^\s*[+-]?\d+([.,]\d+)?\s*$/.test(s)
  return risky && !plainNumber ? "'" + s : s
}

/** Prefix of the header-cache key; the rest names the exact tab. */
const HEADERS_CACHE_PREFIX = 'naglowki-v2:'

/**
 * The cached header list is tied to the exact tab it was read from.
 *
 * A new spreadsheet or a deleted-and-recreated "Odpowiedzi" tab has a
 * different id, so a stale list is never consulted for it. Before this,
 * deleting the tab while the cache was warm meant up to six hours of rows
 * written against columns that no longer existed — and nothing complained.
 */
function headersCacheKey(arkusz) {
  return HEADERS_CACHE_PREFIX + arkusz.getParent().getId() + ':' + arkusz.getSheetId()
}

/**
 * Headers from the script cache. The first write after a cold start reads
 * them from the sheet; for the next 6 hours it takes the ready-made list —
 * saving one Sheets API call per submission.
 *
 * The cache is shared across all script executions, so a column added by
 * one execution is immediately visible to the others.
 */
function headersFromCache(arkusz) {
  try {
    const cache = CacheService.getScriptCache()
    const klucz = headersCacheKey(arkusz)
    const zapisane = cache.get(klucz)
    if (zapisane) {
      const lista = JSON.parse(zapisane)
      if (lista && lista.length >= FIXED_COLUMNS.length) return lista
    }
    const swieze = getHeaders(arkusz)
    cache.put(klucz, JSON.stringify(swieze), 21600)
    return swieze
  } catch (err) {
    // A cache failure must not bring down the write.
    return getHeaders(arkusz)
  }
}

/**
 * Row 1 holds question identifiers, and data is arranged in that order.
 *
 * A tab with nothing in it yet (brand new, or emptied by hand) gets its two
 * header rows here, on the cold path: this runs only when the header list
 * is not in the cache, so the ordinary write never pays for the check.
 */
function getHeaders(arkusz) {
  if (arkusz.getLastRow() === 0) {
    initHeaders(arkusz)
    return FIXED_COLUMNS.slice()
  }
  const szerokosc = Math.max(arkusz.getLastColumn(), FIXED_COLUMNS.length)
  return arkusz
    .getRange(1, 1, 1, szerokosc)
    .getValues()[0]
    .map((v) => String(v))
}

/** The two header rows of a fresh tab, plus their formatting. */
function initHeaders(arkusz) {
  // Row 1: identifiers (technical, hidden).
  arkusz.appendRow(FIXED_COLUMNS)
  // Row 2: human-readable headers.
  arkusz.appendRow(FIXED_COLUMNS)
  arkusz.getRange(1, 1, 1, FIXED_COLUMNS.length).setFontColor('#999999')
  arkusz.getRange(2, 1, 1, FIXED_COLUMNS.length).setFontWeight('bold')
  arkusz.setFrozenRows(2)
  arkusz.hideRows(1)
  // The tab was just (re)built, so whatever the cache remembers about it
  // is from a previous life. A tab emptied by hand keeps its id, so the
  // key alone would not catch this case.
  try {
    CacheService.getScriptCache().remove(headersCacheKey(arkusz))
  } catch (err) {
    /* a cache hiccup must not stop the write */
  }
}

function saveHeadersToCache(arkusz, naglowki) {
  try {
    CacheService.getScriptCache().put(
      headersCacheKey(arkusz),
      JSON.stringify(naglowki),
      21600,
    )
  } catch (err) {
    /* oh well, next time we'll read from the sheet */
  }
}

/**
 * Returns the responses tab. CREATES IT if it doesn't exist, along with the
 * header rows. This means deployment works even on an empty, freshly
 * created sheet, and nobody has to prepare anything by hand.
 *
 * Two round trips (open the file, find the tab) and nothing more: this runs
 * for every submission, before the lock, so it must stay cheap.
 */
function getSheet() {
  const plik = getSpreadsheet()
  let arkusz = plik.getSheetByName(SHEET_NAME)
  if (!arkusz) {
    try {
      arkusz = plik.insertSheet(SHEET_NAME)
      initHeaders(arkusz)
    } catch (err) {
      // Two first-ever requests at the same instant: the other one just
      // created the tab, so take that one.
      arkusz = plik.getSheetByName(SHEET_NAME)
      if (!arkusz) throw err
    }
  }
  return arkusz
}

/**
 * Finds the spreadsheet file. Handles both ways the script can be set up:
 * bound to a sheet, or a standalone project with SPREADSHEET_ID filled in.
 */
function getSpreadsheet() {
  if (SPREADSHEET_ID) {
    return SpreadsheetApp.openById(SPREADSHEET_ID)
  }
  const aktywny = SpreadsheetApp.getActiveSpreadsheet()
  if (!aktywny) {
    throw new Error(
      'This script is not bound to any sheet. ' +
        'Enter the spreadsheet ID in the SPREADSHEET_ID constant at the top ' +
        'of the file (found in the sheet\'s URL, between /d/ and /edit).',
    )
  }
  return aktywny
}

/** Adds columns for questions the sheet doesn't know about yet. */
function addColumns(arkusz, naglowki, noweId, etykiety) {
  const start = naglowki.length + 1
  noweId.forEach((id, i) => {
    const kol = start + i
    // The header text comes from the client too, so it gets the same
    // treatment as an answer.
    arkusz.getRange(1, kol).setValue(plainText(id)).setFontColor('#999999')
    arkusz
      .getRange(2, kol)
      .setValue(plainText(etykiety[id] || id))
      .setFontWeight('bold')
  })
}

/**
 * When someone fills the survey a second time, the earlier row from the
 * same session gets a note prefixed to "Kto wypełnił". Nothing is deleted:
 * you can see the person changed their mind, and the newest response is
 * always the lowest row.
 */
function markPrevious(arkusz, sesja) {
  if (!sesja) return
  const kolSesja = 2 // second column per FIXED_COLUMNS
  const kolKto = 3
  const ostatni = arkusz.getLastRow()
  if (ostatni < 4) return

  // Every row of this session except the NEWEST one, which is the row just
  // written. An earlier version skipped the sheet's last row instead — but
  // the lock is already released here, so under load the last row often
  // belongs to the next person, and that stamped our own, only answer as
  // superseded. Nobody else writes our session id, so the newest row with
  // it is ours no matter how many rows others appended underneath.
  const sesje = arkusz.getRange(3, kolSesja, ostatni - 2, 1).getValues()
  const nasze = []
  for (let i = 0; i < sesje.length; i++) {
    if (String(sesje[i][0]) === String(sesja)) nasze.push(i)
  }
  nasze.pop()
  for (let n = 0; n < nasze.length; n++) {
    const komorka = arkusz.getRange(3 + nasze[n], kolKto)
    const obecne = String(komorka.getValue())
    if (obecne.indexOf('[nieaktualne]') === -1) {
      komorka.setValue('[nieaktualne] ' + obecne)
    }
  }
}

/**
 * Maintenance over HTTP. Each command does what a person would otherwise
 * do by hand in the editor or the sheet, and none of them deletes a single
 * answer:
 *
 *   status          what is live: script version, tab, column and row counts
 *   prepareColumns  the same as running prepareColumns from the editor
 *   archiwizuj      renames the current tab to "Odpowiedzi-<date-time>" and
 *                   builds a fresh, empty one with every column in place —
 *                   the way to clear test rows before the event while
 *                   keeping them in reach
 */
function adminAction(akcja) {
  if (akcja === 'status') {
    const plik = getSpreadsheet()
    const arkusz = getSheet()
    const wierszy = Math.max(arkusz.getLastRow() - 2, 0)
    const ostatni =
      wierszy > 0 ? String(arkusz.getRange(arkusz.getLastRow(), 1).getValue()) : ''
    return {
      ok: true,
      wersjaSkryptu: SCRIPT_VERSION,
      arkusz: plik.getId(),
      zakladka: arkusz.getName(),
      kolumn: arkusz.getLastColumn(),
      wierszy: wierszy,
      ostatniWpis: ostatni,
      zakladki: plik.getSheets().map(function (s) {
        return s.getName()
      }),
    }
  }
  if (akcja === 'prepareColumns') {
    return { ok: true, raport: prepareColumns() }
  }
  if (akcja === 'archiwizuj') {
    const lock = LockService.getScriptLock()
    lock.waitLock(120000)
    try {
      const plik = getSpreadsheet()
      const stara = plik.getSheetByName(SHEET_NAME)
      let nazwa = ''
      if (stara) {
        nazwa =
          SHEET_NAME +
          '-' +
          Utilities.formatDate(new Date(), 'Europe/Warsaw', 'yyyy-MM-dd-HHmm')
        while (plik.getSheetByName(nazwa)) nazwa += 'b'
        stara.setName(nazwa)
      }
      const raport = prepareColumnsLocked()
      return { ok: true, zarchiwizowano: nazwa, raport: raport }
    } finally {
      lock.releaseLock()
    }
  }
  return { ok: false, blad: 'nieznana-akcja' }
}

/** JSON response. */
function respond(obiekt) {
  return ContentService.createTextOutput(JSON.stringify(obiekt)).setMimeType(
    ContentService.MimeType.JSON,
  )
}

/**
 * TEST WITHOUT THE APP. Run this function from the editor (the "Run"
 * button) to check that the sheet and tab are created correctly. It
 * appends one sample row, which you can then delete by hand.
 */
function testSave() {
  save(
    {
    sesja: 'test-' + new Date().getTime(),
    kto: 'TEST (do skasowania)',
    wersja: 'test',
    odpowiedzi: { 'nps': 9, 'obecnosc-dni': 'Piątek; Sobota' },
    etykiety: {
      'nps': 'Na ile prawdopodobne, że polecisz Masterclass znajomemu?',
      'obecnosc-dni': 'W których dniach uczestniczyłeś(-aś)?',
    },
    },
    getSheet(),
  )
  console.log('Test row saved. Check the "' + SHEET_NAME + '" tab.')
}

/* === START OF COLUMN LIST (generated) === */
/**
 * Full list of question columns: [identifier, human-readable header].
 *
 * DO NOT EDIT BY HAND — this file is generated from `src/data/ankieta.json`
 * by the `npm run columns` command. A manual edit will disappear on the
 * next run, and worse, it will drift from what the app actually sends.
 */
const SURVEY_COLUMNS = [
  ["obecnosc-piatek", "Czy brałeś(-aś) udział w piątek, 16 października (dzień otwarcia)?"],
  ["obecnosc-sobota", "Czy brałeś(-aś) udział w sobotę, 17 października (debaty i konkurs)?"],
  ["pt-integracja", "Jak oceniasz spotkanie integracyjne?"],
  ["pt-integracja::komentarz", "Jak oceniasz spotkanie integracyjne? [komentarz]"],
  ["pt-debata-otwarcia", "Jak oceniasz debatę otwierającą „Rewolucja świadomości: czy nasze decyzje naprawdę należą do nas?”"],
  ["pt-debata-otwarcia::komentarz", "Jak oceniasz debatę otwierającą „Rewolucja świadomości: czy nasze decyzje naprawdę należą do nas?” [komentarz]"],
  ["pt-debata-otwarcia-kto::1", "Kto, Twoim zdaniem, wniósł najwięcej do debaty otwierającej? [1. miejsce]"],
  ["pt-debata-otwarcia-kto::2", "Kto, Twoim zdaniem, wniósł najwięcej do debaty otwierającej? [2. miejsce]"],
  ["pt-debata-otwarcia-kto::3", "Kto, Twoim zdaniem, wniósł najwięcej do debaty otwierającej? [3. miejsce]"],
  ["pt-koncert", "Jak oceniasz koncert Waldemara Malickiego?"],
  ["pt-koncert::komentarz", "Jak oceniasz koncert Waldemara Malickiego? [komentarz]"],
  ["sb-debata1", "1. debata: „Człowiek w epoce przełomu. O jakim świecie warto marzyć”"],
  ["sb-debata1::komentarz", "1. debata: „Człowiek w epoce przełomu. O jakim świecie warto marzyć” [komentarz]"],
  ["sb-debata1-kto::1", "Kto, Twoim zdaniem, wniósł najwięcej do 1. debaty? [1. miejsce]"],
  ["sb-debata1-kto::2", "Kto, Twoim zdaniem, wniósł najwięcej do 1. debaty? [2. miejsce]"],
  ["sb-debata1-kto::3", "Kto, Twoim zdaniem, wniósł najwięcej do 1. debaty? [3. miejsce]"],
  ["sb-debata2", "2. debata: „Innowacje, które zmieniają świat”"],
  ["sb-debata2::komentarz", "2. debata: „Innowacje, które zmieniają świat” [komentarz]"],
  ["sb-debata2-kto::1", "Kto, Twoim zdaniem, wniósł najwięcej do 2. debaty? [1. miejsce]"],
  ["sb-debata2-kto::2", "Kto, Twoim zdaniem, wniósł najwięcej do 2. debaty? [2. miejsce]"],
  ["sb-debata2-kto::3", "Kto, Twoim zdaniem, wniósł najwięcej do 2. debaty? [3. miejsce]"],
  ["sb-debata3", "3. debata: „Na zakręcie geopolitycznym. Przywództwo w czasie przemian”"],
  ["sb-debata3::komentarz", "3. debata: „Na zakręcie geopolitycznym. Przywództwo w czasie przemian” [komentarz]"],
  ["sb-debata3-kto::1", "Kto, Twoim zdaniem, wniósł najwięcej do 3. debaty? [1. miejsce]"],
  ["sb-debata3-kto::2", "Kto, Twoim zdaniem, wniósł najwięcej do 3. debaty? [2. miejsce]"],
  ["sb-debata3-kto::3", "Kto, Twoim zdaniem, wniósł najwięcej do 3. debaty? [3. miejsce]"],
  ["sb-partnerstwo", "Rozmowa o książce „Partnerstwo” z Markiem Brzezinskim i Olgą Leonowicz"],
  ["sb-partnerstwo::komentarz", "Rozmowa o książce „Partnerstwo” z Markiem Brzezinskim i Olgą Leonowicz [komentarz]"],
  ["sb-debaty-uwagi", "Co najbardziej zapamiętasz z debat?"],
  ["kk-polfinal-format", "Jak oceniasz formułę półfinału przy stolikach (lunch z gośćmi VIP, prezentacje przy stole)?"],
  ["kk-polfinal-format::komentarz", "Jak oceniasz formułę półfinału przy stolikach (lunch z gośćmi VIP, prezentacje przy stole)? [komentarz]"],
  ["kk-feedback-liderzy", "Czy podczas konkursu dostałeś(-aś) wartościowy feedback od doświadczonych liderów?"],
  ["kk-feedback-liderzy::komentarz", "Czy podczas konkursu dostałeś(-aś) wartościowy feedback od doświadczonych liderów? [komentarz]"],
  ["fn-final", "Jak oceniasz formułę finału (elevator pitch przed jury)?"],
  ["fn-final::komentarz", "Jak oceniasz formułę finału (elevator pitch przed jury)? [komentarz]"],
  ["kk-zasady", "Czy zasady konkursu (złote bilety, przejście do finału, ocena jury) były dla Ciebie jasne?"],
  ["kk-zasady::komentarz", "Czy zasady konkursu (złote bilety, przejście do finału, ocena jury) były dla Ciebie jasne? [komentarz]"],
  ["kk-polecenie", "Czy poleciłbyś(-abyś) udział w konkursie swoim znajomym?"],
  ["kk-polecenie::komentarz", "Czy poleciłbyś(-abyś) udział w konkursie swoim znajomym? [komentarz]"],
  ["org-rekrutacja", "Czy proces rekrutacji i jego zasady były dla Ciebie jasne?"],
  ["org-rekrutacja::komentarz", "Czy proces rekrutacji i jego zasady były dla Ciebie jasne? [komentarz]"],
  ["org-transport", "Jak oceniasz transport?"],
  ["org-transport::komentarz", "Jak oceniasz transport? [komentarz]"],
  ["org-jedzenie", "Jak oceniasz jedzenie (poczęstunek, lunch)?"],
  ["org-jedzenie::komentarz", "Jak oceniasz jedzenie (poczęstunek, lunch)? [komentarz]"],
  ["org-miejsce", "Jak oceniasz miejsce wydarzenia (Opactwo w Tyńcu)?"],
  ["org-miejsce::komentarz", "Jak oceniasz miejsce wydarzenia (Opactwo w Tyńcu)? [komentarz]"],
  ["pod-wartosc-i-poprawa", "Gdybyś mógł(mogła) zmienić coś podczas wydarzenia, co by to było?"],
  ["pod-wrazenie", "Co zrobiło na Tobie największe wrażenie, wniosło największą wartość?"],
  ["pod-wlasnymi-slowami", "Gdybyś miał(a) opisać te dwa dni jednym zdaniem, jak by ono brzmiało?"],
]
/* === END OF COLUMN LIST === */

/**
 * Sets up ALL survey columns in the sheet, without waiting for responses.
 *
 * Normally a column is created on the first response that touches it — that
 * works fine, but until the first submission there's no way to see whether
 * the layout is correct. This function sets them all up at once, and along
 * the way fixes headers for questions whose text changed.
 *
 * A column left over from a removed question is deleted only if it is
 * completely empty. If it holds even one answer it stays and is listed in
 * the report — throwing away collected data is left to a human.
 *
 * Run manually from the Apps Script editor, ideally BEFORE collecting
 * answers. Safe to run multiple times — the second time there's simply
 * nothing left to do.
 *
 * It takes the same lock as the writes: while columns are being moved
 * around, a response written against the old layout would land one cell
 * to the right of its headers, silently.
 */
function prepareColumns() {
  const lock = LockService.getScriptLock()
  lock.waitLock(120000)
  try {
    return prepareColumnsLocked()
  } finally {
    lock.releaseLock()
  }
}

function prepareColumnsLocked() {
  const arkusz = getSheet()

  // Row 1 holds identifiers, row 2 holds human-readable headers.
  const szerokosc = Math.max(arkusz.getLastColumn(), FIXED_COLUMNS.length)
  const idki = arkusz
    .getRange(1, 1, 1, szerokosc)
    .getValues()[0]
    .map(function (v) {
      return String(v)
    })
  const opisy = arkusz
    .getRange(2, 1, 1, szerokosc)
    .getValues()[0]
    .map(function (v) {
      return String(v)
    })

  // Trim trailing empty columns, otherwise new ones would land after a gap.
  while (idki.length > FIXED_COLUMNS.length && idki[idki.length - 1] === '') {
    idki.pop()
    opisy.pop()
  }

  const dodane = []
  const poprawione = []

  for (let i = 0; i < SURVEY_COLUMNS.length; i++) {
    const id = SURVEY_COLUMNS[i][0]
    const etykieta = SURVEY_COLUMNS[i][1]
    const kol = idki.indexOf(id)

    if (kol === -1) {
      idki.push(id)
      opisy.push(etykieta)
      dodane.push(id)
    } else if (opisy[kol] !== etykieta) {
      opisy[kol] = etykieta
      poprawione.push(id)
    }
  }

  // The first four columns describe themselves — same as at creation time.
  for (let i = 0; i < FIXED_COLUMNS.length; i++) {
    idki[i] = FIXED_COLUMNS[i]
    opisy[i] = FIXED_COLUMNS[i]
  }

  // Headers read back from the sheet come without their text-marker
  // apostrophe, so a label that began with "=" would turn into a formula
  // on the way back in. Through plainText they stay text.
  arkusz
    .getRange(1, 1, 1, idki.length)
    .setValues([idki.map(plainText)])
    .setFontColor('#999999')
  arkusz
    .getRange(2, 1, 1, opisy.length)
    .setValues([opisy.map(plainText)])
    .setFontWeight('bold')
  arkusz.setFrozenRows(2)
  arkusz.hideRows(1)

  // Columns the survey no longer knows about — left over from a deleted question.
  const znane = FIXED_COLUMNS.concat(
    SURVEY_COLUMNS.map(function (para) {
      return para[0]
    }),
  )
  // Walked right to left, so a deletion never shifts a column still to be
  // looked at. Data rows start at row 3; a column with none of them filled
  // in is clutter, one with a single answer is somebody's data.
  const ostatniWiersz = arkusz.getLastRow()
  const usuniete = []
  const osierocone = []
  for (let k = idki.length - 1; k >= FIXED_COLUMNS.length; k--) {
    const id = idki[k]
    if (id === '' || znane.indexOf(id) !== -1) continue

    let pusta = true
    if (ostatniWiersz > 2) {
      const wartosci = arkusz
        .getRange(3, k + 1, ostatniWiersz - 2, 1)
        .getValues()
      for (let w = 0; w < wartosci.length; w++) {
        if (String(wartosci[w][0]) !== '') {
          pusta = false
          break
        }
      }
    }

    if (pusta) {
      arkusz.deleteColumn(k + 1)
      idki.splice(k, 1)
      usuniete.unshift(id)
    } else {
      osierocone.unshift(id)
    }
  }

  clearCache()

  const raport = [
    'Kolumn wedlug ankiety: ' + (FIXED_COLUMNS.length + SURVEY_COLUMNS.length),
    'Kolumn w arkuszu:      ' + idki.length,
    'Zalozone teraz:        ' + (dodane.length ? dodane.join(', ') : 'brak'),
    'Poprawione naglowki:   ' + (poprawione.length ? poprawione.join(', ') : 'brak'),
    'Usuniete puste:        ' + (usuniete.length ? usuniete.join(', ') : 'brak'),
    'Spoza ankiety:         ' + (osierocone.length ? osierocone.join(', ') : 'brak'),
  ].join('\n')

  Logger.log(raport)
  return raport
}

/**
 * Clears the cached column list.
 *
 * The script keeps headers in cache for six hours, so it doesn't have to
 * read them on every write. A deleted tab or a new spreadsheet is noticed
 * automatically (the key names the tab), but columns deleted BY HAND inside
 * the same tab are not. Run this once after such a change, and the next
 * write reads the layout fresh.
 */
function clearCache() {
  const cache = CacheService.getScriptCache()
  cache.remove(headersCacheKey(getSheet()))
  cache.remove('naglowki-v1') // key used by versions before October 2026
  Logger.log('Gotowe: skrypt zapomniał stary układ kolumn.')
}
