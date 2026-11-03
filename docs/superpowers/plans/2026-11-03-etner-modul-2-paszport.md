# ETNER moduł 2 – cyfrowy paszport instalacji: plan wdrożenia

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teczki instalacji per obiekt i kategoria (urządzenia, karta serwisowa, dokumenty, zdjęcia), paszport z linkiem publicznym, stroną klienta i naklejką QR, następny serwis z przypomnieniami.

**Architecture:** Nowy moduł serwera `paszport` (wzorzec `ModuleDef` jak `samochody`/`zakupy`: tabele, `visibleTo`, trasy z `runOp`, `recordChange`, cron) + ekrany web w `web/src/features/paszport/`. Teczka = (obiekt, kategoria) liczona z danych zleceń; wiersz w `passport_folders` dopiero przy pierwszym zapisie. Strona klienta renderowana przez serwer jako HTML (bez bundla aplikacji). Naklejka generowana w telefonie (canvas + biblioteka `qrcode` ładowana tylko na ekranie naklejki).

**Tech Stack:** jak moduł 1: Hono, better-sqlite3 + Drizzle (migracje `pnpm --filter @etner/server db:generate`), zod 4, React 18, własny store + outbox, Tailwind v4, Phosphor, Vitest, Playwright (Chromium w /opt/pw-browsers, nigdy `playwright install`). Nowa zależność web: `qrcode` (+ `@types/qrcode`).

**Spec:** `docs/superpowers/specs/2026-10-29-etner-modul-2-paszport-design.md` (rozstrzygnięcia P1–P15). Zasady wspólne: `.superpowers/sdd/2026-10-20-etner-modul-1/global-constraints.md`.

## Global Constraints

- Produkcja z prawdziwymi danymi: migracje wyłącznie dodające (nowe tabele / kolumny z wartością domyślną), żadnych zmian istniejących kolumn.
- Każdy zapis osiągalny z kolejki offline idzie przez `runOp(db, opId, userId, fn)` i `recordChange`; usuwanie miękkie i idempotentne (ponowne usunięcie = 200).
- Widoczność synchronizacji: domyślnie tylko admin; pracownik nie dostaje `notatka_rozliczenie` ani załączników `typ_dok = 'faktura'` (snapshot, changes, SSE).
- Numer paszportu: `PSZ-RRRR-NNN` (rok utworzenia, kolejny w roku, 3 cyfry).
- Strona klienta: tylko elementy `dla_klienta`; bez kwot, faktur (chyba że oznaczone), notatek, nazwisk pracowników („technik ETNER”); `noindex`; limit zapytań na IP; pliki tylko przez krótkie podpisane linki.
- Naklejka: rozmiary 50×30 mm (domyślny), 60×40 mm i 100×50 mm; obraz PNG w 203 dpi (drukarka właściciela: Niimbot B4, druk termiczny do 104 mm) – 50×30 = 400×240 px, 60×40 = 480×320 px, 100×50 = 800×400 px; wybór rozmiaru zapamiętany na urządzeniu.
- Domyślny cykl serwisu (miesiące): Rekuperacja 6, Klimatyzacja 12, Fotowoltaika 12, pozostałe brak.
- Przypomnienia e-mail klientowi: 30 i 7 dni przed `nastepny_serwis`, o 7:00 Europe/Warsaw, każde raz na dany termin; brak e-maila klienta / SMTP = pominięcie + jeden `logError` dziennie.
- Polskie teksty interfejsu; testy, budowanie i rozmiar JS (`pnpm --filter @etner/web size`) muszą przechodzić; wydanie na produkcję po każdej części (2a, 2b, 2c).
- Bez nazw modeli w commitach; stopka commitów jak w module 1.

## Review Focus

