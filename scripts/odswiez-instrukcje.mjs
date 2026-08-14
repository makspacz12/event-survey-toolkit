/**
 * ODŚWIEŻENIE KODU W INSTRUKCJI DLA FUNDACJI
 *
 * `INSTRUKCJA-DLA-CTN.md` zawiera pełną kopię `apps-script/Kod.gs` — po to,
 * żeby osoba nietechniczna miała wszystko w jednym pliku i nie musiała
 * niczego szukać. Kopia ma jednak wadę: przy każdej poprawce skryptu cicho
 * się starzeje, a fundacja wkleja wtedy nieaktualną wersję.
 *
 * Ten skrypt przepisuje ten jeden blok kodu na nowo z pliku źródłowego.
 * Uruchamiaj po KAŻDEJ zmianie w Kod.gs:  npm run odswiez-instrukcje
 *
 * Sprawdzenie bez zapisu (przydatne przed wysłaniem dokumentu):
 *   npm run odswiez-instrukcje -- --sprawdz
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const KATALOG = join(dirname(fileURLToPath(import.meta.url)), '..')
const PLIK_KODU = join(KATALOG, 'apps-script', 'Kod.gs')
const PLIK_DOKUMENTU = join(KATALOG, 'INSTRUKCJA-DLA-CTN.md')

const tylkoSprawdz = process.argv.includes('--sprawdz')

const kod = readFileSync(PLIK_KODU, 'utf8').trimEnd()
const dokument = readFileSync(PLIK_DOKUMENTU, 'utf8')

// Blok do podmiany: ostatni blok ```javascript w dokumencie, czyli ten pod
// nagłówkiem „Kod do wklejenia”. Wcześniejsze bloki to krótkie przykłady.
const NAGLOWEK = '## Kod do wklejenia'
const poczatekSekcji = dokument.indexOf(NAGLOWEK)
if (poczatekSekcji === -1) {
  console.error(`BŁĄD: nie znalazłem nagłówka „${NAGLOWEK}” w instrukcji.`)
  process.exit(1)
}

const otwarcie = dokument.indexOf('```javascript', poczatekSekcji)
const poczatekTresci = dokument.indexOf('\n', otwarcie) + 1
const zamkniecie = dokument.indexOf('\n```', poczatekTresci)

if (otwarcie === -1 || zamkniecie === -1) {
  console.error('BŁĄD: nie znalazłem bloku kodu pod tym nagłówkiem.')
  process.exit(1)
}

const wDokumencie = dokument.slice(poczatekTresci, zamkniecie).trimEnd()

if (wDokumencie === kod) {
  console.log('Instrukcja jest aktualna — kod w dokumencie zgadza się z Kod.gs.')
  process.exit(0)
}

const roznicaLinii = kod.split('\n').length - wDokumencie.split('\n').length

if (tylkoSprawdz) {
  console.error(
    'UWAGA: kod w instrukcji RÓŻNI SIĘ od apps-script/Kod.gs ' +
      `(różnica ${roznicaLinii >= 0 ? '+' : ''}${roznicaLinii} linii).`,
  )
  console.error('Uruchom: npm run odswiez-instrukcje')
  process.exit(1)
}

writeFileSync(
  PLIK_DOKUMENTU,
  dokument.slice(0, poczatekTresci) + kod + dokument.slice(zamkniecie),
  'utf8',
)

console.log(
  `Zaktualizowano kod w instrukcji (${wDokumencie.split('\n').length} → ` +
    `${kod.split('\n').length} linii).`,
)
