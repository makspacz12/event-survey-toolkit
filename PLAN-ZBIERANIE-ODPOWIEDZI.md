# Plan: jak zbierać odpowiedzi od 300 osób

Stan na dziś: aplikacja działa, ale odpowiedzi zostają **na telefonie wypełniającego**
(localStorage). Nie ma ich gdzie wysłać. Ten dokument opisuje, jak to domknąć.

## Warunki brzegowe

1. **300 osób**, ankieta wypełniana po wydarzeniu, przez kilka tygodni.
2. **Odbiorcy wyników nie są techniczni.** Muszą wejść w jedno miejsce, które znają,
   i zobaczyć tabelę. Bez logowania do paneli, bez SQL, bez eksportów z konsoli.
3. **Wynik ma trafić do Excela.**
4. Docelowo aplikację przejmuje programista CTN, więc rozwiązanie ma być zrozumiałe
   dla kogoś, kto zobaczy je pierwszy raz.

## Rekomendacja: Google Apps Script → Arkusz Google

```
telefon uczestnika  ──POST(JSON)──►  Apps Script (Web App)  ──►  Arkusz Google
       │                                                              │
  localStorage                                             Mateusz patrzy na żywo
  (kopia lokalna)                                    Plik → Pobierz → Excel (.xlsx)
```

Arkusz leży **na koncie Google Fundacji CTN**. Mateusz otwiera go zakładką w
przeglądarce i widzi spływające odpowiedzi. Excel to jedno kliknięcie w menu
`Plik → Pobierz → Microsoft Excel`. Nie ma nowego systemu do nauczenia.

### Dlaczego to, a nie Supabase

| | Apps Script + Arkusz | Supabase |
|---|---|---|
| Co widzi Mateusz | arkusz Google, który zna | panel Supabase albo strona, którą trzeba zbudować |
| Droga do Excela | menu `Plik → Pobierz` | eksport CSV z panelu technicznego |
| Nowe konta | żadne (fundacja ma Google) | konto Supabase + zarządzanie dostępem |
| Koszt | 0 zł | 0 zł na darmowym planie |
| **Ryzyko przestoju** | brak | **projekt jest usypiany po tygodniu bezczynności** |
| Limity a nasze potrzeby | 20 000 operacji/dobę wobec ~300 zapisów | 500 MB bazy wobec ~2 MB danych |
| Kto to utrzyma za rok | każdy, kto umie Arkusze | programista |

Usypianie darmowego Supabase to realny problem właśnie w naszym scenariuszu:
event się kończy, ruch zamiera, projekt zasypia, a spóźniona ankieta nie zapisuje
się. Da się to obejść (cron budzący bazę), ale to kolejny element, który może
paść, i nikt w fundacji nie zauważy, że przestał działać.

**Supabase ma sens**, jeśli programista CTN powie, że chce bazę pod przyszłe
edycje, panel wyników i historię między latami. Wtedy jest to świadomy wybór na
lata, nie najprostsza droga do celu w tym roku. Patrz „Wariant B".

### Odrzucone

- **Formularze Google** — najprostsze, ale wyrzucamy do kosza całą aplikację
  (zdjęcia prelegentów, skale, rozgałęzienia, robot). Odpada.
- **Formspree, Tally, Basin** — darmowe progi są poniżej 300 zgłoszeń miesięcznie.
- **Firebase** — to samo co Supabase, a eksport do Excela jeszcze mniej wygodny.
- **Własne API na hostingu CTN** — ich serwer to PHP; ktoś musiałby napisać i
  utrzymać endpoint. Najwięcej pracy, najmniej korzyści.

## Jak wygląda arkusz

Jeden **wiersz = jedna wypełniona ankieta**, jedna **kolumna = jedno pytanie**.
To odwrotnie niż w pliku, który dziś pobiera uczestnik, i tak jest właściwie:
dopiero taki układ pozwala liczyć średnie, sortować i filtrować.

| Data | Kto | Dni | Ścieżka 16:00 | Debata otwierająca | … | NPS | Co poprawić |
|---|---|---|---|---|---|---|---|
| 20.10 18:42 | anonimowo | Piątek; Sobota | Finał | 9 | … | 10 | więcej czasu na… |
| 20.10 19:05 | Anna Kowalska | Sobota | III debata | nie było mnie | … | 8 | … |

Druga zakładka **Podsumowanie** liczy się sama formułami: średnia ocena każdego
bloku, liczba odpowiedzi, rozkład NPS. Mateusz dostaje gotowe liczby do raportu
dla sponsorów, bez liczenia czegokolwiek ręcznie.

## Podział pracy

### Mateusz (albo Ty na jego koncie), około 15 minut, same kliknięcia

1. Nowy arkusz na Dysku Google **fundacji** (nie na koncie prywatnym).
2. `Rozszerzenia → Apps Script`.
3. Wklej kod, który przygotuję (jeden plik, ~40 linii).
4. `Wdróż → Nowe wdrożenie → Aplikacja internetowa`, dostęp: *Wszyscy*.
5. Przy pierwszym wdrożeniu Google pokaże ostrzeżenie o niezweryfikowanej
   aplikacji: `Zaawansowane → Przejdź do…`. To normalne dla własnych skryptów.
6. Skopiuj wygenerowany adres i wyślij mi.

### Ja, około 2–3 godzin

- Wysyłka odpowiedzi z aplikacji pod ten adres.
- **Kolejka offline**: brak zasięgu nie kasuje odpowiedzi, aplikacja ponawia
  wysyłkę, a użytkownik widzi stan („wysłano” / „wyślij ponownie”).