1. Zmiana kategorii lub obiektu zlecenia po dodaniu zdjęć – zdjęcia mają wędrować z nim do nowej teczki, bez „zgubionych” plików (Task 2: test).
2. Obiekt bez paszportu, ale z serwisem – przypomnienie i lista „Do serwisu” muszą działać (P15; Task 8: test).
3. Pracownik offline dodaje wpis serwisowy do teczki, która nie ma jeszcze wiersza `passport_folders` – zapis ma utworzyć wiersz bez duplikatu przy powtórce z kolejki (Task 3: test idempotencji przy jednoczesnym tworzeniu teczki).
4. Unieważniony / nieistniejący token i nadużycia strony klienta (zgadywanie tokenów, wielokrotne odświeżanie) – stała strona „nieaktywny”, 429 po limicie, brak wycieku istnienia innych paszportów (Task 6: testy).
5. Klient z kilkoma obiektami i obiekt z kilkoma zleceniami tej samej kategorii (montaż + 2 serwisy) – jedna teczka, wszystkie zlecenia i zdjęcia w niej (Task 2: test).

---

## Część 2a – teczki w aplikacji

### Task 1: Dane modułu `paszport` i słownik czynności

**Files:**
- Create: `server/src/modules/paszport/{schema.ts,service.ts,routes.ts,index.ts,paszport.test.ts}`, `shared/src/schemas/paszport.ts`
- Modify: `server/src/modules/index.ts` (rejestracja), `server/src/modules/dziennik/schema.ts` (kolumna `typ_dok`), `server/src/modules/slowniki/{schema.ts,seed.ts}` (kolumna `kategoria` w `dict`, rodzaj `czynnosc_serwisowa`), `shared/src/stale.ts` (`DICT_RODZAJE` + `czynnosc_serwisowa`), `server/drizzle/*` (wygenerowana migracja)

**Interfaces:**
- Produces:
  - tabele `passports(site_id, numer, token, token_at)`, `passport_folders(site_id, kategoria, nastepny_serwis, cykl_mies, przypomnienia, wyslano_30_dla, wyslano_7_dla, notatka_rozliczenie)`, `devices(folder_id, nazwa, producent, model, nr_seryjny, montaz, job_id, gwarancja_do, uwagi, dla_klienta)`, `service_entries(folder_id, dzien, job_id, czynnosci JSON string[], uwagi, author_id, dla_klienta)`; unikalność aktywnych: `passports.site_id`, `passport_folders(site_id, kategoria)`.
  - `attachments.typ_dok: 'faktura'|'projekt'|'oferta'|'instrukcja'|'inne'|null`; `owner_type` przyjmuje też `'teczka'`.
  - `service.ensureFolder(db, by, siteId, kategoria): FolderRow` (tworzy w tej samej transakcji, zwraca istniejący), `defaultCycle(kategoria): number|null`.
  - słownik `czynnosc_serwisowa` z polem `kategoria`; seed robocze wg spec P11.

- [ ] **Step 1: Test** `paszport.test.ts`: `ensureFolder` dwa razy (także przez dwa `runOp` z różnymi `opId`) → jeden wiersz; `defaultCycle('Rekuperacja') === 6`, `('Elektryka') === null`; seed `czynnosc_serwisowa` zawiera „Wymiana filtrów F7” z `kategoria = 'Rekuperacja'`; zmiana nazwy kategorii w słowniku zmienia `passport_folders.kategoria` (DictRefs).
- [ ] **Step 2:** Uruchom `pnpm --filter @etner/server test -- paszport` → FAIL.
- [ ] **Step 3:** Implementacja + `db:generate` (sprawdź, że SQL tylko dodaje).
- [ ] **Step 4:** Testy → PASS; `pnpm -r test`.
- [ ] **Step 5:** Commit.

### Task 2: Teczki z danych zleceń (serwer + synchronizacja)

**Files:**
- Modify: `server/src/modules/paszport/{service.ts,routes.ts,index.ts,paszport.test.ts}`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `GET /api/sites/:id/teczki` → `{ kategoria, folder?: FolderRow, jobIds: string[], photos: number, docs: number, nastepnySerwis?: string }[]` (kategorie zleceń obiektu ∪ istniejące `passport_folders`; zlecenia nieusunięte).
  - `visibleTo` dla `passports`, `passport_folders` (pracownik bez `notatka_rozliczenie`), `devices`, `service_entries`; załączniki `typ_dok='faktura'` odfiltrowane dla pracownika w module `dziennik`.
  - `POST /api/folders` `{opId, siteId, kategoria}` (ręczne „Dodaj teczkę”), `PUT /api/folders/:id` `{opId, nastepnySerwis?, cyklMies?, przypomnienia?, notatkaRozliczenie? (admin)}`.

