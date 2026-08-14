# Wdrożenie aplikacji

Aplikacja to statyczna strona (HTML, JavaScript, obrazy). Nie potrzebuje
serwera z bazą danych — odpowiedzi przyjmuje skrypt po stronie Google.

## Zmienne środowiskowe

Dwie, obie wymagane. Bez nich aplikacja działa, ale nie wysyła odpowiedzi
(uczestnik nadal może pobrać własny plik Excel).

| Nazwa | Wartość | Skąd |
|---|---|---|
| `VITE_ARKUSZ_URL` | adres wdrożenia Apps Script, kończy się na `/exec` | Apps Script → Wdróż → Zarządzaj wdrożeniami |
| `VITE_ARKUSZ_TOKEN` | hasło ustawione w `Kod.gs` jako `TOKEN` | wpisane ręcznie przy wdrażaniu skryptu |

**Prefiks `VITE_` oznacza, że wartość jest wbudowana w kod strony i widoczna
dla każdego.** Tak ma być: to nie jest klucz do Google, tylko zamek do naszego
punktu odbioru. Ktoś, kto go pozna, może najwyżej dopisać fałszywy wiersz. Nie
odczyta cudzych odpowiedzi ani niczego nie skasuje, bo skrypt nigdy nie zwraca
zawartości arkusza.

Prawdziwych sekretów w tej aplikacji nie ma i nie powinno być.

## Vercel, krok po kroku

1. **Import projektu**
   Vercel → *Add New* → *Project* → wybierz repozytorium `survey_application`.

2. **Ustawienia budowania** — Vercel wykryje je sam z pliku `vercel.json`:
   - Framework: **Vite**
   - Build command: `npm run build`
   - Output directory: `dist`
   - Install command: `npm install`

3. **Zmienne środowiskowe** (najważniejszy krok)
   W *Environment Variables* dodaj obie pozycje z tabeli wyżej i **zaznacz
   wszystkie trzy środowiska**: Production, Preview, Development.

   > Jeśli dodasz je po pierwszym wdrożeniu, trzeba wymusić ponowne budowanie:
   > *Deployments → … → Redeploy*. Vite wczytuje te wartości w trakcie budowania,
   > więc samo zapisanie zmiennej niczego nie zmienia.

4. **Deploy.** Po chwili dostajesz adres `nazwa-projektu.vercel.app`.

5. **Sprawdź, czy wysyłka działa**: otwórz aplikację, wypełnij ankietę do końca
   i zobacz, czy na ekranie końcowym pojawia się „Wysłano do organizatora”,
   a w arkuszu nowy wiersz. Wiersz testowy potem skasuj.

## Własna domena

Rekomendacja: subdomena domeny wydarzenia, na przykład
`ankieta.masterclassleadership.org`. Adres wygląda wtedy wiarygodnie na kodzie QR
i nie trzeba niczego zmieniać w istniejącej stronie.

1. Vercel → projekt → *Settings* → *Domains* → dodaj subdomenę.
2. Vercel poda rekord **CNAME**. Administrator domeny (CTN ma DNS w Cloudflare)
   dodaje go u siebie — to jedna pozycja w panelu, kilka minut pracy.
3. Certyfikat HTTPS Vercel wystawia sam.

Alternatywa bez proszenia CTN o cokolwiek: zostać przy adresie `*.vercel.app`.
Działa tak samo, wygląda mniej oficjalnie.

## Uwaga o darmowym planie Vercela

Plan Hobby jest bezpłatny, ale jego regulamin wyklucza zastosowania komercyjne.
Ankieta fundacyjna zwykle się w to mieści, jednak jeśli ma to być rozwiązanie
oficjalnie firmowane przez CTN, rozważ **Cloudflare Pages**: również za darmo,
bez tego zastrzeżenia, a CTN i tak trzyma tam swój DNS. Konfiguracja jest
identyczna (build `npm run build`, katalog `dist`, te same dwie zmienne).

## Po wdrożeniu

- **Kod QR** generuj dopiero na adres docelowy. Zmiana adresu po wydrukowaniu
  materiałów oznacza nowy kod.
- **Zamroź treść pytań** w dniu publikacji kodu QR. Dokładanie pytań w trakcie
  zbierania odpowiedzi rozjeżdża kolumny w arkuszu (szczegóły w
  `PLAN-ZBIERANIE-ODPOWIEDZI.md`).
- **Wzmocnij hasło** `TOKEN`, jeśli nadal jest krótkie i przewidywalne. Zmiana
  w dwóch miejscach: `Kod.gs` (i ponowne wdrożenie skryptu) oraz zmienna
  środowiskowa w panelu hostingu.
