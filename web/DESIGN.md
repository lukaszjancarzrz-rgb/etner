---
name: ETNER, Katalog techniczny
description: ERP firmy instalacyjnej czytany jak katalog techniczny hurtowni - gęste tabele, granatowa szyna, indeks branż.
colors:
  paper-cool: "#eef2f5"
  card-white: "#ffffff"
  ink-navy: "#0a2240"
  ink-2: "#4a5d70"
  ink-3: "#5d6f80"
  line: "#c9d4de"
  field: "#74879a"
  rule: "#e3e9ee"
  action-blue: "#0070ab"
  ok-teal: "#00736b"
  danger-red: "#b3261e"
  new-red: "#c62828"
  rail-navy: "#0a2240"
  rail-on: "#17396a"
  rail-ink: "#c9d6e3"
  dark-bg: "#0a2240"
  dark-card: "#102e52"
  dark-ink: "#eef3f8"
  dark-action: "#5cbcf0"
  dark-new-red: "#d32f2f"
  cat-pv: "#c4501b"
typography:
  title:
    fontFamily: "Sofia Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 800
    lineHeight: 1.4
    letterSpacing: "-0.01em"
  section:
    fontFamily: "Sofia Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
  body:
    fontFamily: "Sofia Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.4
    fontFeature: "tnum"
  body-dense:
    fontFamily: "Sofia Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.4
  column-head:
    fontFamily: "Sofia Sans Condensed, Sofia Sans, ui-sans-serif, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
  index-tab:
    fontFamily: "Sofia Sans Condensed, Sofia Sans, ui-sans-serif, sans-serif"
    fontSize: "0.8rem"
    fontWeight: 800
    lineHeight: 1.25
rounded:
  sm: "3px"
  md: "4px"
  sheet: "6px"
spacing:
  grid: "8px"
  gutter: "32px"
  bar: "16px"
components:
  button-primary:
    backgroundColor: "{colors.action-blue}"
    textColor: "{colors.card-white}"
    rounded: "{rounded.md}"
    height: "48px"
    padding: "0 16px"
  button-secondary:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.ink-navy}"
    rounded: "{rounded.md}"
    height: "48px"
  button-danger:
    backgroundColor: "{colors.danger-red}"
    textColor: "{colors.card-white}"
    rounded: "{rounded.md}"
  input:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.ink-navy}"
    rounded: "{rounded.md}"
    height: "48px"
    padding: "0 12px"
  badge-new:
    backgroundColor: "{colors.new-red}"
    textColor: "{colors.card-white}"
    rounded: "{rounded.sm}"
    height: "20px"
  cat-tab:
    textColor: "{colors.card-white}"
    rounded: "{rounded.sm}"
    typography: "{typography.index-tab}"
    width: "40px"
  side-rail:
    backgroundColor: "{colors.rail-navy}"
    textColor: "{colors.rail-ink}"
    width: "224px"
  side-rail-item-on:
    backgroundColor: "{colors.rail-on}"
    textColor: "{colors.card-white}"
    rounded: "{rounded.md}"
    height: "38px"
  panel:
    backgroundColor: "{colors.card-white}"
    rounded: "{rounded.md}"
---

# Design System: ETNER, Katalog techniczny

## Overview

**Creative North Star: "Katalog techniczny hurtowni"**

ETNER czyta się jak katalog elektrycznej hurtowni: gęste, równe tabele z liczbami tabelarycznymi, indeks branż jako kolorowe zakładki przy lewej krawędzi wierszy, granatowa szyna menu z białym blokiem logo. Biuro na komputerze porównuje i sortuje; ekipa na telefonie wykonuje jedną czynność naraz na dużych kartach. Odrzucone: "przyjazny SaaS" z pływających zaokrąglonych kart, pigułek i poszerzonych nagłówków.

