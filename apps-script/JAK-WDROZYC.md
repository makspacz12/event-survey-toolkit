# Jak podłączyć ankietę do arkusza Google

Instrukcja dla osoby, która **nie programuje**. Całość zajmuje około 15 minut i
sprowadza się do klikania. Potrzebne jest konto Google Fundacji CTN.

## Co powstanie

Aplikacja z ankietą będzie wysyłać odpowiedzi do arkusza Google. Każda wypełniona
ankieta to jeden nowy wiersz. Excel pobiera się z menu `Plik → Pobierz →
Microsoft Excel (.xlsx)`.

---

## Krok 1. Załóż arkusz

1. Wejdź na [sheets.new](https://sheets.new) **będąc zalogowanym na konto fundacji**
   (nie prywatne — tam trafią dane osobowe osób, które się podpiszą).
2. Nazwij plik, na przykład `Masterclass Leadership 2026 — odpowiedzi`.

Nie twórz żadnych zakładek ani nagłówków. Skrypt zrobi to sam przy pierwszej
odpowiedzi.

## Krok 2. Wklej skrypt

1. W arkuszu: `Rozszerzenia → Apps Script`.
2. Otworzy się edytor z plikiem `Kod.gs` i kilkoma linijkami przykładu.
   **Zaznacz wszystko i skasuj.**
3. Wklej całą zawartość pliku `apps-script/Kod.gs` z projektu aplikacji.
4. Na górze skryptu znajdź linijkę:

   ```javascript
   const TOKEN = 'zmien-mnie-na-losowy-ciag-znakow'
   ```

   Wpisz w miejsce tego tekstu własne hasło, na przykład
   `mcl2026-tyniec-9f3k2m8x`. Nie musisz go pamiętać, ale **zapisz je** — będzie
   potrzebne w kroku 5.
5. Zapisz (ikona dyskietki albo `Ctrl+S`).

## Krok 3. Sprawdź, czy działa (bez aplikacji)

1. W edytorze, na górnym pasku, wybierz z listy funkcję **`testZapisu`**.
2. Kliknij **Uruchom**.
3. Google poprosi o zgodę: `Sprawdź uprawnienia` → wybierz konto →
   pojawi się ekran „Aplikacja niezweryfikowana” → **Zaawansowane** →
   **Przejdź do (nazwa projektu)** → **Zezwól**.

   To normalne. Google tak oznacza każdy skrypt napisany samodzielnie, którego
   nie przesłano do weryfikacji. Skrypt ma dostęp wyłącznie do tego arkusza.
4. Wróć do arkusza. Powinna pojawić się zakładka **Odpowiedzi** z nagłówkami i
   jednym wierszem testowym. **Skasuj ten wiersz** — reszta zostaje.

Jeśli zakładka się pojawiła, najtrudniejsze masz za sobą.

## Krok 4. Opublikuj skrypt

1. W edytorze: **Wdróż → Nowe wdrożenie**.
2. Kliknij ikonę koła zębatego przy „Wybierz typ” i wybierz
   **Aplikacja internetowa**.
3. Ustaw:
   - **Opis:** `ankieta 2026`
   - **Wykonaj jako:** `Ja (twój@adres)`
   - **Kto ma dostęp:** `Wszyscy`

   „Wszyscy” brzmi groźnie, ale znaczy tylko tyle, że aplikacja może wysyłać
   dane bez logowania uczestnika. Nikt nie zobaczy zawartości arkusza — skrypt
   przyjmuje dane i nic nie zwraca.
4. **Wdróż**.
5. Skopiuj **adres aplikacji internetowej**. Kończy się na `/exec` i wygląda tak:

   ```
   https://script.google.com/macros/s/AKfycbx.../exec
   ```

## Krok 5. Przekaż dwie rzeczy

Wyślij osobie, która podpina aplikację:

1. **adres** z kroku 4 (ten kończący się na `/exec`),
2. **hasło TOKEN** z kroku 2.

To wszystko po Twojej stronie.

---

## Późniejsze zmiany w skrypcie

Po każdej edycji kodu trzeba opublikować nową wersję, inaczej adres serwuje
starą: **Wdróż → Zarządzaj wdrożeniami → ikona ołówka → Wersja: Nowa → Wdróż**.
Adres pozostaje ten sam.

## Gdzie szukać, gdy coś nie działa

W edytorze skryptu zakładka **Wykonania** pokazuje każdą próbę zapisu wraz z
błędem. Jeśli odpowiedzi nie przychodzą, najczęstsze przyczyny to:

| Objaw | Przyczyna |
|---|---|
| Wykonań brak | aplikacja ma zły adres albo nie wdrożono nowej wersji |
| Wykonanie z błędem `zly-token` | hasło w aplikacji różni się od tego w skrypcie |
| Wykonanie udane, ale wiersza brak | patrzysz na inną zakładkę niż `Odpowiedzi` |

## Bezpieczeństwo w skrócie

- Skrypt działa **na koncie właściciela arkusza**, więc aplikacja nie musi znać
  żadnych haseł Google.
- Endpoint przyjmuje dane i **nigdy nie zwraca zawartości arkusza**.
- Hasło TOKEN odcina przypadkowe wysyłki. Nawet gdyby ktoś je poznał, może
  najwyżej dopisać fałszywy wiersz — nie odczyta odpowiedzi ani ich nie skasuje.
- Arkusz ma historię wersji (`Plik → Historia wersji`), więc omyłkowe skasowanie
  danych da się cofnąć.
