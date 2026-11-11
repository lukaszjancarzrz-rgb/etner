# Plan – moduł 4 „Płace”

Spec: `docs/superpowers/specs/2026-11-11-etner-modul-4-place-design.md` (reguły liczenia i decyzje D1–D6 – czytaj przed każdym zadaniem).
Wzorzec: moduł Finanse (`server/src/modules/finanse`, `web/src/features/finanse`, `web/src/features/ustawienia/FinanseUstawienia.tsx`). Kwoty w groszach (integer), miesiąc `RRRR-MM`, dzień `RRRR-MM-DD`. Teksty UI po polsku. Prawdziwych danych nie commitować.
Wykonanie: zadania 2–4 pomocnicy (Sonnet), 1 i 5 główna sesja, 6 przegląd końcowy (Opus). Po każdym zadaniu: testy pakietu, commit.

## Zadanie 1 – model liczenia (web, czyste funkcje)
Pliki: `web/src/features/place/model.ts`, `model.test.ts`, `web/src/features/place/parametry.ts` (domyślne parametry 2026 z arkusza: płaca min. 4806 zł, emerytalna 9,76% p./9,76% f., rentowa 1,5% p./6,5% f., chorobowa 2,45%, zdrowotna 9%, PIT 12%, kwota zmniejszająca 300 zł, KUP UoP 250 zł, KUP zlecenie 20%, wypadkowa 1,67%, FP 2,45%, FGŚP 0,1%, godziny dnia 8, urlop 20/26 dni, godziny dnia urlopu 8).
Funkcje (rekordy `Rec` jak w finanse/model.ts):
- `kalkulatorUmowy(bruttoGr, forma, kupGr, p)` → { spoleczne, zdrowotna, pit, netto, zusPracodawcy, kosztPracodawcy, kosztUmowy } (gr).
- `rodzajNieobecnosci(kod)` → 'wypoczynkowy' | 'naZadanie' | 'L4' | 'okolicznosciowy' | 'bezplatny' | null; `czyDzienPracy(entry)`.
- `urlopyRoku(entries, people, osoby(payroll_people), rok, swieta)` → na osobę: dni w miesiącach wg rodzaju, płatne/darmowe w miesiącach (po kolei do limitu), pozostało, ustawowy na papierze. Dni robocze: `shared/src/holidays.ts`.
- `stawkaMiesiaca(rates, personId, m)`, `kosztUmowyMiesiaca(...)`, `parametryMiesiaca(map, m)`.
- `rozliczenieMiesiaca(dane, m)` → wiersze osób (kolumny arkusza „Rozliczenie miesiąca”) + razem.
- `podsumowanieRoku(dane, rok)` → miesiące × (godziny, wypłaty, urlop płatny, premie, koszty umów, inne, koszt całkowity, koszt 1 h) i roczne na osobę.
- `kosztyPracownikowMiesiecy(dane, rok)` → { 'RRRR-MM': gr } tylko dla miesięcy z danymi płac (godziny albo wpisy).
- `kosztDniaOsoby(dane, personId, m, stawkaOsobodniaGr)` (D4) i `robociznaZlecenia(jobId, entries, dane, stawkaOsobodniaGr)`.
Testy: kalkulator na płacy minimalnej (wynik policzony ręcznie wzorami arkusza; bez prawdziwych danych osób), koszt ręczny, płatne/darmowe dni po limicie, ½ dnia, święta, umowa od/do, nadpisania, robocizna z fallbackami.

## Zadanie 2 – serwer: tabele, API, synchronizacja
Pliki: `server/src/modules/place/{schema,service,routes,index}.ts`, `place.test.ts`, rejestracja w `server/src/modules/index.ts`, migracja `server/drizzle/0027_place.sql` (`pnpm --filter @etner/server db:generate`, tylko CREATE), zod w `shared/src/schemas/place.ts` (+ eksport w `shared/src/index.ts`), `web/src/core/write.ts` TMP_ENTITIES += payroll_*.
- Tabele wg spec (baseCols, kwoty gr, `payroll_people.person_id` unikalne wśród nieusuniętych, `payroll_months` unikalne person_id+miesiac wśród nieusuniętych).
- ModuleDef `place` bez visibleTo (tylko admin), tables: payroll_people, payroll_rates, payroll_months, payroll_entries.
- API (requireAdmin, runOp/opId jak finanse): `PUT /api/payroll/people/:personId` (upsert), `POST/PUT/DELETE /api/payroll/rates[/:id]`, `PUT /api/payroll/months/:personId/:miesiac` ({godziny|null, kosztUmowyGr|null}; oba null = usuń), `POST/PUT/DELETE /api/payroll/entries[/:id]`, `GET/PUT /api/settings/place` (parametry per rok, walidacja zakresów).
- Testy: 403 dla pracownika, upsert, unikalność, usuwanie miękkie, parametry.

