# ETNER – moduł 4 „Płace” (projekt)

Zaakceptowany przez właściciela 2026-11-11. Źródło: arkusze płacowe skoroszytu firmy (Pracownicy, Godziny, Rozliczenie miesiąca, Zaliczki i dodatki, Statystyki urlopów, Podsumowanie płac, Parametry). Prawdziwe dane nigdy w repozytorium.

## Decyzje właściciela
- D1 Godziny do wypłaty wpisywane ręcznie raz w miesiącu; dni pracy z harmonogramu tylko jako podpowiedź (realnie ~9,5 h/dzień, więc harmonogram × 8 h ≠ wypłata).
- D2 Płace widzą wszyscy admini (jak Finanse; tabele synchronizowane tylko do adminów).
- D3 Stawka godzinowa z historią („od miesiąca”); wypłata miesiąca liczy stawkę obowiązującą w tym miesiącu.
- D4 Robocizna = pełny koszt firmy. Koszt 1 dnia osoby = jej koszt całkowity w miesiącu ÷ jej dni pracy w harmonogramie (½ dnia = 0,5). Miesiąc bez wpisanych godzin: (stawka + koszt umowy ÷ wymiar etatu) × godziny dnia (8). Osoba bez stawki: „stawka osobodnia” z Ustawień Finansów.
- D5 Bez widoku dla pracownika, pasków wypłat i eksportu (na później).
- D6 Wynik firmy „Koszty pracowników” = koszt całkowity z Płac; miesiące bez danych w Płacach zostają z ręczną kwotą (`finanse_place`).

## Reguły liczenia (jak w arkuszu)
- **Rozliczenie osoby w miesiącu:** wypłata = godziny × stawka; urlop płatny = płatne dni × godziny dnia urlopu (8) × stawka; należne = wypłata + urlop płatny + premie; do wypłaty = należne − zaliczki − przelewy (ujemne = nadpłata); koszt całkowity = należne + koszt umowy + inne koszty.
- **Koszt umowy (ZUS + zdrowotna + PIT, ponad netto):** liczony w miesiącach, gdy umowa trwa (od–do, puste = bez ograniczenia) i miesiąc ≤ bieżący. Źródło: ręczna zmiana w miesiącu → „koszt umowy – ręcznie” osoby → kalkulator z brutto (tylko umowa o pracę i zlecenie). „Bez umowy” = 0.
- **Kalkulator** (zaokrąglenia do grosza jak w arkuszu, Parametry wiersze 24–31): społeczne pracownika = Σ round(brutto × emerytalna/rentowa/chorobowa); zdrowotna = round((brutto − społeczne) × 9%); PIT = max(0, round(round(max(0, brutto − społeczne − KUP)) × 12% − kwota zmniejszająca)), KUP: UoP kwota osoby (puste = 250), zlecenie 20% × (brutto − społeczne); netto = brutto − społeczne − zdrowotna − PIT; ZUS pracodawcy = Σ round(brutto × emerytalna/rentowa/wypadkowa/FGŚP) + FP gdy brutto ≥ płaca minimalna; koszt umowy = brutto + ZUS pracodawcy − netto.
- **Urlop:** z kodów harmonogramu w dni robocze (bez weekendów i świąt), ½ dnia = 0,5. Wypoczynkowy = kod zaczynający się od „urlop” (bez „urlop b/o/n…”); na żądanie = „na ż…”, „urlop n…”, „UŻ”; oba liczą się do limitu. Płatne dni liczone po kolei od początku roku do limitu osoby, kolejne darmowe. L4 = „L4…”; okolicznościowy = „okol…”, „urlop o…”; bezpłatny = „bezpł…”, „urlop b…”, „x”. Urlop ustawowy „na papierze” (UoP): 20/26 dni × etat × miesiące umowy w roku ÷ 12, w górę.
- **Dzień pracy w harmonogramie:** wpis, który nie jest nieobecnością ani kodem „wolne” (½ dnia = 0,5).
- **Koszt 1 h (podsumowanie):** koszt całkowity ÷ godziny przepracowane (bez urlopu).

## Dane (migracja 0027, tylko dodająca)
- `payroll_people` – 1:1 z `schedule_people`: forma (`uop|zlecenie|inna|brak`), umowaOd/umowaDo, bruttoGr, kosztRecznyGr, kupGr, urlopDni (limit płatny/rok), etat, staz10, uwagi.
- `payroll_rates` – personId, odMiesiaca (RRRR-MM), stawkaGr.
- `payroll_months` – personId × miesiac (unikalne): godziny, kosztUmowyGr (ręczna zmiana, null = automat).
- `payroll_entries` – personId, miesiac, dzien?, rodzaj (`zaliczka|przelew|premia|inny`), kwotaGr, opis.
- Parametry w `settings` `place_parametry` = { "RRRR": {…} }; miesiąc używa parametrów swojego roku, inaczej najbliższego wcześniejszego, inaczej domyślnych 2026.

Liczenie w całości w przeglądarce (czyste funkcje w `web/src/features/place/model.ts`, testy vitest); serwer = zapis, synchronizacja, import.

## Ekrany
Menu „Płace” (admin), zakładki: Rozliczenie miesiąca · Godziny · Zaliczki i dodatki · Urlopy · Podsumowanie · Wykresy · Pracownicy. Ustawienia: „Parametry płac” (rok) i „Płace z arkusza” (jednorazowo, do pustych Płac, próba → zapis). Komputer: tabele; telefon: lista wyboru zakładek i karty.

## Połączenia z Finansami
Wynik firmy (D6), Wykresy Finansów (te same koszty pracowników), Robocizna na karcie zlecenia i w Wynikach zleceń (D4).

## Poza zakresem
Widok pracownika, paski wypłat, eksport, PPK, nadgodziny, limity urlopu inne w każdym roku.
