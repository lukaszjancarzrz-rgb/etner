# Moduł 3a „Finanse: Przychody i Koszty” Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ekran „Finanse” (admin) z zakładkami Przychody i Koszty, import kosztów z KPiR (plik JSON), jednorazowe przeniesienie przychodów/kosztów/sum KPiR z arkusza właściciela oraz okienko „Przychód ze zlecenia” przy statusie „Rozliczone”.

**Architecture:** Nowy moduł serwera `finanse` (wzorzec jak `zakupy`: schema/service/routes/index, zod w `@etner/shared`), trzy nowe tabele w migracji 0025 (tylko dodające), widoczne wyłącznie dla adminów (brak `visibleTo` = tylko admin). Web: nowy ekran `#fin` (lazy), formularze w Sheet, zapisy przez `createVia/updateVia` (kolejka offline jak wszędzie).

**Tech Stack:** Hono + drizzle (SQLite), zod (shared), React 18 + Tailwind, exceljs (już jest), vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-11-etner-modul-3-finanse-szkic.md` (sekcje 2, 3, 6, 6.5); format importu: `docs/instrukcje/import-kpir.md`.

## Global Constraints

- Migracja 0025 wyłącznie dodająca (nowe tabele, nowe wiersze słownika); żadnych zmian istniejących kolumn/danych.
- Kwoty w groszach (`*_gr`, integer), formatowanie `fmtZl`, wpisywanie przez `toGr` (`shared/src/money.ts`).
- Finanse widzą i zmieniają **wszyscy administratorzy**; pracownik: brak w menu, `#fin` = „Brak dostępu”, API 403, nic w synchronizacji.
- Sposoby rozliczenia (dokładne etykiety): „Bez faktury”, „Faktura VAT 8%”, „Faktura VAT 23%”, „Zwrot VAT z US” (zwrot nie jest przychodem; osobny wiersz w Wyniku w 3b).
- Miesiąc przychodu = `inny miesiąc` jeśli podany, inaczej miesiąc daty zakończenia (RRRR-MM).
- Kategorie kosztów (słownik `kategoria_kosztu`, kolejność): Materiały i towary; Narzędzia i wyposażenie; Paliwo; Samochody (części, serwis, opłaty); Księgowość i biuro; Telefon i internet; Szkolenia; Badania i BHP pracowników; Amortyzacja; Płace z listy płac (w arkuszach pracowników); Inne; Do wyjaśnienia – błąd w KPiR (nie liczone).
- Kosztów nie przypisujemy do zleceń. Materiały zlecenia = kwota szacunkowa na przychodzie (`materialyGr`).
- Wygląd wg `web/DESIGN.md` (tabele na komputerze, karty na telefonie, liczby do prawej, tabular-nums); interfejs po polsku.
- Prawdziwe dane z arkusza/KPiR nigdy w repozytorium (testy na danych syntetycznych).
- Bez kasy gotówkowej.

## Review Focus

1. Ten sam plik KPiR wgrany drugi raz → zero nowych kosztów (duplikat = ten sam miesiąc, nr dokumentu, data, netto) – test w Task 2.
2. Kwota z przecinkiem/spacją („18 500,50”) i brutto VAT 8%/23% → netto i VAT sumują się dokładnie do brutto (bez groszowych różnic) – test w Task 1.
3. Pracownik nie dostaje przychodów/kosztów ani w `/api/changes`, ani w snapshot – test w Task 2.
4. Status „Rozliczone” ustawiony ponownie dla zlecenia, które już ma przychód → bez okienka i bez drugiego przychodu – test e2e w Task 5.
5. Import z arkusza na niepustych tabelach → odmowa bez zmian (nie dubluje danych produkcyjnych) – test w Task 3.

---

### Task 1: Wspólne: sposoby rozliczenia, VAT z brutto, słownik i schematy zod

**Files:**
- Create: `shared/src/finanse.ts`, `shared/src/finanse.test.ts`, `shared/src/schemas/finanse.ts`
- Modify: `shared/src/stale.ts` (DICT_RODZAJE + `'kategoria_kosztu'`), `shared/src/index.ts` (eksporty), `server/src/modules/slowniki/seed.ts` (SEED.kategoria_kosztu + jednorazowy `seedModul3` jak `seedModul2`, wywołany w `seedBase` dla istniejącej bazy)