## Zadanie 3 – import z arkusza
Pliki: `server/src/modules/place/import-xlsx.ts` (+test na syntetycznym skoroszycie jak `finanse/import-xlsx.test.ts`), trasa `POST /api/payroll/import-xlsx` (jak finanse: tylko do pustych Płac, próba bez `?naprawde=1`, limit 10 MB, kontrola .xlsx), karta „Płace z arkusza” w Ustawieniach.
Czyta: Pracownicy (wiersze 7–14: C imię, D forma, E stawka, F/G umowa, H brutto, I koszt ręczny, L urlop, M etat, N staż, P uwagi; rok D4), Parametry (C6–C20, C74–C76 → parametry roku; E24–E31 KUP osoby), Godziny (tabela 1 wiersze 6–13 godziny; tabela 2 wiersze 19–26 i 3 wiersze 30–37: komórka z liczbą zamiast formuły = wyjątek → stawka różna od podstawowej tworzy historię stawek od tego miesiąca, koszt → `kosztUmowyGr` miesiąca), Zaliczki i dodatki (od wiersza 10: C data, D za miesiąc, E pracownik, F rodzaj, G kwota, H opis). Osoby dopasowane do `schedule_people` po nazwie (norm); nieznane → w raporcie, pominięte. Wynik: liczby dodanych + ostrzeżenia.

## Zadanie 4 – ekrany
Pliki: `web/src/features/place/{Place,Rozliczenie,Godziny,Wpisy,WpisForm,Urlopy,Podsumowanie,Wykresy,Pracownicy,PracownikForm}.tsx`, `web/src/features/ustawienia/PlaceUstawienia.tsx`, trasa `place` (lazy, admin, ikona) w `web/src/routes.tsx` i pozycja w `web/src/screens/More.tsx`.
- Powłoka jak `Finanse.tsx` (Segmented / Select na telefonie, wybór roku; w Rozliczeniu wybór miesiąca, domyślnie poprzedni).
- Godziny: tabela osoby × 12 miesięcy, edycja w komórce (Enter/Tab), pod liczbą dni pracy z harmonogramu (szare), wiersz kosztu umowy z możliwością nadpisania (wyróżnienie zmienionej), razem.
- Zaliczki: lista z filtrem osoby/miesiąca, formularz (osoba, miesiąc, data opcjonalna, rodzaj, kwota, opis), edycja po kliknięciu.
- Pracownicy: osoby z harmonogramu; formularz danych umowy i historia stawek (dodaj „od miesiąca”); podgląd kalkulatora (netto, koszt umowy).
- Wykresy (8): godziny w miesiącach na osobę, wypłaty w miesiącach na osobę, godziny w roku na osobę, koszt roczny na osobę (stos), struktura kosztów w miesiącach (stos), wypłaty + godziny łącznie, urlop płatny/darmowy/pozostały, nieobecności w miesiącach. Wzorzec i kolory: `finanse/Wykresy.tsx`.
- Parametry płac w Ustawieniach (rok, pola procentów i kwot) + karta importu.
- Dostępność: etykiety, 44 px na telefonie, klawiatura.

## Zadanie 5 – połączenie z Finansami i sprawdzenie
- `finanse/Wynik.tsx`, `finanse/Wykresy.tsx`: koszty pracowników = `kosztyPracownikowMiesiecy` nadpisuje ręczne `finanse_place` dla miesięcy z danymi płac; edycja ręczna tylko dla pozostałych miesięcy.
- `finanse/model.ts` `wynikZlecenia`/`wynikiZlecen` + `Rozliczenie.tsx`, `WynikiZlecen.tsx`: robocizna z `robociznaZlecenia` (D4); opis „pełny koszt firmy”.
- e2e `web/e2e/place.spec.ts`: wejście w Płace, wpis godzin, zaliczka, rozliczenie liczy „do wypłaty”.
- Sprawdzenie na prawdziwym skoroszycie (lokalna baza, poza repo): import → sumy roku (godziny, koszt całkowity, koszty umów, urlop płatny) równe arkuszowi „Podsumowanie płac”; liczby tylko w sesji, nie w repo.
- `pnpm -r test`, `pnpm -r build`, `pnpm size`, pełne e2e.

## Zadanie 6 – przegląd końcowy, ledger, wydanie
Przegląd (Opus) całej gałęzi; poprawki; ledger `docs/superpowers/ledger/2026-11-11-etner-modul-4-place-progress.md`; aktualizacja `web/PRODUCT.md`. Wydanie (push na `modul-1` i `produkcja`, migracja 0027) **dopiero po „tak” właściciela**. Po wydaniu: właściciel robi Ustawienia → „Płace z arkusza”.
