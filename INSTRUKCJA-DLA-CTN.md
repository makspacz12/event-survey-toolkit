# Podłączenie ankiety do arkusza Google

Ankieta dla uczestników Masterclass Leadership 2026 jest gotowa. Zostało jedno:
podłączyć ją do arkusza, żeby odpowiedzi spływały tam automatycznie.

Poniżej wszystko krok po kroku. To głównie klikanie i jedno wklejenie gotowego
kodu.

| | |
|---|---|
| **Czas** | około 15 minut |
| **Potrzebne** | konto Google Fundacji CTN |
| **Wiedza techniczna** | niepotrzebna |

---

## Krok 1. Załóż arkusz na koncie fundacji

Zaloguj się na konto Google **Fundacji CTN** (nie na prywatne — trafią tam dane
osób, które zdecydują się podpisać ankietę) i wejdź na:

```
sheets.new
```

Powstanie pusty arkusz. Nazwij go, na przykład
*Masterclass Leadership 2026 — odpowiedzi*.

Nie twórz żadnych zakładek ani nagłówków. Wszystko powstanie samo.

---

## Krok 2. Skopiuj identyfikator arkusza

Spójrz na adres arkusza w przeglądarce. Potrzebny jest fragment między `/d/`
a `/edit`:

```
docs.google.com/spreadsheets/d/1AbC...XyZ/edit
                               ^^^^^^^^^^
                               to skopiuj
```

Przyda się w kroku 4.

---

## Krok 3. Otwórz edytor skryptów i wklej kod

W arkuszu wybierz z górnego menu:

```
Rozszerzenia → Apps Script
```