**Interfaces:**
- Produces:
  - `SPOSOBY = ['bez', 'vat8', 'vat23', 'zwrot'] as const; type Sposob`; `SPOSOB_LABEL: Record<Sposob, string>` (etykiety z Global Constraints)
  - `rozbij(kwotaGr: number, sposob: Sposob): { nettoGr: number; vatGr: number }` – `bez`/`zwrot`: netto = kwota, vat 0; `vat8`/`vat23`: kwota = brutto, netto = round(brutto·100/(100+stawka)), vat = brutto − netto
  - `miesiacPrzychodu(dzien: string | null, innyMiesiac: string | null): string | null`
  - zod: `revenueCreateSchema` {opId?, jobId?: string|null, kategoria?: string|null, klient: string, miejscowosc: string, opis: string, sposob, kwotaGr: int ≥0, dzien?: RRRR-MM-DD|null, innyMiesiac?: RRRR-MM|null, nrFaktury: string, materialyGr?: int ≥0|null, uwagi: string}; `revenueUpdateSchema` = partial + opId
  - `costCreateSchema` {opId?, dzien, miesiac, nrDokumentu, kontrahent, nip, opis, kategoria, nettoGr: int, kolumnaKpir: 12|13|14|15, doWyniku: boolean, uwagi}; `costUpdateSchema` = partial
  - `kpirFileSchema` – dokładnie format `etner-kpir-1` z instrukcji (kwoty jako liczby zł; serwer zamienia na grosze)
  - `kpirMonthSchema` {opId?, przychodGr, towaryGr, uboczneGr, wynagrodzeniaGr, pozostaleGr} (int)

- [ ] **Step 1: Testy w `shared/src/finanse.test.ts`:** `rozbij(10800,'vat8')` → {nettoGr:10000, vatGr:800}; `rozbij(12300,'vat23')` → {10000, 2300}; `rozbij(1850050,'vat8')` → netto+vat === 1850050; `rozbij(5000,'bez')` → {5000,0}; `miesiacPrzychodu('2026-10-28', null)` → '2026-10'; `miesiacPrzychodu('2026-10-28','2026-11')` → '2026-11'; `miesiacPrzychodu(null,null)` → null; `kpirFileSchema` odrzuca `kolumnaKpir: 11` i brak `format`.
- [ ] **Step 2:** `pnpm --filter @etner/shared test` → FAIL (brak modułu).
- [ ] **Step 3:** Implementacja + słownik `kategoria_kosztu` (seed dla nowej bazy i `seedModul3` dla istniejącej: wstaw, gdy brak jakiegokolwiek wiersza tego rodzaju, z `recordChange`). Test serwera w `slowniki` (istniejący plik testów): baza bez `kategoria_kosztu` po `seedBase` ma 12 wartości w kolejności z Global Constraints; drugie `seedBase` nic nie dodaje.
- [ ] **Step 4:** `pnpm -r test` → PASS.
- [ ] **Step 5:** Commit „Finanse: sposoby rozliczenia, VAT z brutto, słownik kategorii kosztów”.

### Task 2: Serwer: moduł `finanse` (tabele, API, import KPiR)

**Files:**
- Create: `server/src/modules/finanse/{schema.ts,service.ts,routes.ts,index.ts,finanse.test.ts}`, migracja `server/drizzle/0025_finanse.sql` (`pnpm --filter server db:generate`, potem sprawdzić, że SQL tylko tworzy)
- Modify: `server/src/modules/index.ts` (dodać `finanse` do `modules`)

