# Moduł 3 „Finanse” – szkic (do akceptacji właściciela)

Stan: SZKIC 2026-11-11, przed pytaniami. Podstawa: arkusz właściciela (wersja 2026_5, analizowany tylko w sesji, bez danych w repozytorium).
Moduł 4 „Płace” osobno (arkusze Pracownicy, Godziny, Rozliczenie miesiąca, Zaliczki i dodatki, Statystyki urlopów, Parametry).

## 1. Co dziś robi arkusz (część finansowa)

| Arkusz | Co zawiera | Skala (rok 2026) |
|---|---|---|
| Przychody | jedno zlecenie/faktura w wierszu: kategoria (+ dodatkowa), data zakończenia, miesiąc (albo „inny miesiąc”), lokalizacja, inwestor, zakres prac, kwota bez faktury **albo** brutto z faktury + stawka VAT (8%/23%) → VAT i netto liczone, zwrot VAT z US osobno, nr faktury, kontakt, szczegóły techniczne, uwagi | ok. 80 wierszy; ok. 40% bez faktury |
| Koszty | jeden koszt w wierszu, kwoty NETTO jak w KPiR: data, miesiąc, nr dokumentu, kontrahent/NIP, opis, kategoria (12 pozycji, np. Materiały i towary, Narzędzia, Paliwo, Samochody, Księgowość, Amortyzacja…), kolumna KPiR (12/13/14/15), „do wyniku?” (np. lista płac = nie, liczy się z płac) | ok. 760 wierszy, przepisywane z KPiR co miesiąc |
| Wyniki firmy | miesiące + wybrany okres: przychód z fakturą / bez, koszty firmy, koszty pracowników (z płac), wynik, narastająco, marża, godziny pracy, przychód i wynik na 1 h, liczba zleceń, średnia wartość zlecenia, zwrot VAT, wynik ze zwrotem | liczone samo |
| Kontrola KPiR | co miesiąc sumy „wg KPiR” (przychód, towary, koszty uboczne, wynagrodzenia, pozostałe) vs „w arkuszu” → różnica | 12 wierszy |
| Statystyki zleceń | osobodni z harmonogramu wg kategorii, wg ekipy, kategoria × ekipa | liczone samo |
| Przepływ gotówki | kasa: wpływ/wydatek, stan po operacji, stan na koniec miesiąca, wykres | praktycznie nieużywany (1 wpis) |

## 2. Jak to będzie wyglądać w aplikacji

Nowy ekran **Finanse** w menu (tylko admin, patrz pytanie 1), na komputerze tabele, na telefonie karty – jak reszta „Katalogu technicznego”. Zakładki u góry (Segmented):

1. **Wynik** – tabela miesięcy jak „Wyniki firmy” (kolumny Sty…Gru + Razem/okres): przychód z fakturą, bez faktury, razem; koszty firmy; koszty pracowników; wynik, narastająco, marża; liczba zleceń, średnia wartość; zwrot VAT i wynik ze zwrotem. Wybór okresu (od–do). Na telefonie: kafelki bieżącego miesiąca i roku (przychód, koszty, wynik, marża). Ujemny wynik na czerwono (kolor błędu).
2. **Przychody** – tabela z sortowaniem i filtrem miesiąca/branży (zakładki-indeksy EL, RW, KL, PV…). Wiersz = przychód: zlecenie (link do karty, jeśli powiązane), klient, miejscowość, kwota bez faktury / brutto + VAT → netto, nr faktury, miesiąc. „+ Przychód” po prawej.
   - Przy zmianie statusu zlecenia na „Rozliczone” aplikacja proponuje „Dodaj przychód” z wypełnionym klientem, miejscowością, branżą i zakresem (patrz pytanie 5).
   - Karta zlecenia (admin): sekcja „Rozliczenie” z przychodami tego zlecenia (tu wraca usunięta wcześniej „notatka z rozliczeniem”, R71).
3. **Koszty** – tabela jak arkusz Koszty: data, nr dokumentu, kontrahent, opis, kategoria (słownik w Ustawieniach, start: 12 kategorii z arkusza), netto, kolumna KPiR, „do wyniku”. Szybkie dodawanie (Enter dodaje, jak Zadania), filtr miesiąca i kategorii, suma na dole. Opcjonalnie powiązanie kosztu ze zleceniem (pytanie 3).
4. **Kontrola KPiR** – miesiąc po miesiącu: wpisujesz sumy z księgi, obok sumy z aplikacji i różnica (czerwona, gdy ≠ 0).
5. **Statystyki** – osobodni z harmonogramu wg branży, ekipy, branża × ekipa (to aplikacja już wie – bez wpisywania).
6. **Kasa** – tylko jeśli chcesz (pytanie 4): wpływy/wydatki gotówkowe, stan.

Pracownicy nie widzą nic z Finansów (ani kwot na zleceniu).

## 3. Jak to wdrożyć (technicznie, w skrócie)

- Nowe tabele (migracja tylko dodająca): `revenues` (przychody), `costs` (koszty), `kpir_months` (sumy z księgi), opcjonalnie `cash_ops` (kasa). Kwoty w groszach (konwencja `_gr`, R22), VAT liczony z brutto i stawki jak w arkuszu, miesiąc = data zakończenia albo „inny miesiąc”.
- Synchronizacja i praca offline jak w innych modułach, ale **tylko dla adminów** (dane finansowe nie trafiają na telefony pracowników).
- „Koszty pracowników” w Wyniku: do czasu modułu Płace – jedna kwota na miesiąc wpisana ręcznie (albo przeniesiona z arkusza „Podsumowanie płac”); po module 4 liczona sama.
- „Godziny pracy” i „na 1 h”: do czasu Płac – osobodni z harmonogramu × 8 h (zaznaczone jako szacunek) albo ukryte.
- **Przeniesienie danych z arkusza**: przycisk w Ustawieniach jak przy pierwszym imporcie (R53) – najpierw próba (raport: ile przychodów, kosztów, ile przychodów udało się dopasować do zleceń), potem „Wykonaj”. Przychody dopasowane do zleceń po kliencie i miejscowości; niepewne trafiają do „Do przejrzenia”. Plik tylko w pamięci serwera, nic w repozytorium.
- Eksport: Finanse dochodzą do istniejącego eksportu danych (kopia).

Kolejność wydań (każda część osobno na produkcję):
- **3a** Przychody + Koszty + import z arkusza (od razu da się porzucić arkusz dla tych dwóch zakładek).
- **3b** Wynik + Kontrola KPiR + Statystyki.
- **3c** Rozliczenie na karcie zlecenia (+ wynik zlecenia, jeśli chcesz) i Kasa (jeśli chcesz).

## 4. Poza zakresem (propozycja)

Wystawianie faktur i KSeF, połączenie z bankiem, deklaracje VAT/PIT – zostają u księgowej / w programie do faktur. Ewentualnie później: import listy faktur z KSeF zamiast przepisywania.

## 5. Pytania do właściciela

1. Kto widzi Finanse: wszyscy administratorzy czy tylko Ty?
2. Koszty: dalej przepisywane z KPiR raz w miesiącu (np. import pliku od księgowej), czy wpisywane na bieżąco (z możliwością zdjęcia faktury)?
3. Wynik pojedynczego zlecenia (przychód − materiały przypisane do zlecenia − robocizna z harmonogramu) – chcesz?
4. Kasa gotówkowa – potrzebna? (w arkuszu prawie pusta)
5. Przy statusie „Rozliczone” proponować od razu dodanie przychodu?
