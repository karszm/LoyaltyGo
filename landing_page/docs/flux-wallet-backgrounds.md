# Tła AI dla kart LoyaltyGo w Apple Wallet

## Decyzja projektowa

Karta lojalnościowa powinna być wystawiana jako Apple Wallet `storeCard`. W tym typie pasa grafiką marki jest poziomy `strip.png`, a nie pełnoekranowe `background.png`. Załączona referencja pokazuje inny układ — pełną grafikę pasa biletowego — dlatego nie należy kopiować jej proporcji ani elementów interfejsu.

Wymiary eksportu dla `strip.png`:

| Plik | Wymiary |
| --- | ---: |
| `strip.png` | 375 × 144 px |
| `strip@2x.png` | 750 × 288 px |
| `strip@3x.png` | 1125 × 432 px |

FLUX.2 dostaje rozmiar 2000 × 768 px. Ma on dokładnie te same proporcje 125:48, mieści się w limicie modelu i daje dobry materiał źródłowy do trzech eksportów.

## Dane z kreatora

Do buildera promptu przekazujemy:

- rodzaj biznesu, np. `salon fryzjerski`;
- krótki opis biznesu — maksymalnie 180 znaków;
- główny, dodatkowy i opcjonalnie akcentowy kolor marki w formacie HEX;
- styl: ilustracja redakcyjna, fotografia premium albo minimalizm abstrakcyjny.

Nazwa firmy i logo nie trafiają do promptu. Model generuje wyłącznie tło, a prawdziwe logo i tekst są nakładane przez Wallet. Dzięki temu treść pozostaje czytelna, lokalizowalna i zgodna z brandingiem merchanta.

## Użycie

```ts
import { buildFluxWalletBackgroundRequest } from "../src/lib/flux-wallet-background-prompt";

const request = buildFluxWalletBackgroundRequest({
  businessType: "salon fryzjerski",
  businessDescription: "Nowoczesny salon specjalizujący się w koloryzacji i lekkich cięciach",
  primaryColor: "#203A43",
  secondaryColor: "#F2D7C7",
  accentColor: "#E98E73",
  style: "editorial-illustration",
});

await fetch("https://api.eu.bfl.ai/v1/flux-2-pro", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-key": process.env.BFL_API_KEY!,
  },
  body: JSON.stringify(request),
});
```

Stały endpoint `flux-2-pro` jest właściwy dla produkcji, w której liczy się powtarzalność zachowania modelu. Klucz API może działać tylko po stronie backendu. Europejski endpoint ogranicza przetwarzanie do regionu UE.

`prompt_upsampling` pozostaje wyłączony, ponieważ model nie powinien kreatywnie rozszerzać reguł bezpiecznej strefy ani zasad brandingu.

## Przykład — salon fryzjerski

Builder tworzy strukturalny prompt JSON o następującym sensie:

> Stwórz szeroką ilustrację dla paska karty lojalnościowej Apple Wallet. Pokaż eleganckie, płynące pasma zdrowych włosów, nożyczki fryzjerskie i grzebień jako nowoczesną martwą naturę. Użyj kolorów marki. Najważniejsze motywy umieść w zewnętrznych częściach, szczególnie po prawej. Środkowe 55% pozostaw spokojne, jednolite tonalnie i czytelne pod tekst Wallet. To ma być oryginalna grafika bez typografii, znaków i imitowania istniejących marek.

Do API należy wysłać pełny JSON zwracany przez `buildFluxWalletBackgroundRequest`, a nie skróconą wersję powyżej.

## Kontrola jakości po generacji

Przed pokazaniem wyniku merchantowi backend powinien:

1. pobrać wynik od razu — adres wyniku FLUX jest czasowy;
2. odrzucić obraz, jeśli OCR wykryje litery lub cyfry;
3. sprawdzić kontrast w centralnej bezpiecznej strefie dla wybranego koloru tekstu;
4. pokazać podgląd z prawdziwymi polami Wallet i kodem kreskowym;
5. pozwolić merchantowi zaakceptować obraz albo wygenerować wariant;
6. przeskalować zaakceptowany PNG do trzech docelowych rozmiarów bez zmiany proporcji;
7. zachować identyfikator modelu, seed i wersję promptu, aby wynik dało się odtworzyć i audytować.

Sam prompt ogranicza ryzyko, ale nie zastępuje OCR, kontroli kontrastu i moderacji obrazu.

## Źródła techniczne

- [FLUX.2 Prompting Guide](https://docs.bfl.ai/guides/prompting_guide_flux2)
- [FLUX.2 Text to Image](https://docs.bfl.ai/flux_2/flux2_text_to_image)
- [Apple — Creating a pass with Pass Designer](https://developer.apple.com/documentation/walletpasses/creating-a-pass-with-pass-designer)
- [Apple Human Interface Guidelines — Wallet](https://developer.apple.com/design/human-interface-guidelines/wallet)
