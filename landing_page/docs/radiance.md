# Wstęga 3D w hero

`src/components/RadianceBackground.astro` przyjmuje wszystkie parametry jako props.
Autorska geometria z zawiniętą krawędzią i animowaną deformacją jest renderowana
w WebGL bez dodatkowych bibliotek. Nowy preset jest inspirowany wstęgą Stripe.
Zachowano nazwy wcześniejszych props; ich znaczenie dopasowano do powierzchni 3D.
Wartości domyślne:

```astro
<RadianceBackground
  baseColorA="#B8DEFF"
  baseColorB="#8674F5"
  blobColor="#FF884A"
  blobAccent="#F58CD8"
  highlightColor="#FFD078"
  colorBlend={52}
  swirlDetail={1}
  blobDeformation={0.7}
  waveStrength={0.15}
  waveFrequency={1.5}
  waveAngle={182}
  blurIntensity={90}
  ribbonWidth={1.35}
  ribbonTwist={1}
  positionX={0}
  positionY={0}
  animationSpeed={0.7}
  highlightStrength={0.65}
  grainStrength={0.025}
/>
```

Wybrane props można ustawić przy wywołaniu komponentu w `src/pages/index.astro`.
Pominięte parametry korzystają z `radianceDefaults` w `src/lib/radiance.ts`.

| Parametr | Zakres | Działanie |
| --- | --- | --- |
| Pięć kolorów | HEX, 6 cyfr, z `#` lub bez | Kolejne kolory na powierzchni wstęgi |
| `colorBlend` | 0–100 | Przesunięcie przejść palety na powierzchni |
| `swirlDetail` | 0–5 | Gęstość drobnych smug |
| `blobDeformation` | 0–1 | Siła przestrzennej deformacji powierzchni |
| `waveStrength` | 0–1 | Amplituda dodatkowego falowania |
| `waveFrequency` | 0–10 | Częstotliwość przestrzenna falowania |
| `waveAngle` | 0–360° | Obrót całej wstęgi; 180° to orientacja bazowa |
| `blurIntensity` | 0–100 | Miękkość brzegu i wygładzenie smug |
| `ribbonWidth` | 0,4–2,5 | Szerokość powierzchni |
| `ribbonTwist` | 0–2 | Siła skrętu przestrzennego |
| `positionX`, `positionY` | −50–50% | Przesunięcie względem kadru; dodatnie Y przesuwa w górę |
| `animationSpeed` | 0–2 | Tempo ruchu; zero zatrzymuje ruch |
| `highlightStrength` | 0–1 | Siła światła na zagięciu |
| `grainStrength` | 0–0,1 | Intensywność ziarna |

Animacja deformuje wierzchołki siatki (12513 wierzchołków, 24576 trójkątów).
Bufor głębokości obsługuje nakładające się fragmenty zawiniętej powierzchni.
Paleta i smugi są przypisane do powierzchni i podążają za jej ruchem.
Światło jest obliczane z kierunku powierzchni; nie wymaga tekstur ani modeli z zewnętrznych serwisów.

## Strojenie lokalne

Uruchom `npm run dev --workspace=landing_page` i otwórz
`http://127.0.0.1:4321/?theme=light&shader=edit`.
Panel zmienia parametry na żywo. Reset przywraca props przekazane komponentowi.
Zmiany w panelu nie zapisują plików i znikają po przeładowaniu; wybrane wartości
należy przenieść do props. Panel nie jest renderowany w buildzie produkcyjnym.

Shader działa w WebGL, maksymalnie w 30 kl./s, zatrzymuje się poza ekranem
i w ukrytej karcie. Ustawienie ograniczenia ruchu wyświetla statyczny kadr.
Bez WebGL pozostaje gradient CSS. Ciemny motyw przyciemnia wynik dla czytelności.
Bufor obrazu ma limit 2 milionów pikseli i gęstość do 1,5×. Mobilny kadr
przesuwa wstęgę w prawo, aby pozostawić miejsce na tekst. Test widoku mobilnego
w przeglądarce nie zastępuje pomiarów na fizycznym telefonie.

## Sprawdzenie konfiguracji

```sh
node --experimental-strip-types --test landing_page/src/lib/radiance.test.ts
npm run check --workspace=landing_page
npm run build --workspace=landing_page
```
