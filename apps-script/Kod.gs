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
      save(dane)
    } finally {
      lock.releaseLock()
    }

    // Marking a person's earlier submissions requires reading the whole
    // session-id column — the most expensive operation in the entire write.
    // We do it AFTER releasing the lock, so it doesn't block the next
    // person. Row order is already fixed, so this doesn't break anything.
    try {
      markPrevious(getSheet(), dane.sesja)
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
 * cache) and append the row. Everything else happens outside the lock.
 */
function save(dane) {
  const arkusz = getSheet()
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
    saveHeadersToCache(naglowki)
  }

  const czas = Utilities.formatDate(
    new Date(),
    'Europe/Warsaw',
    'yyyy-MM-dd HH:mm:ss',
  )
  const wiersz = naglowki.map(function (id) {
    if (id === 'Data wysłania') return czas
    if (id === 'Identyfikator sesji') return dane.sesja || ''
    if (id === 'Kto wypełnił') return dane.kto || 'anonimowo'
    if (id === 'Wersja ankiety') return dane.wersja || ''
    const w = (dane.odpowiedzi || {})[id]
    return w === undefined || w === null ? '' : String(w)
  })

  arkusz.appendRow(wiersz)
}

/** Cache key for headers. */
const HEADERS_CACHE_KEY = 'naglowki-v1'

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
    const zapisane = cache.get(HEADERS_CACHE_KEY)
    if (zapisane) {
      const lista = JSON.parse(zapisane)
      if (lista && lista.length >= FIXED_COLUMNS.length) return lista
    }
    const swieze = getHeaders(arkusz)
    cache.put(HEADERS_CACHE_KEY, JSON.stringify(swieze), 21600)
    return swieze
  } catch (err) {
    // A cache failure must not bring down the write.
    return getHeaders(arkusz)
  }
}

function saveHeadersToCache(naglowki) {
  try {
    CacheService.getScriptCache().put(
      HEADERS_CACHE_KEY,
      JSON.stringify(naglowki),
      21600,
    )
  } catch (err) {
    /* oh well, next time we'll read from the sheet */
  }
}

/**
 * Returns the responses tab. CREATES IT if it doesn't exist, along with the
 * header row. This means deployment works even on an empty, freshly created
 * sheet, and nobody has to prepare anything by hand.
 */