- [ ] **Step 1: Testy:** obiekt z montażem i dwoma serwisami Rekuperacji + zlecenie Elektryki → dwie teczki, Rekuperacja ma 3 `jobIds`; zmiana kategorii zlecenia przenosi jego `jobId` i licznik zdjęć do innej teczki; pracownik w snapshot/changes nie dostaje `notatkaRozliczenie` ani załącznika faktury; `PUT` z `notatkaRozliczenie` przez pracownika → 403.
- [ ] **Step 2:** FAIL. **Step 3:** Implementacja. **Step 4:** PASS. **Step 5:** Commit.

### Task 3: Urządzenia, karta serwisowa, dokumenty teczki (serwer)

**Files:**
- Modify: `server/src/modules/paszport/{service.ts,routes.ts,paszport.test.ts}`, `server/src/modules/dziennik/routes.ts` (przypięcie przesłanego pliku do `owner_type` `teczka`/`device`/`service`)

**Interfaces:**
- Consumes: Task 1–2; istniejące `POST /api/uploads` (zwraca id przesłanego pliku).
- Produces:
  - `POST /api/devices` `{opId, siteId, kategoria, nazwa, producent?, model?, nrSeryjny?, montaz?, jobId?, gwarancjaDo?, uwagi?, dlaKlienta}`; `PUT/DELETE /api/devices/:id` (admin i autor).
  - `POST /api/service-entries` `{opId, siteId, kategoria, dzien, jobId?, czynnosci: string[], uwagi?, dlaKlienta, nastepnySerwis?, uploadIds?: string[]}` – tworzy teczkę jeśli brak (`ensureFolder`) i ustawia `nastepny_serwis` w tej samej transakcji; `PUT/DELETE /api/service-entries/:id` (admin i autor).
  - `POST /api/folder-files` `{opId, siteId, kategoria, uploadId, typDok, dlaKlienta}` (faktura tylko admin).

- [ ] **Step 1: Testy:** wpis serwisowy do obiektu bez teczki tworzy teczkę i ustawia `nastepny_serwis`; powtórka tego samego `opId` → bez duplikatu; dwa różne `opId` dla tej samej (obiekt, kategoria) → jedna teczka; pracownik nie może dodać `typDok='faktura'` (403) ani usunąć cudzego wpisu (403); usunięcie wpisu usuwa jego załączniki miękko.
- [ ] **Step 2:** FAIL. **Step 3:** Implementacja. **Step 4:** PASS. **Step 5:** Commit.

### Task 4: Ekrany teczek (web) i integracja z klientem, zleceniem i dziennikiem

**Files:**
- Create: `web/src/features/paszport/{Paszport.tsx,Teczka.tsx,WpisSerwisowy.tsx,Urzadzenie.tsx,model.ts,model.test.ts}`
- Modify: `web/src/routes.tsx` (`#psz/<siteId>/<kategoria>`), `web/src/features/klienci/Klienci.tsx` (sekcja „Paszport instalacji” na obiekt), `web/src/features/zlecenia/JobCard.tsx` (przycisk „Paszport → <kategoria>”, podpowiedź „Dodaj wpis do karty serwisowej” dla rodzaju „serwis”), `web/src/features/dziennik/Diary.tsx` (przełącznik „W paszporcie dla klienta”, typ dokumentu dla plików), `web/src/features/ustawienia/*` (słownik czynności z kategorią), `web/src/core/write.ts` (`TMP_ENTITIES`), `web/e2e/paszport.spec.ts`

**Interfaces:**
- Consumes: Task 2–3 (trasy, encje `passports`, `passport_folders`, `devices`, `service_entries`, `attachments`).
- Produces: `teczkiObiektu(jobs, folders, attachments, siteId) → Teczka[]` w `model.ts` (to samo grupowanie co serwer – podstawa ekranów offline).

