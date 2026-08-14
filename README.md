# Ankieta uczestnika — Masterclass Leadership 2026

Aplikacja do zbierania opinii po wydarzeniu (16–17 października 2026, Opactwo
w Tyńcu). Uczestnik skanuje kod QR, wypełnia ankietę na telefonie, odpowiedzi
trafiają do arkusza Google organizatora.

## Uruchomienie

```bash
npm install
npm run dev        # http://localhost:5190
```

## Do czego służą pozostałe komendy

| Komenda | Co robi |
|---|---|
| `npm run build` | wersja produkcyjna do wgrania na serwer (katalog `dist/`) |
| `npm run pytania:do-excela` | zapisuje obecne pytania do `ankieta.xlsx` |
| `npm run pytania:z-excela` | wczytuje pytania z `ankieta.xlsx` z powrotem do aplikacji |
| `npm run przyklad-arkusza` | generuje przykładowy arkusz wyników do pokazania organizatorom |
| `npm run test-skryptu` | sprawdza logikę skryptu Apps Script bez Google |
| `npm run test-polaczenia` | wysyła testowy wiersz do prawdziwego arkusza |

## Jak zmienić treść ankiety

Źródłem prawdy jest **`src/data/ankieta.json`**. Można go edytować wprost albo
przez Excela, gdy pytania układa osoba nietechniczna:

```bash
npm run pytania:do-excela     # wyślij ankieta.xlsx osobie układającej pytania
# (edycja w Excelu, plik wraca)
npm run pytania:z-excela      # wczytanie zmian, z walidacją i kopią zapasową
```

**Żelazna zasada: `id` pytania to jego PESEL.** Treść wolno zmieniać zawsze,
`id` nigdy — po nim wiążą się zapisane odpowiedzi. Nowe pytanie dostaje własne,
nowe `id`.

Typy pytań: `skala`, `tak_nie`, `jeden_wybor`, `wiele_wyborow`, `tekst`.
Dodatkowe pola: `wymagane`, `nieobecnosc` (przycisk „nie było mnie”),
`komentarz` (opcjonalne pole pod pytaniem), `zdjecie`, `pokaz_jesli` (sekcje
warunkowe).

## Zdjęcia prelegentów

Kwadratowe pliki w `public/prelegenci/`, w JSON ścieżka `/prelegenci/nazwa.jpg`.
Minimum 400×400 px, twarz w środku kadru (wyświetlane jako okrągły awatar).

> Po dodaniu nowego pliku **zrestartuj serwer dev** — katalog `public/` jest
> celowo wyłączony z obserwowania zmian (na Windows psuł proces Vite).

## Wysyłka odpowiedzi

Odpowiedzi zapisują się na bieżąco w pamięci przeglądarki, a po zakończeniu
ankiety lecą do arkusza Google. Bez internetu trafiają do kolejki i wysyłają się
same, gdy połączenie wróci.

Konfiguracja: `.env.local` (dwie wartości — adres wdrożenia skryptu i hasło).
Instrukcja wdrożenia po stronie Google: **`apps-script/JAK-WDROZYC.md`**.

Aplikacja nie ma żadnych poświadczeń Google. Skrypt Apps Script działa na koncie
właściciela arkusza i to on ma prawo zapisu.

## Struktura

```
src/
  data/ankieta.json          ← TREŚĆ ANKIETY (tu się edytuje pytania)
  data/typy.ts               ← jakie pola może mieć pytanie i sekcja
  components/
    LandingPage.tsx          ← ekran startowy z robotem
    PhoneFrame.tsx           ← ramka telefonu + ozdobne boki na desktopie
    robot/RobotStage.tsx     ← robot 3D, celowo odizolowany (do podmiany)
    survey/SurveyFlow.tsx    ← przepływ ankiety
    survey/AnswerWidgets.tsx ← kontrolki odpowiedzi (skala, chipy, tekst)
    survey/SectionNav.tsx    ← pasek segmentów u góry
  lib/
    storage.ts               ← zapis stanu w przeglądarce
    wyslij.ts                ← wysyłka do arkusza + kolejka offline
    eksport.ts               ← pobranie własnych odpowiedzi jako Excel
apps-script/                 ← kod i instrukcja dla strony Google
scripts/                     ← narzędzia uruchamiane przez npm run
DESIGN.md                    ← zasady wyglądu (kolory, kroje, zakazy)
PLAN-ZBIERANIE-ODPOWIEDZI.md ← dlaczego arkusz Google, a nie baza danych
```

## Znane ograniczenia

- **Waga sceny 3D.** Robot Spline to około 1,3 MB po kompresji, czyli większość
  wagi aplikacji. Ładuje się w tle po pokazaniu strony, więc nie blokuje
  wyświetlenia, ale przy słabym zasięgu pojawia się z opóźnieniem. Do rozważenia
  przed publikacją: podmiana na lekką animację albo zdjęcie.
- **Dane w przeglądarce znikają**, gdy użytkownik wyczyści dane witryn. Safari
  na iPhonie robi to sam po 7 dniach bez wizyty. Dlatego wysyłka do arkusza
  odpala się od razu po zakończeniu ankiety.
- **Bez zasięgu i bez powrotu na stronę** odpowiedzi zostaną na urządzeniu.
  Kolejka ponawia wysyłkę przy następnym otwarciu aplikacji.

## Wdrożenie

Instrukcja dla Vercela wraz z listą zmiennych środowiskowych: **`WDROZENIE.md`**.

W skrócie: framework Vite, build `npm run build`, katalog `dist`, dwie zmienne
(`VITE_ARKUSZ_URL`, `VITE_ARKUSZ_TOKEN`).

## Stan

Gotowe: aplikacja, treść ankiety, zdjęcia, eksport i import pytań przez Excela,
skrypt do arkusza (29 testów lokalnych), wysyłka odpowiedzi sprawdzona na żywo
(25 scenariuszy przez wszystkie rozgałęzienia ankiety).

Do zrobienia: wdrożenie na hosting, własna domena, finalna lista pytań po
spotkaniu z organizatorami, test na kilku osobach, kod QR.

## Bezpieczeństwo

W repozytorium nie ma i nie może być haseł. `Kod.gs` zawiera wartości zastępcze
(`WPISZ-WLASNE-HASLO`, `WPISZ-ID-ARKUSZA`) — prawdziwe wpisuje się w edytorze
Apps Script. Konfiguracja lokalna siedzi w `.env.local`, którego Git nie śledzi.