**Interfaces:**
- Consumes: Task 1 (schematy, `rozbij`, `miesiacPrzychodu`).
- Produces:
  - Tabele: `revenues` (baseCols, jobId, kategoria, klient, miejscowosc, opis, sposob, kwotaGr, nettoGr, vatGr, dzien, innyMiesiac, miesiac, nrFaktury, materialyGr, uwagi, by), `costs` (baseCols, dzien, miesiac, nrDokumentu, kontrahent, nip, opis, kategoria, nettoGr, kolumnaKpir, doWyniku, uwagi, by), `kpir_months` (baseCols, miesiac unique, przychodGr, towaryGr, uboczneGr, wynagrodzeniaGr, pozostaleGr). `nettoGr/vatGr/miesiac` zawsze liczone na serwerze.
  - `ModuleDef` `finanse` bez `visibleTo` (tylko admin), `tables` do eksportu, `dictRefs` dla `kategoria` (revenues.kategoria) i `kategoria_kosztu` (costs.kategoria) – zmiana nazwy w słowniku przenosi się (R36).
  - API (wszystko `requireAdmin`): `GET/POST /api/revenues`, `PUT/DELETE /api/revenues/:id`; `GET/POST /api/costs`, `PUT/DELETE /api/costs/:id`; `POST /api/costs/kpir-import[?naprawde=1]` body = `kpirFileSchema` → `{ dodane: number; duplikaty: number; sumy: {12,13,14,15 w gr}; kpir: {…gr}; roznice: {towary, uboczne, wynagrodzenia, pozostale} }` (bez `naprawde` – transakcja wycofana); `PUT /api/kpir/:miesiac` (`kpirMonthSchema`); `GET /api/kpir`; `GET/PUT /api/settings/finanse` `{ autoPrzychod: boolean; domyslnySposob: Sposob }` (domyślnie `false`, `'vat8'`).
  - Nieznana kategoria kosztu w imporcie → `Inne` + w `uwagi` dopisek „kategoria z pliku: …”.

- [ ] **Step 1: Testy (`finanse.test.ts`, wzorzec `zakupy.test.ts`):**
  - admin POST przychód `{sposob:'vat23', kwotaGr:12300, dzien:'2026-10-28'}` → `nettoGr 10000, vatGr 2300, miesiac '2026-10'`; PUT zmiana sposobu przelicza.
  - pracownik: GET/POST `/api/revenues`, `/api/costs`, `/api/costs/kpir-import` → 403; `/api/changes?since=0` pracownika nie zawiera encji `revenues`, `costs`, `kpir_months`.
  - import KPiR (2 koszty): próba → `dodane 2`, w bazie 0; `?naprawde=1` → 2 w bazie, `kpir_months` z miesiącem; ponownie ten sam plik `?naprawde=1` → `dodane 0, duplikaty 2`.
  - `roznice.towary` = suma kol. 12 z pliku − `kpir.towary` (w groszach).
  - zmiana nazwy wartości `kategoria_kosztu` w słowniku zmienia `costs.kategoria`.
- [ ] **Step 2:** `pnpm --filter server test finanse` → FAIL.
- [ ] **Step 3:** Implementacja (service: funkcje z `db` pierwszym argumentem, `recordChange` przy każdym zapisie, `runOp` w routes jak `zakupy`; usuwanie miękkie `deletedAt`). Migracja przez `db:generate`.
- [ ] **Step 4:** `pnpm -r test` → PASS; `pnpm --filter server build` → OK.
- [ ] **Step 5:** Commit „Finanse: moduł serwera – przychody, koszty, import KPiR”.

### Task 3: Serwer: jednorazowe przeniesienie z arkusza (Przychody, Koszty, Kontrola KPiR)

**Files:**
- Create: `server/src/modules/finanse/import-xlsx.ts`, `server/src/modules/finanse/import-xlsx.test.ts`
- Modify: `server/src/modules/finanse/routes.ts`