function getSheet() {
  const plik = getSpreadsheet()
  let arkusz = plik.getSheetByName(SHEET_NAME)

  if (!arkusz) {
    arkusz = plik.insertSheet(SHEET_NAME)
  }

  if (arkusz.getLastRow() === 0) {
    // Row 1: identifiers (technical, hidden).
    arkusz.appendRow(FIXED_COLUMNS)
    // Row 2: human-readable headers.
    arkusz.appendRow(FIXED_COLUMNS)
    arkusz.getRange(1, 1, 1, FIXED_COLUMNS.length).setFontColor('#999999')
    arkusz.getRange(2, 1, 1, FIXED_COLUMNS.length).setFontWeight('bold')
    arkusz.setFrozenRows(2)
    arkusz.hideRows(1)
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

/** Row 1 holds question identifiers, and data is arranged in that order. */
function getHeaders(arkusz) {
  const szerokosc = Math.max(arkusz.getLastColumn(), FIXED_COLUMNS.length)
  return arkusz
    .getRange(1, 1, 1, szerokosc)
    .getValues()[0]
    .map((v) => String(v))
}

/** Adds columns for questions the sheet doesn't know about yet. */
function addColumns(arkusz, naglowki, noweId, etykiety) {
  const start = naglowki.length + 1
  noweId.forEach((id, i) => {
    const kol = start + i
    arkusz.getRange(1, kol).setValue(id).setFontColor('#999999')
    arkusz
      .getRange(2, kol)
      .setValue(etykiety[id] || id)
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

  const sesje = arkusz.getRange(3, kolSesja, ostatni - 2, 1).getValues()
  for (let i = 0; i < sesje.length - 1; i++) {
    if (String(sesje[i][0]) === String(sesja)) {
      const komorka = arkusz.getRange(3 + i, kolKto)
      const obecne = String(komorka.getValue())
      if (obecne.indexOf('[nieaktualne]') === -1) {
        komorka.setValue('[nieaktualne] ' + obecne)
      }
    }
  }
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
  save({
    sesja: 'test-' + new Date().getTime(),
    kto: 'TEST (do skasowania)',
    wersja: 'test',
    odpowiedzi: { 'nps': 9, 'obecnosc-dni': 'Piątek; Sobota' },
    etykiety: {
      'nps': 'Na ile prawdopodobne, że polecisz Masterclass znajomemu?',
      'obecnosc-dni': 'W których dniach uczestniczyłeś(-aś)?',
    },
  })
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
  ["pt-debata-otwarcia", "Jak oceniasz debatę otwierającą „Rewolucja świadomości: czy decyzje zapadają, zanim je podejmiemy?”"],
  ["pt-debata-otwarcia::komentarz", "Jak oceniasz debatę otwierającą „Rewolucja świadomości: czy decyzje zapadają, zanim je podejmiemy?” [komentarz]"],
  ["pt-debata-otwarcia-kto", "Kto w debacie otwierającej wniósł Twoim zdaniem najwięcej?"],
  ["pt-koncert", "Jak oceniasz koncert Waldemara Malickiego?"],
  ["pt-koncert::komentarz", "Jak oceniasz koncert Waldemara Malickiego? [komentarz]"],
  ["sb-debata1", "I debata: „Człowiek w epoce przełomu. O jakim świecie warto marzyć”"],
  ["sb-debata1::komentarz", "I debata: „Człowiek w epoce przełomu. O jakim świecie warto marzyć” [komentarz]"],
  ["sb-debata1-kto", "Kto w I debacie wniósł Twoim zdaniem najwięcej?"],
  ["sb-debata2", "II debata: „Innowacje, które zmieniają świat”"],
  ["sb-debata2::komentarz", "II debata: „Innowacje, które zmieniają świat” [komentarz]"],
  ["sb-debata2-kto", "Kto w II debacie wniósł Twoim zdaniem najwięcej?"],
  ["sb-debata3", "III debata: „Na zakręcie geopolitycznym. Przywództwo w czasie przemian”"],
  ["sb-debata3::komentarz", "III debata: „Na zakręcie geopolitycznym. Przywództwo w czasie przemian” [komentarz]"],
  ["sb-debata3-kto", "Kto w III debacie wniósł Twoim zdaniem najwięcej?"],
  ["sb-partnerstwo", "Rozmowa o książce „Partnerstwo” z Markiem Brzezińskim i Olgą Leonowicz"],
  ["sb-partnerstwo::komentarz", "Rozmowa o książce „Partnerstwo” z Markiem Brzezińskim i Olgą Leonowicz [komentarz]"],
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
  ["pod-wartosc-i-poprawa", "Gdybyś mógł(mogła) zmienić jedną rzecz podczas wydarzenia, co by to było?"],
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
 * the way fixes headers for questions whose text changed. It deletes
 * nothing: a column left over from a removed question is only listed in the
 * report — the decision is left to a human.
 *
 * Run manually from the Apps Script editor. Safe to run multiple times —
 * the second time there's simply nothing left to do.
 */
function prepareColumns() {
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

  arkusz
    .getRange(1, 1, 1, idki.length)
    .setValues([idki])
    .setFontColor('#999999')
  arkusz
    .getRange(2, 1, 1, opisy.length)
    .setValues([opisy])
    .setFontWeight('bold')
  arkusz.setFrozenRows(2)
  arkusz.hideRows(1)

  // Columns the survey no longer knows about — left over from a deleted question.
  const znane = FIXED_COLUMNS.concat(
    SURVEY_COLUMNS.map(function (para) {
      return para[0]
    }),
  )
  const osierocone = idki.filter(function (id) {
    return id !== '' && znane.indexOf(id) === -1
  })

  clearCache()

  const raport = [
    'Kolumn wedlug ankiety: ' + (FIXED_COLUMNS.length + SURVEY_COLUMNS.length),
    'Kolumn w arkuszu:      ' + idki.length,
    'Zalozone teraz:        ' + (dodane.length ? dodane.join(', ') : 'brak'),
    'Poprawione naglowki:   ' + (poprawione.length ? poprawione.join(', ') : 'brak'),
    'Spoza ankiety:         ' + (osierocone.length ? osierocone.join(', ') : 'brak'),
  ].join('\n')

  Logger.log(raport)
  return raport
}

/**
 * Clears the cached column list.
 *
 * The script keeps headers in cache for six hours, so it doesn't have to
 * read them on every write. After a manual change to the sheet — especially
 * deleting the "Odpowiedzi" tab — that cache is now stale.
 * Run this function once, and the next write will read the layout fresh.
 */
function clearCache() {
  CacheService.getScriptCache().remove(HEADERS_CACHE_KEY)
  Logger.log('Gotowe: skrypt zapomniał stary układ kolumn.')
}