- **Identyfikator sesji** (UUID w localStorage), żeby jedna osoba wypełniająca
  dwa razy nie liczyła się podwójnie.
- **Ochrona przed spamem**: tajny token w adresie i ukryte pole pułapka.
- Zakładka `Podsumowanie` z formułami.
- Test: 20 wysyłek pod rząd, wysyłka przy wyłączonym internecie, dwa telefony naraz.

### Roman (tester CTN)

Wypełnia ankietę na swoim telefonie od początku do końca i sprawdza, czy wiersz
pojawia się w arkuszu. Test na 5 osobach przed publikacją QR-kodu.

## Co się nie zgubi

| Zagrożenie | Zabezpieczenie |
|---|---|
| Brak zasięgu przy wysyłce | kolejka w pamięci telefonu, automatyczne ponowienie |
| Ktoś zamknie kartę w połowie | odpowiedzi już są w localStorage, wraca do tego samego miejsca |
| Podwójne wypełnienie | identyfikator sesji w osobnej kolumnie |
| Ktoś zaspamuje formularz | token w adresie, pole pułapka, arkusz i tak widzi wszystko |
| Awaria po stronie Google | aplikacja widzi odmowę zapisu, odkłada odpowiedź do kolejki i ponawia sama |
| Zgubiony arkusz | Dysk Google trzyma historię wersji |

## Czy odpowiedzi mogą się nadpisać?

Cztery scenariusze, bo „nadpisanie” znaczy tu różne rzeczy.

### 1. Dwie osoby wysyłają w tej samej chwili

Zapis to `appendRow()`, czyli „dopisz na końcu”, a nie „wpisz do wiersza nr X”.
Przy naprawdę równoczesnych wywołaniach dwa wykonania skryptu mogą jednak ustalić
ten sam „ostatni wiersz”. Dlatego zapis obejmujemy blokadą:

```javascript
const lock = LockService.getScriptLock();
lock.waitLock(30000);        // kolejka, maks 30 s oczekiwania
arkusz.appendRow(dane);
lock.releaseLock();
```

Jeden zapis trwa ułamek sekundy. Nawet gdyby całe 300 osób kliknęło w tej samej
minucie, kolejka rozejdzie się w około dwie minuty i nikt tego nie zauważy.

### 2. Ta sama osoba wypełnia drugi raz

To decyzja projektowa, nie awaria. **Dopisujemy nowy wiersz**, a poprzedni
oznaczamy jako nieaktualny (po identyfikatorze sesji). Nadpisywanie byłoby
czystsze, ale skasowanej odpowiedzi nie da się odzyskać, a kilka duplikatów przy
300 ankietach nie przeszkadza.

### 3. Nowa wersja aplikacji

Nie ma wpływu na dane. Odpowiedzi mieszkają w arkuszu, aplikacja tylko je wysyła.

### 4. Zmiana pytań w trakcie zbierania (to jest realne ryzyko)

Dorzucenie pytania w połowie zbierania rozjeżdża kolumny względem wcześniejszych
wierszy. Zabezpieczenie: wysyłamy odpowiedzi **z identyfikatorem pytania**
(`org-jedzenie`), a nie z numerem kolumny. Skrypt dokłada nową kolumnę na końcu,
gdy zobaczy nieznane `id`; starsze wiersze mają w niej pusto, co jest zgodne z
prawdą, bo te osoby tego pytania nie dostały.

Zasada organizacyjna mimo wszystko: **treść pytań zamrażamy w dniu publikacji
QR-kodu.** Literówki poprawiamy, nowych pytań nie dokładamy.

## RODO

Imię i nazwisko jest **dobrowolne**, ale gdy ktoś je poda, to dane osobowe.
Dlatego:

- arkusz na koncie **fundacji**, nie na prywatnym,
- dostęp tylko dla osób z zespołu, które faktycznie analizują wyniki,
- pod polem na dane jedno zdanie, kto je zobaczy,
- CTN ma już klauzulę RODO w regulaminie konkursu, więc wystarczy się do niej odwołać.

## Wariant B: Supabase

Jeśli programista CTN wybierze bazę:

1. Projekt na koncie fundacji, schemat mamy gotowy z zeszłorocznego prototypu.
2. Zapis przez klucz publiczny z regułami RLS (zapis tak, odczyt cudzych nie).
3. Do tego i tak trzeba dołożyć **stronę `/wyniki` z hasłem i przyciskiem
   pobierania Excela**, bo inaczej Mateusz nie wyciągnie danych sam.
4. Zadanie budzące projekt, żeby nie zasnął między edycjami.

To jakieś 1–2 dni pracy więcej. W zamian: dane w prawdziwej bazie, historia
między edycjami, gotowość na przyszłe rozbudowy.

**Można też jedno i drugie**: zapisywać do obu miejsc równolegle. Baza jest
źródłem prawdy, a arkusz kopią roboczą dla ludzi. Kosztuje kilkanaście linii
kodu więcej i eliminuje spór „baza czy arkusz”.

## Kolejność działań

1. Decyzja: wariant A (arkusz), B (baza) czy oba.
2. Ja przygotowuję kod Apps Script i instrukcję ze zrzutami ekranu.
3. Mateusz wdraża arkusz i przysyła adres.
4. Ja podpinam wysyłkę i testuję.
5. Roman testuje na kilku osobach.
6. Generujemy QR-kod na adres aplikacji i dopiero wtedy rozsyłamy.

Do zamknięcia zostaje jeszcze **gdzie stanie sama aplikacja** — rekomendacja z
wcześniejszych ustaleń to subdomena `ankieta.masterclassleadership.org` na
Cloudflare Pages. To niezależne od wyboru miejsca na odpowiedzi.