**Interfaces:**
- Consumes: Task 2 (tabele, service create), `przeniesienie` service (wiersze „do przejrzenia”), funkcja odczytu komórek jak `raw()` w `scripts/migrate-old/read-xlsx.ts` (wydzielić/wyeksportować, nie kopiować).
- Produces: `POST /api/finanse/import-xlsx[?naprawde=1]` (admin, multipart `plik`, limit 10 MB jak `migration-import`) → `{ przychody: number; dopasowane: number; doPrzejrzenia: number; koszty: number; kpirMiesiace: number }`; odmowa 409 „Finanse mają już dane – przeniesienie tylko do pustych tabel”, gdy `revenues` lub `costs` niepuste.
- Układ arkusza (nagłówki w wierszu 6, dane od 7): Przychody kol. C kategoria (E, RW, K, AM, SH, S, I, H, V), E data zakończenia, G inny miesiąc, H lokalizacja, I inwestor, J zakres, K bez faktury, L brutto, M stawka („VAT 8%”/„VAT 23%”), R nr faktury, U uwagi; Koszty kol. C data, E nr dok., F kontrahent/NIP, G opis, H kategoria, I netto, J kolumna KPiR („12 …”), M do wyniku („tak”/„nie”); Kontrola KPiR wiersze 6–17 (Styczeń…Grudzień), kol. C/F/I/L/O = wg KPiR (przychód, towary, uboczne, wynagrodzenia, pozostałe); rok z komórki `RokRozl` (arkusz Pracownicy, C4) albo z dat.
- Mapowanie kategorii: E→Elektryka, RW→Rekuperacja, K→Klimatyzacja, AM→Alarmy i monitoring, SH→Smart home, S→Sprzedaż, I/H→Inne (H: „hydraulika” w uwagach), V→sposób `zwrot`. Sposób: K > 0 → `bez` (kwota K), inaczej `vat8`/`vat23` z kol. M (kwota L).
- Dopasowanie do zlecenia: klient o znormalizowanej nazwie = inwestor **i** (dokładnie jedno zlecenie tego klienta w tej kategorii albo miejscowość obiektu = lokalizacja) → `jobId`; inaczej `jobId null` + wiersz „do przejrzenia” „Przychód bez zlecenia: <inwestor>, <miesiąc>”.

- [ ] **Step 1: Testy** na skoroszycie zbudowanym w teście przez exceljs (dane syntetyczne): 3 przychody (bez faktury; VAT 8%; „V” zwrot) i 2 koszty + 1 miesiąc KPiR → próba zwraca liczby i nic nie zapisuje; `?naprawde=1` zapisuje; przychód VAT 8% ma netto z `rozbij`; inwestor = nazwa istniejącego klienta z jednym zleceniem Rekuperacji → `jobId` ustawione; nieznany inwestor → do przejrzenia; drugi import → 409 i liczba wierszy bez zmian.
- [ ] **Step 2:** uruchom → FAIL.
- [ ] **Step 3:** Implementacja.
- [ ] **Step 4:** `pnpm -r test` → PASS.
- [ ] **Step 5:** Commit „Finanse: przeniesienie z arkusza”.

### Task 4: Web: ekran Finanse (Przychody, Koszty, import KPiR, przeniesienie w Ustawieniach)

**Files:**
- Create: `web/src/features/finanse/{Finanse.tsx,Przychody.tsx,Koszty.tsx,RevenueForm.tsx,KpirImport.tsx,model.ts,model.test.ts}`
- Modify: `web/src/routes.tsx` (ekran `fin`: „Finanse”, ikona `Coins`, `admin: true`, w menu po „Zadania”), `web/src/features/ustawienia/` (sekcja „Finanse z arkusza” wzorem `Import.tsx` + etykieta słownika „Kategorie kosztów” + przełącznik „Dodawaj przychód automatycznie” i „Domyślny sposób” – `/api/settings/finanse`), etykiety encji w synchronizacji web, jeśli lista encji jest jawna (`core/sync.ts`/`store.ts`).