Otworzy się edytor z plikiem `Kod.gs` i kilkoma linijkami przykładu.
**Zaznacz wszystko** (`Ctrl+A`), skasuj, a potem wklej kod z sekcji
[Kod do wklejenia](#kod-do-wklejenia) na końcu tego dokumentu.

Zapisz (`Ctrl+S`).

---

## Krok 4. Uzupełnij dwie linijki na górze kodu

Na samej górze wklejonego kodu są dwie wartości do podmiany. To jedyne miejsce,
które ruszasz.

**Hasło** — wpisz dokładnie `masterclass`. Znajdź linijkę:

```javascript
const TOKEN = 'WPISZ-WLASNE-HASLO'
```

i zmień ją na:

```javascript
const TOKEN = 'masterclass'
```

> Aplikacja jest już ustawiona na to hasło, więc musi się zgadzać co do znaku —
> małe litery, bez spacji. Gdyby się różniło, arkusz odrzuci każdą odpowiedź.

**Identyfikator arkusza** — ten skopiowany w kroku 2. Znajdź linijkę z pustymi
apostrofami:

```javascript
const ID_ARKUSZA = ''
```

i wklej identyfikator pomiędzy nie:

```javascript
const ID_ARKUSZA = '1AbC...XyZ'
```

Zapisz ponownie (`Ctrl+S`).

---

## Krok 5. Sprawdź, czy zapis działa

Na górnym pasku edytora jest lista funkcji, obok przycisku **Uruchom**.
Wybierz z niej **`testZapisu`** i kliknij **Uruchom**.

> **Google poprosi o zgodę.** Kliknij *Sprawdź uprawnienia* → wybierz konto →
> na ekranie „Aplikacja niezweryfikowana" kliknij *Zaawansowane*, potem
> *Przejdź do…* → *Zezwól*.
>
> To normalne dla własnych skryptów. Skrypt ma dostęp wyłącznie do tego jednego
> arkusza.

Wróć do arkusza. Powinna pojawić się zakładka **Odpowiedzi** z nagłówkami i
jednym wierszem testowym. **Skasuj ten wiersz**, nagłówki zostaw.

Jeśli zakładka się pojawiła, najtrudniejsze masz za sobą.

---

## Krok 6. Opublikuj skrypt

W edytorze, prawy górny róg:

```
Wdróż → Nowe wdrożenie
```

Kliknij ikonę koła zębatego przy „Wybierz typ" i wybierz **Aplikacja
internetowa**. Ustaw:

- **Wykonaj jako:** Ja
- **Kto ma dostęp:** Wszyscy

> **„Wszyscy" brzmi groźnie, ale znaczy co innego.** Tylko tyle, że ankieta może
> wysyłać dane bez logowania uczestnika. Nikt nie zobaczy zawartości arkusza —
> skrypt przyjmuje dane i niczego nie zwraca.

Kliknij **Wdróż**. Google pokaże adres kończący się na `/exec`. Skopiuj go.

---

## Co odesłać

Dwie rzeczy:

**1. Adres aplikacji internetowej** (z kroku 6, kończy się na `/exec`)

```
https://script.google.com/macros/s/AKfycb.../exec
```

**2. Link do arkusza** — żebym mógł sprawdzić, czy odpowiedzi dochodzą.
Wystarczy dostęp do podglądu.

```
https://docs.google.com/spreadsheets/d/...
```

Hasła nie odsyłasz — jest z góry ustalone (`masterclass`) i takie samo po obu
stronach.

Po otrzymaniu tych dwóch rzeczy podłączam ankietę i odsyłam link do
przetestowania.

---

## Gdy coś nie działa

| Co widzisz | Co to znaczy |
|---|---|
| Błąd o `postData` | Uruchomiłeś funkcję `doPost` zamiast `testZapisu`. Zmień wybór na liście przy przycisku Uruchom. |
| Ostrzeżenie o niezweryfikowanej aplikacji | Normalne dla własnych skryptów. *Zaawansowane* → *Przejdź do…* |
| Zakładka „Odpowiedzi" nie powstała | Najczęściej pusty albo błędny `ID_ARKUSZA`. Sprawdź krok 2 i 4. |
| W arkuszu nic się nie pojawia, choć ludzie wypełniają | Najczęściej hasło różni się o znak. W kodzie ma być dokładnie `masterclass`. |
| Zmieniłeś kod i nic się nie dzieje | Po każdej zmianie trzeba opublikować nową wersję: *Wdróż → Zarządzaj wdrożeniami → ołówek → Wersja: Nowa*. |

W edytorze skryptu zakładka **Wykonania** pokazuje każdą próbę zapisu razem z
błędem — tam widać, czy coś przyszło i co poszło nie tak.

---

## Co się dzieje z danymi

Odpowiedzi trafiają wyłącznie do tego arkusza, na koncie fundacji.

- Ankietę można wypełnić **anonimowo**; imię i nazwisko są dobrowolne.
- Uczestnik **nie musi mieć konta Google** ani nigdzie się logować. Skanuje kod
  QR, wypełnia, gotowe.
- Jeden wiersz to jedna wypełniona ankieta, jedna kolumna to jedno pytanie.
- **Excel** pobierasz z menu *Plik → Pobierz → Microsoft Excel (.xlsx)*.
- Skrypt tworzy jedną zakładkę, `Odpowiedzi`. Średnie ocen liczycie już po
  swojemu, w arkuszu albo w Excelu, na przykład funkcją `ŚREDNIA`.

---

## Kod do wklejenia

Cała zawartość pliku `Kod.gs`. Zaznacz od pierwszego do ostatniego znaku.

```javascript
/**
 * ODBIERANIE ODPOWIEDZI Z ANKIETY → ARKUSZ GOOGLE
 * ================================================
 * Ten skrypt mieszka WEWNĄTRZ arkusza Google (Rozszerzenia → Apps Script)
 * i działa na koncie właściciela arkusza. Aplikacja nie ma żadnych haseł do
 * Google: wysyła tylko dane pod adres wdrożenia, a Google autoryzuje zapis
 * po swojej stronie.
 *
 * WDROŻENIE (raz, około 15 minut):
 *  1. Otwórz arkusz na koncie Fundacji CTN.
 *  2. Rozszerzenia → Apps Script. Skasuj to, co tam jest, i wklej ten plik.
 *  3. Zmień TOKEN poniżej na własny losowy ciąg (im dłuższy, tym lepiej).
 *  4. Wdróż → Nowe wdrożenie → typ: Aplikacja internetowa.
 *       Wykonaj jako: Ja
 *       Kto ma dostęp: Wszyscy
 *  5. Google pokaże ostrzeżenie o niezweryfikowanej aplikacji:
 *       Zaawansowane → Przejdź do (nazwa projektu). To normalne dla własnych skryptów.
 *  6. Skopiuj adres wdrożenia (kończy się na /exec) i przekaż go osobie,
 *     która podpina aplikację.
 *
 * AKTUALIZACJA SKRYPTU: po każdej zmianie kodu zrób Wdróż → Zarządzaj wdrożeniami
 * → edytuj → Wersja: Nowa. Bez tego adres serwuje starą wersję.
 */

/**
 * Hasło do endpointu. Musi być identyczne z VITE_ARKUSZ_TOKEN w aplikacji.
 *
 * UWAGA: ten plik leży w publicznym repozytorium, więc trzymamy tu wyłącznie
 * wartość zastępczą. Prawdziwe hasło wpisuje się w edytorze Apps Script i tam
 * zostaje — nigdy nie wraca do repozytorium.
 */
const TOKEN = 'WPISZ-WLASNE-HASLO'

/**
 * ID arkusza, do którego zapisujemy.
 *
 * ZOSTAW PUSTE, jeśli skrypt powstał z wnętrza arkusza
 * (Rozszerzenia → Apps Script) — wtedy sam znajdzie swój arkusz.
 *
 * WYPEŁNIJ, jeśli skrypt to osobny projekt założony na script.google.com.
 * ID znajdziesz w adresie arkusza, między „/d/” a „/edit”:
 *
 *   docs.google.com/spreadsheets/d/1AbC...XyZ/edit
 *                                  └────┬────┘
 *                                    to wklej
 */
const ID_ARKUSZA = ''

/** Nazwa zakładki z odpowiedziami. Zostanie utworzona, jeśli jej nie ma. */
const ARKUSZ = 'Odpowiedzi'

/** Kolumny stałe, zawsze na początku, w tej kolejności. */
const KOLUMNY_STALE = [
  'Data wysłania',
  'Identyfikator sesji',
  'Kto wypełnił',
  'Wersja ankiety',
]

/**
 * Punkt wejścia: aplikacja wysyła tu POST z JSON-em.
 *
 * Oczekiwany kształt danych:
 * {
 *   token: "...",
 *   sesja: "uuid urządzenia",
 *   kto: "Anna Kowalska" | "anonimowo",
 *   wersja: "2026-08-13",
 *   pulapka: "",                       // ukryte pole, boty je wypełniają
 *   odpowiedzi: { "id-pytania": "wartość", ... },
 *   etykiety:   { "id-pytania": "Treść pytania", ... }
 * }
 */
function doPost(e) {
  try {
    // Uruchomienie z edytora przyciskiem „Uruchom” nie przekazuje żadnych
    // danych, więc `e` jest puste. Bez tego komunikatu Google pokazuje tylko
    // „Cannot read properties of undefined”, co niczego nie wyjaśnia.
    if (!e || !e.postData) {
      throw new Error(
        'Funkcja doPost odbiera dane z aplikacji i nie można jej uruchomić ' +
          'ręcznie. Aby sprawdzić zapis do arkusza, wybierz z listy funkcję ' +
          '„testZapisu” i kliknij Uruchom.',
      )
    }

    const dane = JSON.parse(e.postData.contents)

    if (dane.token !== TOKEN) {
      return odpowiedz({ ok: false, blad: 'zly-token' })
    }

    // Pole pułapka: niewidoczne dla człowieka, automaty wypełniają wszystko.
    if (dane.pulapka) {
      // Udajemy sukces, żeby bot nie próbował dalej.
      return odpowiedz({ ok: true })
    }

    // Blokada: zapisy ustawiają się w kolejce, więc dwie osoby wysyłające
    // w tej samej chwili nie trafią do tego samego wiersza.
    //
    // Czekamy 120 s, nie 30. Przy szczycie (mail do wszystkich naraz) kolejka
    // bywa długa, a odrzucenie oznacza CICHĄ UTRATĘ odpowiedzi: przeglądarka
    // wysyła w trybie bez odczytu odpowiedzi, więc aplikacja nie dowie się
    // o błędzie. Lepiej, żeby uczestnik poczekał, niż żeby stracił ankietę.
    // Limit czasu wykonania skryptu to 6 minut, więc 120 s mieści się z zapasem.
    const lock = LockService.getScriptLock()
    if (!lock.tryLock(120000)) {
      console.error('Nie udało się uzyskać blokady w 120 s — zapis pominięty.')
      return odpowiedz({ ok: false, blad: 'kolejka-przepelniona' })
    }
    try {
      zapisz(dane)
    } finally {
      lock.releaseLock()
    }

    // Oznaczanie wcześniejszych wysyłek tej samej osoby wymaga przeczytania
    // kolumny z identyfikatorami — to najdroższa operacja w całym zapisie.
    // Robimy ją PO zwolnieniu blokady, żeby nie blokować kolejnych osób.
    // Kolejność wierszy jest już ustalona, więc nic to nie psuje.
    try {
      oznaczPoprzednie(pobierzArkusz(), dane.sesja)
    } catch (err) {
      console.error('Oznaczanie poprzednich nie powiodło się: ' + err)
    }

    return odpowiedz({ ok: true })
  } catch (err) {
    // Log widoczny w Apps Script → Wykonania. Ułatwia diagnozę bez zgadywania.
    console.error('Błąd zapisu: ' + err)
    return odpowiedz({ ok: false, blad: String(err) })
  }
}

/**
 * Zapis pojedynczej ankiety jako jeden wiersz.
 *
 * SZYBKOŚĆ MA ZNACZENIE. Każde wywołanie Sheets API to około 0,2–0,5 s, a
 * wszystkie zapisy stoją w jednej kolejce (blokada w `doPost`). Gdy jeden
 * zapis trwa 2 s, to przy 50 osobach klikających naraz ostatnie czekają ponad
 * 30 s i wypadają z blokady — ich odpowiedzi przepadają. Test obciążenia
 * pokazał dokładnie to: 22 zapisy na 50 prób.
 *
 * Dlatego w sekcji krytycznej robimy MINIMUM: odczyt nagłówków (z pamięci
 * podręcznej) i dopisanie wiersza. Wszystko inne dzieje się poza blokadą.
 */
function zapisz(dane) {
  const arkusz = pobierzArkusz()
  let naglowki = naglowkiZCache(arkusz)

  // Nowe pytania (np. dodane w trakcie zbierania) dostają kolumnę na końcu.
  // Starsze wiersze mają w niej pusto i to jest zgodne z prawdą: tamte osoby
  // po prostu nie zobaczyły tego pytania.
  const brakujace = Object.keys(dane.odpowiedzi || {}).filter(
    (id) => naglowki.indexOf(id) === -1,
  )
  if (brakujace.length > 0) {
    dodajKolumny(arkusz, naglowki, brakujace, dane.etykiety || {})
    naglowki = naglowki.concat(brakujace)
    zapiszNaglowkiWCache(naglowki)
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

/** Klucz pamięci podręcznej nagłówków. */
const CACHE_NAGLOWKI = 'naglowki-v1'

/**
 * Nagłówki z pamięci podręcznej skryptu. Pierwszy zapis po starcie czyta je
 * z arkusza, kolejne przez 6 godzin biorą gotową listę — to oszczędza jedno
 * wywołanie Sheets API na każdą wysyłkę.
 *
 * Pamięć jest wspólna dla wszystkich wykonań skryptu, więc dopisanie kolumny
 * przez jedno wykonanie jest od razu widoczne dla pozostałych.
 */
function naglowkiZCache(arkusz) {
  try {
    const cache = CacheService.getScriptCache()
    const zapisane = cache.get(CACHE_NAGLOWKI)
    if (zapisane) {
      const lista = JSON.parse(zapisane)
      if (lista && lista.length >= KOLUMNY_STALE.length) return lista
    }
    const swieze = pobierzNaglowki(arkusz)
    cache.put(CACHE_NAGLOWKI, JSON.stringify(swieze), 21600)
    return swieze
  } catch (err) {
    // Awaria pamięci podręcznej nie może wywrócić zapisu.
    return pobierzNaglowki(arkusz)
  }
}

function zapiszNaglowkiWCache(naglowki) {
  try {
    CacheService.getScriptCache().put(
      CACHE_NAGLOWKI,
      JSON.stringify(naglowki),
      21600,
    )
  } catch (err) {
    /* trudno, następnym razem odczytamy z arkusza */
  }
}

/**
 * Zwraca zakładkę z odpowiedziami. TWORZY JĄ, jeśli nie istnieje, razem z
 * wierszem nagłówków. Dzięki temu wdrożenie działa nawet na pustym, świeżo
 * założonym arkuszu i nikt nie musi niczego przygotowywać ręcznie.
 */
function pobierzArkusz() {
  const plik = pobierzPlik()
  let arkusz = plik.getSheetByName(ARKUSZ)

  if (!arkusz) {
    arkusz = plik.insertSheet(ARKUSZ)
  }

  if (arkusz.getLastRow() === 0) {
    // Wiersz 1: identyfikatory (techniczne, ukrywany).
    arkusz.appendRow(KOLUMNY_STALE)
    // Wiersz 2: czytelne nagłówki dla człowieka.
    arkusz.appendRow(KOLUMNY_STALE)
    arkusz.getRange(1, 1, 1, KOLUMNY_STALE.length).setFontColor('#999999')
    arkusz.getRange(2, 1, 1, KOLUMNY_STALE.length).setFontWeight('bold')
    arkusz.setFrozenRows(2)
    arkusz.hideRows(1)
  }

  return arkusz
}

/**
 * Znajduje plik arkusza. Obsługuje oba sposoby założenia skryptu:
 * przypięty do arkusza oraz samodzielny projekt z wpisanym ID_ARKUSZA.
 */
function pobierzPlik() {
  if (ID_ARKUSZA) {
    return SpreadsheetApp.openById(ID_ARKUSZA)
  }
  const aktywny = SpreadsheetApp.getActiveSpreadsheet()
  if (!aktywny) {
    throw new Error(
      'Ten skrypt nie jest przypięty do żadnego arkusza. ' +
        'Wpisz identyfikator arkusza w stałej ID_ARKUSZA na górze pliku ' +
        '(znajdziesz go w adresie arkusza, między /d/ a /edit).',
    )
  }
  return aktywny
}

/** Wiersz 1 to identyfikatory pytań i po nich układamy dane. */
function pobierzNaglowki(arkusz) {
  const szerokosc = Math.max(arkusz.getLastColumn(), KOLUMNY_STALE.length)
  return arkusz
    .getRange(1, 1, 1, szerokosc)
    .getValues()[0]
    .map((v) => String(v))
}

/** Dokłada kolumny dla pytań, których arkusz jeszcze nie zna. */
function dodajKolumny(arkusz, naglowki, noweId, etykiety) {
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
 * Gdy ktoś wypełnia drugi raz, poprzedni wiersz z tej samej sesji dostaje
 * dopisek w kolumnie „Kto wypełnił”. Nic nie kasujemy: widać, że osoba
 * zmieniła zdanie, a najnowsza odpowiedź jest zawsze najniżej.
 */
function oznaczPoprzednie(arkusz, sesja) {
  if (!sesja) return
  const kolSesja = 2 // druga kolumna wg KOLUMNY_STALE
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

/** Odpowiedź w JSON. */
function odpowiedz(obiekt) {
  return ContentService.createTextOutput(JSON.stringify(obiekt)).setMimeType(
    ContentService.MimeType.JSON,
  )
}

/**
 * TEST BEZ APLIKACJI. Uruchom tę funkcję z edytora (przycisk „Uruchom”),
 * żeby sprawdzić, czy arkusz i zakładka powstają poprawnie. Dopisze jeden
 * przykładowy wiersz, który potem możesz skasować ręcznie.
 */
function testZapisu() {
  zapisz({
    sesja: 'test-' + new Date().getTime(),
    kto: 'TEST (do skasowania)',
    wersja: 'test',
    odpowiedzi: { 'nps': 9, 'obecnosc-dni': 'Piątek; Sobota' },
    etykiety: {
      'nps': 'Na ile prawdopodobne, że polecisz Masterclass znajomemu?',
      'obecnosc-dni': 'W których dniach uczestniczyłeś(-aś)?',
    },
  })
  console.log('Zapisano wiersz testowy. Sprawdź zakładkę „' + ARKUSZ + '”.')
}
```