- [ ] **Step 1: Testy:** `model.test.ts` – grupowanie zleceń/zdjęć w teczki jak w Task 2; e2e (telefon i komputer): z karty klienta → teczka Rekuperacja; „+ Wpis” offline (`context.setOffline(true)`), odhaczenie dwóch czynności, „+6 mies.” → wpis widoczny, po powrocie sieci zapisany; ze zlecenia „Paszport → Rekuperacja” otwiera tę teczkę; w dzienniku przełącznik „W paszporcie dla klienta” zmienia `dla_klienta`; pracownik nie widzi sekcji faktur i rozliczenia.
- [ ] **Step 2:** FAIL. **Step 3:** Implementacja wg makiet 1, 2, 3, 6. **Step 4:** PASS (`pnpm -r test`, `pnpm -r build`, e2e, size, a11y na nowych ekranach). **Step 5:** Commit. **Wydanie 2a na produkcję.**

## Część 2b – paszport dla klienta

### Task 5: Paszport, numer, link publiczny, dane firmy (serwer)

**Files:**
- Modify: `server/src/modules/paszport/{service.ts,routes.ts,paszport.test.ts}`, `server/src/modules/slowniki` lub `core/settings` (klucze `firma_nazwa`, `firma_telefon`, `firma_email`, `firma_www`)

**Interfaces:**
- Produces:
  - `POST /api/passports` `{opId, siteId}` → `{id, numer}` (pracownik i admin; drugi na ten sam obiekt → zwraca istniejący).
  - `POST /api/passports/:id/link` (admin) → `{url}`; token 32 bajty losowe (base64url); nowe wywołanie unieważnia poprzedni (stare naklejki przestają działać).
  - Token zapisany w `passports.token` (jawnie, nie skrót – rozstrzygnięcie R65: naklejkę trzeba móc wydrukować ponownie bez unieważniania starych; baza i tak zawiera dane, które link pokazuje). `passports` w synchronizacji: admin i pracownik dostają `token`, więc naklejkę da się zrobić offline. Pierwszy link tworzy się automatycznie przy zakładaniu paszportu.
  - `GET/PUT /api/settings/firma` (PUT admin).

- [ ] **Step 1: Testy:** numeracja `PSZ-2026-001`, `-002`, w nowym roku od `001`; drugi `POST /api/passports` dla obiektu → ten sam numer; nowy link unieważnia stary (stary token → nieaktywny w Task 6); pracownik `POST link` → 403; założenie paszportu tworzy od razu link.
- [ ] **Step 2:** FAIL. **Step 3:** Implementacja. **Step 4:** PASS. **Step 5:** Commit.

### Task 6: Strona klienta `/p/:token`

**Files:**
- Create: `server/src/modules/paszport/public.ts` (render HTML), `server/src/modules/paszport/public.test.ts`
- Modify: `server/src/modules/paszport/routes.ts`, `server/src/app.ts` (CSP dla tej trasy: bez skryptów)

**Interfaces:**
- Consumes: Task 1–5, `files.url(key, ttl)` (podpisane linki).
- Produces: `GET /p/:token` → HTML (makieta 5): nagłówek z logo i danymi firmy, baner serwisu (`tel:`, `mailto:` z numerem paszportu), zakładki teczek jako sekcje z kotwicami (bez JS), urządzenia, historia serwisu (tylko `dla_klienta`), dokumenty i zdjęcia (podpisane linki 1 h); `X-Robots-Tag: noindex`; limit 60 zapytań/min na IP → 429.

- [ ] **Step 1: Testy:** treść zawiera tylko elementy `dla_klienta` (wpis wewnętrzny, faktura, notatka rozliczenia, nazwisko autora – nieobecne); unieważniony i losowy token → 200 ze stroną „Ten kod nie jest już aktywny” i telefonem firmy (ta sama odpowiedź dla obu); 61. zapytanie z jednego IP w minucie → 429; nagłówek `noindex`; HTML escapuje dane klienta (`<script>` w nazwie klienta nie wykonuje się).
- [ ] **Step 2:** FAIL. **Step 3:** Implementacja. **Step 4:** PASS. **Step 5:** Commit.

### Task 7: Naklejka QR i ekran paszportu (web)

