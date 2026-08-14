# Design System: Ankieta Masterclass Leadership 2026

Jedyne źródło prawdy dla warstwy wizualnej aplikacji. Zmieniasz wygląd — zaczynasz tutaj.

## 1. Atmosfera

Dwa światy w jednej aplikacji, połączone złotem:

**Landing (ciemny)** — granatowa czerń Opactwa nocą. Cisza, dystans, jeden punkt uwagi: robot. Gęstość 2 (galeryjnie przestronnie), ruch 6 (płynny), wariancja 5.

**Ankieta (jasna)** — kremowy papier dokumentu, na którym ktoś zapisuje wrażenia. Klinicznie czytelna, ale ciepła — jak dobrze wydany program konferencji. Gęstość 4, ruch 5, wariancja 3 (formularz musi być przewidywalny, nie artystyczny).

Wspólny mianownik: **złoto jako jedyny akcent** i rytm oparty na cienkich liniach zamiast ciężkich ramek.

## 2. Paleta

**Ciemny (landing)**
- **Granatowa Czerń** `#070A12` — tło bazowe (nigdy `#000000`)
- **Mgła Platyny** `#C6D6E0` — spotlight, chłodne rozświetlenie
- **Biel Tytułu** `#F4F7FA` → `#A9BBC9` — gradient pionowy w nagłówku

**Jasny (ankieta)**
- **Papier** `#FBF8F3` — tło bazowe
- **Pergamin** `#F1E9DB` — dolny biegun gradientu tła
- **Powierzchnia** `#FFFFFF` — wypełnienie kart pytań
- **Atrament** `#3B3121` — tekst główny
- **Atrament Zgaszony** `#6B5D42` — opisy, tekst pomocniczy
- **Szept Linii** `rgba(59,49,33,0.10)` — obramowania kart, linie strukturalne

**Akcent (jedyny, wspólny)**
- **Złoto** `#C9A14A` — CTA, stany aktywne, pasek postępu, focus (nasycenie 51% — poniżej limitu 80%)
- **Złoto Głębokie** `#9C7A2C` — liczby, wartości, hover
- **Złoto Etykiet** `#9C8345` — mikroetykiety wersalikowe

## 3. Typografia

- **Display:** `Instrument Serif` — nagłówki sekcji i pytań w ankiecie. Dystynktywny nowoczesny szeryf, daje charakter „drukowanego programu". Ciasny tracking, hierarchia przez wagę i kolor, nie przez rozmiar.
- **Interfejs:** `Geist` — tytuły landingu, przyciski, treść pytań. Neutralny, ale z charakterem.
- **Mono:** `Geist Mono` — liczby na skali, mikroetykiety, numery sekcji, chipy nawigacji. Wersaliki + tracking `0.18em–0.24em`.
- **Zakazane:** `Inter` (wszędobylski, zeruje charakter), generyczne szeryfy (`Georgia`, `Times`, `Garamond`), kroje systemowe jako główny wybór.
- Treść: interlinia rozluźniona, maks. ~60 znaków w wierszu.

## 4. Komponenty

- **Przyciski:** płaskie, bez poświaty neonowej. Reakcja dotykowa: `translate-y(1px)` + przygaszenie na `:active`. Primary = wypełnienie złotem, secondary = obrys w Szepcie Linii. Minimalny cel dotykowy **44 px**.
- **Karty pytań:** biała powierzchnia, obrys 1 px w Szepcie Linii, zaokrąglenie **6 px** (ledwie zmiękczony róg — nie „bąbel"), cień rozproszony i zabarwiony atramentem, nigdy czarny.
- **Chipy odpowiedzi:** obrys 1 px, zaokrąglenie 6 px, stan aktywny = wypełnienie złotem + biały tekst. Ze zdjęciem: okrągły awatar 40 px po lewej, tekst wyrównany do lewej.
- **Skala 1–10:** linijka pomiarowa — kreski podziałki, złote wypełnienie do wybranej wartości, kwadratowy uchwyt. Obsługa kliknięcia i przeciągnięcia.
- **Pola tekstowe:** etykieta nad polem, obrys 1 px, focus = obrys złoty + pierścień `rgba(201,161,74,0.15)`. Bez pływających etykiet.
- **Ładowanie:** szkieletowy shimmer w kształcie docelowego układu. **Zakaz kręcących się spinnerów.**
- **Ikony:** wyłącznie inline SVG (`currentColor`, `stroke-width: 1.5`). Zakaz emoji i znaków typograficznych w roli ikon (`✓`, `＋`).

## 5. Układ

- Aplikacja mobile-first, maks. szerokość treści **440 px**, wyśrodkowana. Na desktopie po bokach ozdobne panele (pionowe złote hairline'y + pionowy napis) — duży ekran nie może świecić pustką.
- Sekcje pełnej wysokości: `min-h-[100dvh]` — **nigdy `h-screen`** (skok adresu w iOS Safari).
- Przyciski nawigacji ankiety przyklejone do dołu ekranu — zawsze w zasięgu kciuka, bez szukania.
- Nadmiar treści przewija się w pionie; poziome przewijanie strony = błąd krytyczny.
- Elementy nie nachodzą na siebie — jedynym wyjątkiem jest scrim gradientowy nad robotem na landingu.
- Odstępy pionowe w rytmie 4 px; sekcje oddzielone `clamp()`.

## 6. Ruch

- **Fizyka sprężyny** jako domyślna: `stiffness: 120, damping: 20`. Zero liniowego easingu.
- **Kaskada:** pytania w sekcji wjeżdżają z opóźnieniem `60 ms × index` — nigdy wszystkie naraz.
- **Przejście landing → ankieta:** landing „składa się" (`scaleY → 0`, origin top), ankieta wjeżdża od dołu.
- Animujemy **wyłącznie** `transform` i `opacity`. Nigdy `width`, `height`, `top`, `left`.
- Scena 3D (Spline) odizolowana w `components/robot/` — lazy-loaded, nie blokuje pierwszego renderu.
- `prefers-reduced-motion` wyłącza kaskady i pętle.

## 7. Zakazane (AI tells)

- Emoji w interfejsie
- Font `Inter`; generyczne szeryfy
- Czysta czerń `#000000`
- Poświata neonowa, cienie kolorowe „glow"
- Animowany gradient na wielkich nagłówkach
- Kręcące się spinnery jako stan ładowania
- Więcej niż jeden kolor akcentu
- Trzy równe karty w rzędzie
- Wypełniacze typu „Przewiń w dół", strzałki zachęcające do scrollowania
- Puste stany będące samym napisem „Brak danych"
- Zaokrąglenia „bąbelkowe" (> 12 px) na kartach dokumentowych