**Interfaces:**
- Consumes: API z Task 2–3, `SPOSOBY/SPOSOB_LABEL/rozbij` z Task 1.
- Produces: `RevenueForm({ revenue?: Rec; prefill?: Partial<Rec>; onClose: () => void })` (używany w Task 5); `model.ts`: `sumaMiesiaca(rows: Rec[], miesiac: string): number`, `rozliczoneBezPrzychodu(jobs: Rec[], revenues: Rec[]): Rec[]` (zlecenia ze statusem „Rozliczone” bez żadnego przychodu).
- Wygląd: Segmented „Przychody | Koszty”; pasek: szukaj, miesiąc (`<input type="month">`, domyślnie bieżący, opcja „Cały rok”), filtr branż (Przychody) / kategorii (Koszty), „+ Przychód” / „+ Koszt” i „Importuj miesiąc z KPiR” po prawej. Przychody (komputer, tabela z sortowaniem): Br. (CatTab), Zlecenie (numer – link `#zl/<id>`), Klient, Miejscowość, Sposób, Kwota, Netto, Nr faktury, Miesiąc; pod tabelą „Razem netto” wybranego okresu. Linia „Rozliczone bez przychodu: N” → rozwija listę z przyciskiem „Dodaj przychód” (otwiera `RevenueForm` z prefill). Koszty: Data, Nr dok., Kontrahent, Opis, Kategoria, Netto, Kol. KPiR, Do wyniku; szybkie dodawanie u góry (opis, kwota, kategoria, Enter); suma okresu. Telefon: karty.
- `RevenueForm`: kwota, Segmented sposobu, na żywo „Netto … · VAT …” z `rozbij`, data zakończenia, „Inny miesiąc” (opcjonalnie), nr faktury, materiały (szacunek), kategoria, klient/miejscowość/opis (z prefill, edytowalne), uwagi; „Zapisz przychód”.
- `KpirImport`: wybór pliku `.json` → próba → podsumowanie („Nowe pozycje: N, pominięte duplikaty: M” + tabela sum kol. 12–15 plik vs KPiR, różnica ≠ 0 na czerwono) → „Zapisz”.

- [ ] **Step 1: Testy `model.test.ts`:** `rozliczoneBezPrzychodu` zwraca zlecenie „Rozliczone” bez przychodu, pomija z przychodem i „Zakończone”; `sumaMiesiaca` liczy tylko dany miesiąc i pomija usunięte.
- [ ] **Step 2:** FAIL → **Step 3:** implementacja → **Step 4:** `pnpm -r test`, `pnpm -r build`, `pnpm --filter web size` (start ≤ 150 kB, całość ≤ 500 kB – ekran lazy) → PASS.
- [ ] **Step 5:** Commit „Finanse: ekran Przychody i Koszty, import KPiR”.

### Task 5: Web: okienko „Przychód ze zlecenia” przy „Rozliczone” + e2e

**Files:**
- Modify: `web/src/features/zlecenia/JobForm.tsx`
- Create: `web/e2e/finanse.spec.ts`

**Interfaces:**
- Consumes: `RevenueForm` (Task 4), `/api/settings/finanse`, `rozbij`.
- Zachowanie: po zapisie formularza zlecenia, gdy status zmienił się na „Rozliczone” (shortcut: porównanie nazwy jak `jobStatusFromLead`; komentarz `shortcut:` w kodzie) i zlecenie nie ma przychodu: jeśli `autoPrzychod` i zlecenie z leada z `wartoscGr` → od razu `createVia('revenues', …)` z `domyslnySposob` i toast „Dodano przychód <kwota>” z akcją „Popraw” (otwiera `RevenueForm`); inaczej otwiera `RevenueForm` z prefill (jobId, kategoria, klient, miejscowość, opis = rodzaj + kategoria, kwota z leada, dzien = dziś) i przyciskiem „Pomiń”. Zlecenie z przychodem → nic.

- [ ] **Step 1: e2e `finanse.spec.ts`** (oba projekty): admin zmienia status zlecenia na „Rozliczone” → okienko „Przychód ze zlecenia” → kwota „12 300”, „Faktura VAT 23%” → widać „Netto 10 000,00 zł · VAT 2 300,00 zł” → Zapisz → w Finanse → Przychody wiersz z numerem zlecenia; ponowna zmiana na „W realizacji” i z powrotem na „Rozliczone” → brak okienka; import KPiR: plik syntetyczny (2 pozycje) → „Nowe pozycje: 2” → Zapisz → 2 wiersze; ten sam plik ponownie → „Nowe pozycje: 0, pominięte duplikaty: 2”; pracownik: brak „Finanse” w menu, `#fin` → „Brak dostępu”.
- [ ] **Step 2:** uruchom → FAIL → **Step 3:** implementacja → **Step 4:** pełne `npx playwright test --trace off` + `pnpm -r test` → PASS.
- [ ] **Step 5:** Commit „Finanse: przychód przy statusie Rozliczone, e2e”.

---

Po Task 5: przegląd całości, wydanie na produkcję **po zgodzie właściciela** (nowy moduł + migracja 0025), potem właściciel wgrywa arkusz w Ustawieniach (najpierw próba).