**Files:**
- Create: `web/src/features/paszport/{Naklejka.tsx,naklejka.ts,naklejka.test.ts}`
- Modify: `web/package.json` (`qrcode`, `@types/qrcode`), `web/src/features/paszport/Paszport.tsx` („Załóż paszport”, „Kod QR i naklejka”, „Podgląd klienta”), `web/src/features/ustawienia/*` (dane firmy), `web/e2e/paszport.spec.ts`

**Interfaces:**
- Consumes: Task 5 (`POST /api/passports`, `POST /api/passports/:id/link`, dane firmy).
- Produces: `LABEL_SIZES = { '50x30': [400,240], '60x40': [480,320], '100x50': [800,400] }`; `drawLabel(canvas, size, {url, numer, klient, firma}) → void` (piksele z `LABEL_SIZES`; QR po lewej ~300 px, po prawej logo, „ETNER”, „Paszport instalacji”, numer, nazwisko, telefon, www); `labelBlob(): Promise<Blob>`; przyciski „Udostępnij obraz” (`navigator.share({files})`, gdy `canShare`), „Pobierz obraz”, „Drukuj” (`@page` 50×30 mm), „Arkusz A4” (siatka naklejek do druku), „Unieważnij link i utwórz nowy” (admin, potwierdzenie).

- [ ] **Step 1: Testy:** `naklejka.test.ts` – wymiary każdego rozmiaru z `LABEL_SIZES`; QR zdekodowany z wygenerowanego obrazu = `url` (dekoder w teście: `jsqr` jako devDependency albo porównanie macierzy `QRCode.create(url)`); e2e: „Załóż paszport” → numer `PSZ-…`; „Kod QR i naklejka” pokazuje podgląd; „Pobierz obraz” zwraca PNG; link z naklejki otwiera stronę klienta.
- [ ] **Step 2:** FAIL. **Step 3:** Implementacja (biblioteka QR ładowana dynamicznie tylko na tym ekranie). **Step 4:** PASS, size w limicie startu. **Step 5:** Commit. **Wydanie 2b na produkcję.**

## Część 2c – serwis

### Task 8: Przypomnienia i lista „Do serwisu”

**Files:**
- Modify: `server/src/modules/paszport/{index.ts (cron),service.ts,routes.ts,paszport.test.ts}`
- Create: `web/src/features/paszport/DoSerwisu.tsx`
- Modify: `web/src/routes.tsx` (`#serwis`, admin, menu boczne/Więcej), `web/src/core/badges.ts` + `useBadges.ts` (licznik: teczki z `nastepny_serwis` ≤ dziś+30 dni), `web/e2e/paszport.spec.ts`

**Interfaces:**
- Produces:
  - cron `paszport-przypomnienia` `0 7 * * *` Europe/Warsaw: dla teczek z `przypomnienia=1` i `nastepny_serwis` = dziś+30 / dziś+7 (lub mniej, jeśli przegapione, ale > dziś) wysyła e-mail na pierwszy e-mail klienta i zapisuje `wyslano_30_dla` / `wyslano_7_dla = nastepny_serwis`.
  - `POST /api/folders/:id/zlecenie-serwisowe` `{opId}` (admin) → nowe zlecenie: klient i obiekt teczki, kategoria, rodzaj „serwis”, termin = miesiąc `nastepny_serwis`, pierwszy status otwarty.
  - Ekran „Do serwisu”: zaległe + 30 dni, posortowane; akcje „Zrób zlecenie serwisowe”, „Przesuń termin”, „Zadzwoń”.

- [ ] **Step 1: Testy:** e-mail 30 dni wysłany raz (drugi przebieg crona – nic), 7 dni osobno; zmiana `nastepny_serwis` po wysyłce → nowy termin dostaje nowe przypomnienia; brak e-maila klienta / mailera → bez wysyłki, `logError`; obiekt bez paszportu też dostaje (P15); `przypomnienia=0` → nic; „Zrób zlecenie serwisowe” tworzy zlecenie w tej teczce (Task 2 grupuje je do niej); licznik menu; e2e: lista i przycisk.
- [ ] **Step 2:** FAIL. **Step 3:** Implementacja (treść e-maila po polsku z danymi firmy i linkiem do paszportu, jeśli istnieje). **Step 4:** PASS. **Step 5:** Commit. **Wydanie 2c na produkcję.** Końcowy przegląd całego modułu 2.