Papier jest chłodny (#eef2f5) z kratką 32 px w tle, panele białe z obrysem 1 px, nagłówek tabeli z grubą (2 px) kreską granatu. Układ wyrównany do kratki 8/32 px. Każdy kolor ma jedno zadanie.

**Key Characteristics:**
- Szyna 224 px, granat #0a2240, blok logo 96 px z czytelnym hasłem "INTELIGENTNY WYBÓR".
- Promienie 3-4 px, cień wyłącznie w okienkach.
- Dwa kroje: Sofia Sans (tekst, liczby) i Sofia Sans Condensed (nagłówki kolumn, zakładki).
- Jasny i ciemny motyw (data-theme lub systemowy); na komputerze z myszą gęściej (87,5% rozmiaru, odstęp 3 px).

## Colors

Chłodny granat i biel, jeden niebieski na akcję, jeden czerwony na "nowe" i błąd.

### Primary
- **Niebieski akcji** (#0070ab; ciemny #5cbcf0): przyciski główne, zaznaczenie, fokus, linki, aktywna zakładka dolnego menu. Jedyny kolor interakcji.

### Secondary
- **Czerwień "nowe"** (#c62828; ciemny #d32f2f): znacznik "nowe" (biały tekst), liczniki w menu. Decyzja właściciela: wszystko "nowe" jest czerwone.
- **Czerwień błędu** (#b3261e; ciemny #ff8a80): błędy, zaległe, przycisk niszczący.
- **Zieleń potwierdzenia** (#00736b; ciemny #45cdbb): sukces, przycisk "ok".

### Tertiary
- **Kolory branż** (ze słownika `kategoria`, ustawia admin; np. PV pomarańcz #c4501b): zakładki-indeksy i paski kategorii. Tekst na zakładce biały lub granatowy wg kontrastu >=4,5:1.

### Neutral
- **Papier chłodny** (#eef2f5; ciemny #0a2240): tło ze kratką.
- **Biel karty** (#ffffff; ciemny #102e52): panele, tabele, pola.
- **Granat tuszu** (#0a2240; ciemny #eef3f8): tekst, nagłówek tabeli (kreska 2 px), aktywny segment.
- **Tusz 2 / 3** (#4a5d70 / #5d6f80): tekst drugorzędny i podpowiedzi (>=4,5:1).
- **Obrys panelu** (#c9d4de), **obrys pola** (#74879a, >=3:1), **linia wiersza** (#e3e9ee).
- **Szyna** (#0a2240), **szyna aktywna** (#17396a), **tekst szyny** (#c9d6e3).

### Named Rules
**The One Job Rule.** Każdy kolor ma jedno zadanie: niebieski = akcja, czerwony = nowe/zaległe/błąd, kolor branży = indeks branży. Nie mieszać.
**The Red Means New Rule.** Wszystko "nowe" jest czerwone (#c62828), białym tekstem, bez wyjątków.
**The Index Tab Rule.** Kolor branży występuje w zakładkach-indeksach. Cytowany wyjątek: komórki harmonogramu zachowują odcień kategorii (tło 13% koloru, tekst ink).

## Typography

**Display / Body Font:** Sofia Sans (z ui-sans-serif, system-ui), zmienna 400-800, serwowana lokalnie (latin i latin-ext, bez Google, OFL).
**Label Font:** Sofia Sans Condensed 600-800, tylko nagłówki kolumn, zakładki branż, dolne menu.
**Mono:** font-mono wyłącznie dla loginów i haseł (odróżnianie 0/O, l/1).

**Character:** Techniczny, zwarty; liczby tabelaryczne globalnie (tabular-nums).

### Hierarchy
- **Title** (800, 1.75rem desktop / 1.5rem telefon, -0.01em): tytuł ekranu w pasku, z liczbą pozycji.
- **Section** (700, 1.25rem desktop / 1.125rem): tytuł sekcji, z liczbą.
- **Body** (400, 1rem, 1.4): tekst telefonu i pola; na komputerze rem = 14 px.
- **Dense** (400-600, 0.875rem): tabele, etykiety pól (600), podpowiedzi.
- **Column head** (Condensed 600, 0.875rem, tusz 2): nagłówki kolumn, sortowanie.
- **Index tab** (Condensed 800, 0.8rem): skrót branży w zakładce 40 px.

### Named Rules
**The Condensed Is Index Rule.** Condensed służy nagłówkom kolumn i zakładkom; treść zawsze Sofia Sans.
**The Mono Is Credentials Rule.** font-mono tylko tam, gdzie trzeba odróżnić znaki w loginie lub haśle.

## Layout

Siatka 8/32 px (Crouwel): kratka tła ma 32 px, a krawędź treści leży na jej linii. Komputer (>=1100 px): szyna 224 + 32 = treść od 256 px; pasek tytułu 47-48 px + 16 = 64 px; każdy ekran od lewej, nie wyśrodkowany, padding 32 px, odstęp kolumn 32 px, wierszy 16 px; szerokości czytelnego tekstu (max-w) zostają. Mysz: --spacing 3 px, nagłówek tabeli 40 px, wiersz 32 px. Telefon i dotyk (w tym iPad poziomo): 16 px, cele 44-48 px, dolne menu 4-5 pozycji (64 px). Tabele z sortowaniem na komputerze (Klienci, Paszporty, Zadania, Zakupy, Do serwisu, Zlecenia), karty na telefonie. Pasek narzędzi: szukaj, zakres, filtr branż, "+ Nowe" po prawej; panel szczegółów po prawej. Menu boczne bez grupowania, kolejność ekranów jak w aplikacji, "Więcej" zawsze ostatnie.

## Elevation & Depth

Płasko. Głębię daje obrys 1 px (#c9d4de) i tonalne tło karty na papierze. Cień tylko w warstwach nad treścią: okna, listy rozwijane, powiadomienia.

### Shadow Vocabulary
- **Overlay** (`0 2px 4px rgb(10 34 64 / 0.08), 0 12px 32px rgb(10 34 64 / 0.16)`; ciemny `0 2px 4px rgb(0 8 20 / 0.3), 0 12px 32px rgb(0 8 20 / 0.45)`): okna, menu rozwijane, toasty.

### Named Rules
**The Shadow Only Floats Rule.** Cień mają tylko elementy, które unoszą się nad treścią.

## Shapes

Prostokąty z promieniem 3-4 px (przyciski, pola, panele, tabele 4 px; znaczniki i zakładki 3 px); dolne okno telefonu i toast 6 px. Zakładka branży przy krawędzi wiersza ma zaokrąglony tylko prawy bok. Żadnych pigułek. Obrys 1 px; nagłówek tabeli 2 px granatu.

## Components

### Buttons
- **Shape:** prostokąt, promień 4 px, 700, wysokość 48 px (md), 40 px (sm), ikona 48 px.
- **Primary:** niebieski akcji, biały tekst. **Secondary:** biel, obrys, tusz. **Ghost:** bez tła. **Ok / Danger:** zieleń / czerwień.
- **Hover / Focus:** hover brightness 110% (secondary: ciemniejszy obrys); focus-visible kontur 2 px niebieski, offset 2 px; disabled 50%.

### Inputs / Fields
- Wysokość 48 px, obrys #74879a, biel, promień 4 px, padding 12 px. Focus: obrys niebieski + pierścień 2 px 25%. Błąd: obrys czerwony + komunikat pod polem. Etykieta nad polem (600, 0.875rem).

### Tables
- Ramka 1 px, nagłówek przyklejony pod paskiem (top 48 px), kreska 2 px granatu, Condensed 600; wiersz z linią #e3e9ee, hover tusz 4%, zaznaczony niebieski 10%; sortowanie przyciskiem z aria-sort; liczby do prawej.

### Index tab (CatTab)
- 40 px szer., skrót branży Condensed 800 na kolorze kategorii, przy lewej krawędzi wiersza. Skróty: EL, RW, KL, PV (#c4501b), AM, SH, SP, I.

### Badges
- 24 px (20 px dla "nowe"), promień 3 px; tony: line, ok, action (12%), warn (obrys czerwony), danger, ink, new (czerwony).

### Navigation
- **Szyna (komputer):** granat, element 38 px, 15 px, aktywny #17396a 700 z wypełnioną ikoną; licznik "nowe" czerwony po prawej; u dołu użytkownik i wylogowanie.
- **Dolne menu (telefon):** 64 px, Condensed 13 px, aktywny niebieski z podkładem 12%.
- **Pasek tytułu:** telefon granat z białym tekstem; komputer tło papieru 95%, kreska dolna.

### Segmented / Panel / Sheet
- Segmented: obrys, dzielniki, aktywny tusz na tle papieru (11 px wys. 44). Panel: biel, obrys, 4 px. Sheet: dolne okno 6 px, nakładka granat 50%, cień overlay.

## Do's and Don'ts

### Do:
- **Do** trzymać krawędź treści na linii kratki 32 px i wymiary na wielokrotności 8 (wiersz 32, nagłówek 40, szyna 224).
- **Do** oznaczać każde "nowe" czerwienią #c62828 z białym tekstem.
- **Do** pokazywać branżę zakładką-indeksem ze skrótem; nazwę podaje otoczenie (zakładka jest dekoracją dla czytnika).
- **Do** utrzymywać kontrast: tekst pomocniczy >=4,5:1, obrys pola >=3:1.
- **Do** respektować prefers-reduced-motion (animacje do 0,01 ms).

### Don't:
- **Don't** używać pływających kart z dużym promieniem, pigułek ani cieni poza oknami.
- **Don't** używać koloru branży poza zakładkami-indeksami, paskami kategorii i (cytowany wyjątek) tłem komórek harmonogramu.
- **Don't** grupować menu bocznego; "Więcej" zawsze ostatnie.
- **Don't** używać font-mono poza loginami i hasłami.
- **Don't** przenosić tego systemu na stronę paszportu klienta `/p/`: jest renderowana po stronie serwera, zawsze jasna, krojem systemowym (poza tym systemem).

### Wyjątki właściciela (zatwierdzone)
- Delikatna kratka 32 px w tle zostaje (rgb(10 34 64 / 0.045); ciemny rgb(255 255 255 / 0.03)).
- Wszystko "nowe" czerwone; menu bez grupowania, "Więcej" ostatnie.
- Komórki harmonogramu zachowują odcień kategorii (13%).
- font-mono wyłącznie loginy i hasła; strona /p/ poza systemem.
