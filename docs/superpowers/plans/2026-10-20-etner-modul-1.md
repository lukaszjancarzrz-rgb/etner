# ETNER moduł 1 (fundament + dzisiejsze funkcje) – plan wdrożenia

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nowa aplikacja ETNER (serwer + PWA) z fundamentem pod wszystkie moduły oraz funkcjami dzisiejszej aplikacji (bez Pumble), z kartą klienta, przeniesieniem danych i kopiami.

**Architecture:**
- Monorepo z trzema pakietami: `server` (Hono + SQLite/Drizzle), `web` (React + Vite PWA) i `shared` (schematy Zod, formaty).
- Każdy moduł biznesowy to osobny folder po stronie serwera i ekranów, korzystający tylko z `core`, `shared` i publicznych funkcji innych modułów.
- Zmiany idą przez tabelę `changes`: telefon pobiera je od ostatniego numeru i słucha SSE. Zapisy z telefonu niosą `opId`, więc nie ma dubli.

**Tech Stack:** Node 22, pnpm, TypeScript 5, Hono, better-sqlite3, Drizzle ORM + drizzle-kit, Zod, web-push, sharp, @aws-sdk/client-s3, googleapis, node-cron, React 18, Vite, TanStack Query (+ persist w IndexedDB przez idb-keyval), React Router, Tailwind + shadcn/ui (Radix), vite-plugin-pwa, Phosphor Icons, Vitest, Playwright.

**Spec:**
- `docs/superpowers/specs/2026-10-20-etner-aplikacja-design.md` (całość)
- `docs/superpowers/specs/2026-10-20-etner-modul-1-design.md` (moduł 1)

## Global Constraints

- Język interfejsu: polski, formy męskie (w firmie nie ma kobiet). Komunikaty konkretne, bez wykrzykników.
- Strefa czasu dni: `Europe/Warsaw`. Dzień zapisujemy jako `YYYY-MM-DD`, chwile jako ISO UTC.
- Kwoty: liczba całkowita w groszach (`netto_gr`) + `vat` (np. 23, 8, 0, `zw`). Brutto tylko wyliczane.
- Każda tabela ma `id` (text, ULID), `created_at`, `created_by`, `updated_at`, `deleted_at`. Usuwanie zawsze miękkie. Tabele firmowe (`clients`, `leads`, `jobs`) mają `firma_id`.
- Uprawnienia sprawdza tylko serwer, wyłącznie przez `core/permissions.ts`. Role: `pracownik`, `admin`; uprawnienie `finanse` (pod moduły 3–4).
- Pracownik nigdy nie dostaje: leadów, `jobs.uwagi_admin`, zadań, szkiców harmonogramu, list innych ekip w „na jutro”.
- Załączniki: domyślnie `dla_klienta = false`.
- Moduły nie czytają cudzych tabel, tylko publiczne funkcje (`service.ts`).
- Zdjęcia z telefonu: dłuższy bok 2560 px, JPEG q≈0.85. Serwer robi podgląd 1600 px i miniaturę 320 px (WebP).
- Pliki i bucket R2 testowy osobno od produkcyjnego. Brak konfiguracji R2 → magazyn na dysku (`DATA_DIR/files`).
- Repozytorium bez prawdziwych danych klientów. Dane przykładowe tylko wymyślone.
- Wygląd: tokeny z projektu całości (Archivo, `#f2f5f8`, `#0a2240`, `#3f5368`, `#d3dce5`, `#0070ab`, `#00736b`, tryb ciemny `#0a2240`/`#102e52`), ikony Phosphor, `prefers-reduced-motion`.
- Commity kończą się:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01UAcYpC7hiQ88s85djQuEMk`
- Nie wpisywać haseł ani kluczy za właściciela. Klucze (R2, Render, VAPID, konto usługi Google) wkleja właściciel jako sekrety.

## Zmiana 2026-10-21: login i hasło zamiast linków

Decyzja właściciela po zadaniu 18: logowanie loginem (imię lub krótka nazwa) i hasłem zamiast osobistych linków. Hasło startowe nadaje admin, pracownik może je zmienić sam, reset przez admina wylogowuje wszystkie urządzenia. Sesja na urządzeniu (cookie `etner_s`, 180 dni) bez zmian. Wykonuje to zadanie 18a. Wzmianki o linkach i tokenach linków w zadaniach 4, 8, 16, 18, 19, 22 i 23 czytać jako login i hasło.

## Review Focus

1. **Kolejka offline po zamknięciu aplikacji.** Zapisy zrobione bez zasięgu, a potem zamknięcie aplikacji: po ponownym otwarciu muszą się wysłać, każdy dokładnie raz. Test w zadaniu 17.
2. **Wyciek danych przez SSE / `changes`.** Pracownik nie może dostać zmiany leada, uwag admina ani szkicu harmonogramu, także przy pobieraniu „od numeru”. Test w zadaniu 5 i w każdym module (`visibleTo`).
3. **Przełom doby i zmiana czasu.** Wpis dodany o 23:30 czasu polskiego trafia do właściwego dnia. Ostatnia niedziela marca i października nie przesuwa dni harmonogramu. Test w zadaniu 2.
4. **Dwóch adminów edytuje tę samą komórkę harmonogramu.** Zatwierdzenie bierze tylko szkice, które admin widział (wartość „będzie” musi się zgadzać). Szkic zmieniony w międzyczasie zostaje do zatwierdzenia. Test w zadaniu 14.
5. **Sesja wygasła lub hasło zresetowane, gdy telefon był offline.** Zapisy z kolejki dostają 401, aplikacja pokazuje „Zaloguj się ponownie”, a kolejka zostaje (nie jest kasowana). Test w zadaniu 17.

---

## Kroki właściciela (poza kodem)

- **O1** (przed zadaniem 1): utworzyć **prywatne** repozytorium GitHub `etner` i dać znać. Podłączę je do sesji.
- **O2** (przed zadaniem 18): założyć konto Render (darmowe) i połączyć je z repozytorium. Założyć konto Cloudflare z bucketem R2 `etner-test` i wkleić klucze w Render jako zmienne.
- **O3** (przed zadaniem 22): eksport danych do przeniesienia: kopia Firma_2026 jako xlsx, baza „ETNER Aplikacja – dane” jako xlsx, dostęp do folderu zdjęć. Firestore eksportuję sam przez REST tylko do odczytu, kluczem, który wkleisz.
- **O4** (przed zadaniem 23): konto Hetzner Cloud, bucket R2 `etner-prod` i `etner-backup`, domena albo subdomena (np. `app.etner-instalacje.pl`).

---

## Struktura plików

```
package.json, pnpm-workspace.yaml, tsconfig.base.json, .github/workflows/ci.yml, render.yaml, README.md
shared/src/  money.ts · dates.ts · holidays.ts · ids.ts · schemas/<moduł>.ts · index.ts
server/src/
  app.ts                      tworzy Hono, rejestruje moduły, serwuje web/dist
  main.ts                     start (port, migracje, seed w trybie demo, cron)
  core/db.ts                  połączenie, transakcja tx(), migracje
  core/schema-base.ts         kolumny wspólne, tabele: firmy, users, sessions, changes, op_ids, push_subscriptions
  core/changes.ts             recordChange(), changesSince(), stream
  core/ops.ts                 runOp()
  core/auth.ts                login linkiem, sesje, middleware
  core/permissions.ts         can(), visibleTo rejestr
  core/files.ts               FileStore (R2 / dysk), warianty zdjęć
  core/notify.ts              notify(), web-push
  core/cron.ts                rejestr zadań w tle
  core/registry.ts            ModuleDef i rejestracja modułów
  modules/<moduł>/  schema.ts · service.ts · routes.ts · <moduł>.test.ts
  scripts/ seed-demo.ts · export-sheets.ts · migrate-old/ (zadanie 22)
web/src/
  main.tsx · App.tsx · routes.tsx · theme.css
  core/ api.ts · sync.ts · outbox.ts · session.ts · store.ts · layout/ · ui/ (shadcn)
  features/<moduł>/ ekrany i komponenty
web/e2e/ testy Playwright
```

Moduły (serwer i web): `slowniki`, `uzytkownicy`, `klienci`, `leady`, `zlecenia`, `dziennik`, `harmonogram`, `na-jutro`, `zakupy`, `zadania`.

---

### Task 1: Szkielet repozytorium i CI

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `shared/package.json`, `server/package.json`, `web/package.json`, `.github/workflows/ci.yml`, `README.md`, `.gitignore`, `server/src/app.ts`, `server/src/main.ts`, `server/src/app.test.ts`

**Interfaces:**
- Produces: `createApp(deps: AppDeps): Hono` w `server/src/app.ts`; `GET /api/health` → `{ ok: true, version: string }`. Skrypty: `pnpm test` (vitest we wszystkich pakietach), `pnpm build`, `pnpm dev`.

- [ ] **Step 1: Test** `app.test.ts › health`: `await createApp(testDeps()).request('/api/health')` → status 200, `json.ok === true`.
- [ ] **Step 2:** Uruchom `pnpm -r test` → FAIL (brak `createApp`).
- [ ] **Step 3:** Workspace pnpm. TS strict, `module: NodeNext`. `createApp` z trasą health. `main.ts` uruchamia `@hono/node-server` na `PORT` (domyślnie 3000). `.gitignore`: `node_modules`, `dist`, `data/`, `*.db`, `.env*`. CI: Node 22, `pnpm install --frozen-lockfile`, `pnpm -r test`, `pnpm -r build`.
- [ ] **Step 4:** `pnpm -r test` → PASS.
- [ ] **Step 5:** Commit „Szkielet: monorepo, health, CI”.

### Task 2: `shared` – kwoty, daty, święta, identyfikatory

**Files:**
- Create: `shared/src/money.ts`, `dates.ts`, `holidays.ts`, `ids.ts`, `index.ts`, `shared/src/*.test.ts`

**Interfaces:**
- Produces:
  - `toGr(text: string): number` – przyjmuje „1 234,56”, „1234.5”, „1234”.
  - `fmtZl(gr: number): string` – „1 234,56 zł”.
  - `brutto(nettoGr: number, vat: number | 'zw'): number`.
  - `dayOf(instant: Date | string): string` – dzień w Europe/Warsaw.
  - `addDays(day: string, n: number): string`.
  - `mondayOf(day: string): string`.
  - `plHolidays(year: number): Record<string, string>` – nazwy jak w arkuszu Parametry.
  - `isWorkday(day: string, extraOff: string[]): 0 | 1 | 2` – 2 = święto, 0 = weekend.
  - `newId(): string` – ULID.

- [ ] **Step 1: Testy:**
  - `toGr('1 234,56') === 123456`; `fmtZl(123456) === '1 234,56 zł'` (z twardą spacją jak `Intl` pl-PL).
  - `brutto(10000, 23) === 12300`; `brutto(10000, 'zw') === 10000`.
  - `dayOf('2026-10-20T22:30:00Z') === '2026-10-21'`.
  - `dayOf('2026-03-29T00:30:00Z') === '2026-03-29'`.
  - `addDays('2026-03-28', 1) === '2026-03-29'`; `addDays('2026-10-24', 2) === '2026-10-26'`.
  - `plHolidays(2026)` zawiera dokładnie 14 dat:
    - 01-01 „Nowy Rok”, 01-06 „Trzech Króli”,
    - 04-05 „Wielkanoc (niedziela)”, 04-06 „Poniedziałek Wielkanocny”,
    - 05-01 „Święto Pracy”, 05-03 „Święto Konstytucji 3 Maja”,
    - 05-24 „Zielone Świątki (niedziela)”, 06-04 „Boże Ciało”,
    - 08-15 „Wniebowzięcie NMP”, 11-01 „Wszystkich Świętych”,
    - 11-11 „Narodowe Święto Niepodległości”,
    - 12-24 „Wigilia (dzień wolny od 2025 r.)”,
    - 12-25 „Boże Narodzenie – 1. dzień”, 12-26 „Boże Narodzenie – 2. dzień”.
  - `plHolidays(2027)['2027-03-28'] === 'Wielkanoc (niedziela)'`.
  - `isWorkday('2026-05-01', []) === 2`; `isWorkday('2026-10-24', []) === 0`; `isWorkday('2026-10-23', ['2026-10-23']) === 2`.
- [ ] **Step 2:** `pnpm --filter shared test` → FAIL.
- [ ] **Step 3:** Implementacja. Daty przez `Intl.DateTimeFormat('pl-PL', {timeZone:'Europe/Warsaw'})`, arytmetyka dni na UTC-noon. Wielkanoc: algorytm anonimowy gregoriański. ULID z pakietu `ulid`.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit.

### Task 3: Baza, kolumny wspólne, dziennik zmian, `opId`

**Files:**
- Create: `server/src/core/db.ts`, `core/schema-base.ts`, `core/changes.ts`, `core/ops.ts`, `core/registry.ts`, `server/drizzle.config.ts`, `server/src/core/core.test.ts`

**Interfaces:**
- Consumes: `newId`, `dayOf` (Task 2).
- Produces:
  - `openDb(file: string): Db` (better-sqlite3, WAL, `foreign_keys=ON`) + `migrate(db)`.
  - `tx<T>(db, fn: (t) => T): T`.
  - `baseCols()` – kolumny wspólne dla Drizzle.
  - tabele `firmy`, `users`, `sessions`, `push_subscriptions`, `changes(seq INTEGER PK AUTOINCREMENT, at, user_id, entity, entity_id, action('create'|'update'|'delete'), before JSON, after JSON)`, `op_ids(op_id PK, user_id, at, result JSON)`.
  - `recordChange(t, user, entity, id, action, before, after): number` – zwraca `seq`.
  - `changesSince(db, seq, limit): ChangeRow[]`.
  - `runOp<T>(db, opId: string | undefined, userId: string, fn: () => T): { result: T; dup: boolean }` – zapis wyniku w tej samej transakcji co zmiana.
  - Tabela `errors(at, where, message, user_id?)` + `logError(where, err, user?)`. Globalny `onError` Hono zapisuje tam błędy 5xx i zwraca `{error:'Błąd serwera – spróbuj ponownie.'}`. `GET /api/errors` (admin, ostatnie 200) – ekran w Task 19.
  - `type ModuleDef = { name: string; routes(app: Hono, deps: AppDeps): void; visibleTo?(user: User, ch: ChangeRow): boolean | ChangeRow; cron?: CronDef[] }`.
  - `registerModules(app, deps, defs: ModuleDef[])`.

- [ ] **Step 1: Testy:**
  - `recordChange` daje rosnące `seq`; `changesSince(db, 1, 100)` zwraca tylko późniejsze.
  - `runOp` z tym samym `opId` dwa razy: funkcja wykonana raz, drugi wynik `dup: true` i ten sam `result`.
  - Wyjątek w `fn`: brak wpisu w `op_ids` i brak zmian (rollback).
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementacja. Migracje generowane `drizzle-kit generate`, uruchamiane przez `migrate()` przy starcie.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit.

### Task 4: Logowanie linkiem, sesje, uprawnienia

**Files:**
- Create: `server/src/core/auth.ts`, `core/permissions.ts`, `server/src/core/auth.test.ts`

**Interfaces:**
- Consumes: Task 3.
- Produces:
  - `hashToken(t: string): string` (sha256 hex).
  - `POST /api/login {token}` → ustawia cookie `etner_s` (httpOnly, Secure w produkcji, SameSite=Lax, 180 dni), zwraca `Me = {id, name, role, perms: string[], ekipa, scheduleCol}`.
  - `POST /api/logout`.
  - Middleware `requireUser()` (401 `{error:'SESJA'}`) i `requireAdmin()` (403).
  - `can(user: User, perm: 'admin'|'finanse'|'leady'|'zadania'|'szkice'): boolean`.
  - `revokeUser(db, userId)` kasuje sesje.
  - Typ `User` w `shared/src/schemas/users.ts`.

- [ ] **Step 1: Testy:**
  - Dobry token → 200, cookie ustawione, `GET /api/me` zwraca użytkownika.
  - Zły token → 401.
  - Użytkownik `active=false` → 401.
  - Po `revokeUser` stara sesja → 401 `SESJA`.
  - Pracownik na trasie `requireAdmin` → 403.
  - `can(pracownik,'leady') === false`, `can(admin,'leady') === true`, `can(admin,'finanse') === perms.includes('finanse')`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementacja. Token w bazie tylko jako skrót.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit.

### Task 5: Synchronizacja – zmiany od numeru i SSE, filtrowane wg uprawnień

**Files:**
- Create: `server/src/core/sync.ts`, `server/src/core/sync.test.ts`

**Interfaces:**
- Consumes: `changesSince`, `ModuleDef.visibleTo`, `requireUser`.
- Produces:
  - `GET /api/changes?since=<seq>` → `{ changes: ChangeOut[], last: number }`. `ChangeOut = {seq, entity, id, action, data}`, gdzie `data` to rekord po zmianie, już przycięty dla użytkownika. Limit 500, wtedy `more: true`.
  - `GET /api/stream?since=<seq>` (SSE, zdarzenie `change`, ping co 25 s).
  - `GET /api/snapshot` → wszystkie widoczne rekordy + `last` (pierwsze uruchomienie).
  - `broadcast(seq)` wołane przez `recordChange` po commit.
  - `visibleTo` zwraca `false` (pomiń), `true` albo przyciętą kopię (np. bez `uwagi_admin`).

- [ ] **Step 1: Testy:**
  - Moduł testowy z `visibleTo = (u, ch) => u.role === 'admin'`: pracownik nie dostaje tej zmiany ani z `/changes`, ani w strumieniu; admin dostaje.
  - Przycinanie: pole `tajne` usunięte dla pracownika.
  - `since` większy niż ostatni → pusta lista.
  - 600 zmian → pierwsza odpowiedź 500 i `more: true`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementacja SSE przez `streamSSE` z `hono/streaming`. Lista podłączonych klientów w pamięci procesu.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit.

### Task 6: Pliki – R2 lub dysk, warianty zdjęć

**Files:**
- Create: `server/src/core/files.ts`, `server/src/core/files.test.ts`

**Interfaces:**
- Produces:
  - `interface FileStore { put(key, body: Buffer, type): Promise<void>; url(key, ttlSec=600): Promise<string>; get(key): Promise<Buffer> }`.
  - `r2Store(cfg)` (S3 z `endpoint` R2) i `diskStore(dir)` (URL `/api/files/<podpis>`).
  - `makeVariants(input: Buffer): Promise<{orig: Buffer, view: Buffer, thumb: Buffer, w: number, h: number}>` – view 1600 px WebP q80, thumb 320 px WebP q70, orig bez zmian, obrót wg EXIF.
  - `fileStoreFromEnv(env)` – R2 gdy są `R2_BUCKET`, `R2_ENDPOINT`, `R2_KEY`, `R2_SECRET`, inaczej dysk.

- [ ] **Step 1: Testy:**
  - `makeVariants` na JPEG 4000×3000 z EXIF orientation 6 → `thumb` WebP o dłuższym boku 320, `view` 1600, wymiary po obrocie (3000×4000 → pion).
  - `diskStore`: `put` + `url` + pobranie przez trasę → te same bajty; zmieniony podpis → 403.
  - PNG z przezroczystością nie wywala się.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementacja (sharp `.rotate()`). Podpis HMAC z `APP_SECRET`.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit.

### Task 7: Powiadomienia i zadania w tle

**Files:**
- Create: `server/src/core/notify.ts`, `core/cron.ts`, `server/src/core/notify.test.ts`

**Interfaces:**
- Produces:
  - `POST /api/push/subscribe {endpoint, keys:{p256dh,auth}, device}`; `POST /api/push/unsubscribe {endpoint}`; `GET /api/push/key` → klucz publiczny VAPID.
  - `notify(userIds: string[], n: {title, body, url, tag}): Promise<number>` – web-push z `TTL: 86400`, JSON w treści. Subskrypcje z odpowiedzią 404/410 usuwane.
  - `registerCron(defs: {name, cron: string, run(deps)}[])` (node-cron, strefa Europe/Warsaw). Zadanie `rano` odpala moduły o godzinie z ustawień.
  - Sender wstrzykiwany w `AppDeps.push` (w testach atrapa).

- [ ] **Step 1: Testy:**
  - `notify` wysyła do wszystkich subskrypcji podanych osób, bez innych.
  - Odpowiedź 410 usuwa subskrypcję.
  - Pusta lista odbiorców → 0 bez wywołań.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementacja. Klucze VAPID z env `VAPID_PUBLIC`, `VAPID_PRIVATE`. W trybie demo generowane przy starcie i zapisywane w `DATA_DIR`.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit.

### Task 8: Moduły `slowniki` i `uzytkownicy`

**Files:**
- Create: `server/src/modules/slowniki/{schema,service,routes,slowniki.test}.ts`, `modules/uzytkownicy/{schema,service,routes,uzytkownicy.test}.ts`, `shared/src/schemas/{slowniki,users}.ts`

**Interfaces:**
- Produces:
  - `dict(rodzaj, wartosc, kolejnosc, grupa?: 'aktualne'|'pozniej'|'zamkniete', platne?: boolean, kolor?: string)`.
  - Rodzaje: `status_zlecenia`, `status_leada`, `kategoria`, `ekipa`, `zrodlo`, `kod_nieobecnosci`, `grupa_zadan`, `status_zadania`, `rodzaj_zlecenia`, `status_zakupu`, `grupa_zakupow`, `dzien_wolny`.
  - `slowniki.list(rodzaj): DictRow[]`, `slowniki.groupOf(rodzaj, wartosc): grupa | null`.
  - Trasy `GET /api/dict`, `PUT /api/dict/:rodzaj` (admin).
  - `uzytkownicy`:
    - `users.list()`, `users.byScheduleCol()`, `users.crewMembers(ekipa): string[]`, `users.admins(): string[]`,
    - trasy `GET/POST/PUT /api/users` (admin; `POST` zwraca link z nowym tokenem raz),
    - `POST /api/users/:id/new-link`,
    - `schedule_people(id, kolejnosc, nazwa, user_id?)` + trasy w tym module.
  - Seed słowników = wartości z obecnych list Parametry:
    - StatusZlecen, StatusWycen, KatKody/KatNazwy, Ekipy, Zrodla, kody,
    - StatusZadan, GrupyZadan, StatusZakupow, GrupyZakupow,
    - grupy statusów jak sekcje dzisiejszych arkuszy.

- [ ] **Step 1: Testy:**
  - Pracownik: `PUT /api/dict` → 403.
  - `groupOf('status_zlecenia','Rozliczone') === 'zamkniete'`; `'Na później'` → `'pozniej'`.
  - Nowy link unieważnia stare sesje.
  - Admin nie może odebrać sobie roli ani się wyłączyć.
  - Zmiany użytkowników widzi tylko admin, poza własnym rekordem.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementacja.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit.

### Task 9: Moduł `klienci` (klienci i obiekty)

**Files:**
- Create: `server/src/modules/klienci/{schema,service,routes,klienci.test}.ts`, `shared/src/schemas/klienci.ts`

**Interfaces:**
- Produces:
  - Tabele:
    - `clients(firma_id, typ:'osoba'|'firma', nazwa, telefony: string[], emaile: string[], nip, notatki)`,
    - `sites(client_id, nazwa, adres, miejscowosc, mapa, opis)`.
  - `klienci.search(q): ClientHit[]` – po nazwie, telefonie (same cyfry) i miejscowości; diakrytyki ignorowane.
  - `klienci.create(input): {client, site?, duplicates: ClientHit[]}` – `duplicates` to klienci z tym samym telefonem lub e-mailem (ostrzeżenie, nie blokada).
  - `klienci.get(id)`, `klienci.update`, `klienci.addSite`, `klienci.updateSite`.
  - `klienci.forWorker(id)` → `{nazwa, telefony, site}`, bez NIP i notatek.
  - Trasy `/api/clients…`, wszystkie przez `runOp` dla zapisów.
  - `visibleTo`: pracownik dostaje klienta i obiekt tylko przycięte do `forWorker` i tylko dla zleceń, które widzi (wszystkie zlecenia, więc bez leadów-only klientów).

- [ ] **Step 1: Testy:**
  - `search('kowal')` znajduje „Kowalski”; `search('727 728')` znajduje telefon „727728903”; `search('zawoja')` po miejscowości obiektu; `search('Bańka')` = `search('banka')`.
  - Drugi klient z tym samym telefonem → `duplicates.length === 1`.
  - Pracownik nie dostaje `nip` ani `notatki` w zmianach.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementacja. Wyszukiwanie przez kolumnę `szukaj` (znormalizowany tekst) + `LIKE`.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit.

### Task 10: Moduł `zlecenia`

**Files:**
- Create: `server/src/modules/zlecenia/{schema,service,routes,zlecenia.test}.ts`, `shared/src/schemas/zlecenia.ts`

**Interfaces:**
- Consumes: `klienci.get`, `slowniki.groupOf`, `users.crewMembers`, `notify`.
- Produces:
  - `jobs(firma_id, numer, client_id, site_id, lead_id?, rodzaj, status, kategoria, termin, ekipa, zakres, uwagi_admin, zamkniete_at)`.
  - `zlecenia.save(user, input & {id?}): Job`:
    - numer `Z0001` kolejny w ramach firmy, w transakcji,
    - `zamkniete_at` ustawiane i czyszczone wg grupy statusu,
    - klient i obiekt mogą przyjść jako nowe (`newClient`, `newSite`) i są zakładane w tej samej transakcji,
    - powiadomienie dla ekipy przy nowym zleceniu z ekipą albo zmianie ekipy (tytuł „🆕 Nowe zlecenie: …” albo „🛠️ Zlecenie dla Twojej ekipy: …”, adres `#zl/<id>`, bez zapisującego, ekipa „mieszane” bez powiadomienia).
  - `zlecenia.get(id)`, `zlecenia.active(): JobRef[]` (do wyboru w harmonogramie), `zlecenia.forSite(siteId)`.
  - `visibleTo`: pracownik bez `uwagi_admin` i `lead_id`.
  - Trasy `/api/jobs…`.

- [ ] **Step 1: Testy:**
  - Pierwsze zlecenie → `Z0001`, drugie `Z0002`.
  - Status „Rozliczone” ustawia `zamkniete_at`, powrót do „W realizacji” je czyści.
  - Nowe zlecenie z `ekipa:'ekipa Bartek'` → `notify` do członków ekipy bez autora; „mieszane” → bez powiadomienia; zmiana tej samej ekipy → bez powiadomienia.
  - Pracownik nie widzi `uwagi_admin` ani w `GET`, ani w zmianach.
  - Zlecenie z `newClient` zakłada klienta i obiekt.
  - Pracownik `POST /api/jobs` → 403.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementacja.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit.

### Task 11: Moduł `leady`

**Files:**
- Create: `server/src/modules/leady/{schema,service,routes,leady.test}.ts`, `shared/src/schemas/leady.ts`

**Interfaces:**
- Consumes: `klienci`, `zlecenia.save`, `dziennik.addSystem` (Task 12, przez wstrzyknięcie), `notify`, `registerCron`.
- Produces:
  - `leads(firma_id, numer L…, client_id?, site_id?, status, kategoria, temat, zrodlo, opis, wartosc_gr, nastepny, ostatni, uwagi, zamkniete_at)`.
  - `lead_contacts(lead_id, dzien, plan, notatka, nastepny, status, by)`.
  - `leady.save`, `leady.contact(user, id, note, next?)` – zasady jak dziś: termin w przyszłości zostaje, minięty idzie do `plan` i jest czyszczony, `ostatni = dziś`.
  - `leady.toJob(user, leadId, job, accept: boolean)` – zlecenie z tym samym klientem i obiektem, wpisy systemowe w dziennikach obu, przy `accept` status leada na 4. wartość słownika (`Przyjęta`).
  - Cron `leady-przypomnienia` 7:00: push do adminów o leadach z `nastepny <= dziś`.
  - `visibleTo`: tylko `can(user,'leady')`.

- [ ] **Step 1: Testy:**
  - Kontakt z `nastepny` w przyszłości → `plan` pusty, `nastepny` bez zmian.
  - Kontakt z minionym → `plan = stary`, `nastepny = ''`, `ostatni = dziś`.
  - `toJob(accept:true)` → zlecenie ma `client_id` leada, lead ma status „Przyjęta” i grupę `zamkniete`.
  - Pracownik nie dostaje żadnej zmiany leada.
  - Cron wysyła jedno powiadomienie z liczbą zaległych.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementacja.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit.

### Task 12: Moduł `dziennik` (wpisy + załączniki)

**Files:**
- Create: `server/src/modules/dziennik/{schema,service,routes,dziennik.test}.ts`, `shared/src/schemas/dziennik.ts`

**Interfaces:**
- Consumes: `FileStore`, `makeVariants`, `zlecenia.get`, `harmonogram.peopleForJob` (Task 14, wstrzyknięte; do tego czasu stub zwracający `[]`), `users.admins`, `notify`.
- Produces:
  - `diary_entries(owner_type:'job'|'lead', owner_id, author_id, tekst, dla_klienta)`.
  - `attachments(owner_type:'entry'|'device'|'service', owner_id, rodzaj:'zdjecie'|'plik', key_orig, key_view?, key_thumb?, nazwa, mime, bajty, w?, h?, dla_klienta, author_id)`.
  - `POST /api/uploads` (multipart, max 25 MB, obrazy i PDF) → `{uploadId}` – plik czeka na wpis.
  - `POST /api/diary {opId, owner_type, owner_id, tekst, uploads: string[]}` – wpis i podpięcie plików w jednej transakcji.
  - `PATCH /api/attachments/:id {dla_klienta}` (admin) i `PATCH /api/diary/:id {dla_klienta}` (admin).
  - `DELETE /api/diary/:id` (autor albo admin, miękko).
  - `dziennik.addSystem(owner, tekst)`.
  - Powiadomienie: tytuł „📝 Nowy wpis w dzienniku: <klient – miejscowość>”, treść „<autor>: <tekst do 200 zn.> 📷 n”, adres `#zl/<id>~<entryId>`. Odbiorcy: admini + `harmonogram.peopleForJob` + ekipa zlecenia, bez autora. Lead: tylko admini.
  - `visibleTo`: wpisy leadów tylko z `can('leady')`.

- [ ] **Step 1: Testy:**
  - Wpis z dwoma zdjęciami → `attachments` mają `dla_klienta=false` i trzy klucze w FileStore.
  - Ten sam `opId` drugi raz → jeden wpis.
  - Pracownik usuwa cudzy wpis → 403, własny → OK.
  - Pracownik `PATCH dla_klienta` → 403.
  - Upload pliku `.exe` → 415.
  - Powiadomienie bez autora, z adresem z `~entryId`.
  - Wpis do leada niewidoczny dla pracownika.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementacja (multipart przez `c.req.parseBody()`).
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit.

### Task 13: Moduły `na-jutro`, `zakupy`, `zadania`

**Files:**
- Create: `server/src/modules/{na-jutro,zakupy,zadania}/{schema,service,routes,*.test}.ts`, `shared/src/schemas/{najutro,zakupy,zadania}.ts`

**Interfaces:**
- Produces:
  - `checklists(ekipa, dzien, tekst, zabrane, zabrane_by, zabrane_at)`:
    - widzi i odhacza tylko swoja ekipa i admin, usuwa autor lub admin,
    - push do ekipy „📦 <ekipa> – <dzień>: do zabrania”, adres `#jutro~<id>`,
    - cron `rano` (domyślnie 07:00): push do ekip z niezabranymi rzeczami na dziś.
  - `shopping(co, sklep, grupa, status, kwota_gr?, uwagi, by, kupione_at, kupione_by)`:
    - dodaje każdy, push do adminów „🛒 Do kupienia: …”,
    - status i kwotę zmienia admin,
    - kupione → push do autora „🛒 Kupione: …”,
    - usuwa autor.
  - `tasks(tekst, priorytet?, grupa, status, termin?, cykliczne: boolean, ostatnio?, uwagi)`:
    - tylko admin,
    - cykliczne po „Zrobione” zostaje, `status` wraca do pierwszego, `ostatnio = dziś`.

- [ ] **Step 1: Testy:**
  - Pracownik innej ekipy nie widzi listy ani zmian.
  - Odhaczenie przez członka ekipy OK, zmiana treści przez niego → 403.
  - Cron rano wysyła tylko ekipom z niezabranymi rzeczami na dziś.
  - Zakup: pracownik ustawia „Kupione” → 403; admin → push do autora.
  - Zadanie cykliczne „Zrobione” → status „Do zrobienia”, `ostatnio = dziś`.
  - Pracownik nie widzi zadań.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementacja.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit.

### Task 14: Moduł `harmonogram`

**Files:**
- Create: `server/src/modules/harmonogram/{schema,service,routes,harmonogram.test}.ts`, `shared/src/schemas/harmonogram.ts`

**Interfaces:**
- Consumes: `schedule_people`, `zlecenia.active/get`, `slowniki`, `plHolidays`, `isWorkday`, `notify`.
- Produces:
  - `schedule_entries(dzien, person_id, rodzaj:'zlecenie'|'kod'|'tekst', job_id?, kod?, tekst?, pol_dnia: boolean, slot: 0|1)` – unikalne `(dzien, person_id, slot)`. Pół dnia może mieć dwa sloty: dwa zlecenia po pół.
  - `schedule_notes(dzien, tekst)`.
  - `schedule_drafts(dzien, person_id|'uwagi', proposal JSON, by, at)`.
  - `harmonogram.range(from, to, user)` – dni z wpisami, świętami (`info`) i `wd`. Pracownik bez szkiców.
  - `harmonogram.setDraft(admin, {from, to, people: string[], value, workdaysOnly})`.
  - `harmonogram.approve(admin, items?: {key, proposalHash}[])` – zatwierdza tylko szkice o zgodnym hashu. Powiadomienie każdemu: „📅 Zmiana w Twoim harmonogramie” / „Zmiany w Twoim harmonogramie (n)”, treść do 6 linii „jutro: A → B”, adres `#harm/<pierwszy dzień>`, bez zatwierdzającego.
  - `harmonogram.discard(admin, keys?)`.
  - `harmonogram.peopleForJob(jobId): string[]` (user ids).
  - `harmonogram.jobDays(jobId): {dni:number, od?:string, do?:string}` – pełny = 1, pół = 0,5.
  - `harmonogram.myNext(user)` – „Gdzie jedziesz”.

- [ ] **Step 1: Testy:**
  - Szkic widzi tylko admin.
  - Zatwierdzenie zapisuje wpisy i wysyła push osobie z kolumny (bez zatwierdzającego).
  - Szkic zmieniony przez drugiego admina po wczytaniu (inny hash) zostaje po `approve` z hashami pierwszego.
  - `jobDays`: dwa pełne dni i jedno pół → `2.5`, `od`/`do` poprawne.
  - `workdaysOnly` pomija sobotę, niedzielę i 2026-11-11.
  - `range` dla 2026-12 zawiera „Wigilia (dzień wolny od 2025 r.)” z `wd=2`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementacja.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit.

### Task 15: Kopia do arkusza Google i ciągła kopia bazy

**Files:**
- Create: `server/src/scripts/export-sheets.ts`, `server/src/scripts/export-sheets.test.ts`, `deploy/litestream.yml`, `deploy/README-odtworzenie.md`

**Interfaces:**
- Produces:
  - `exportToSheets(db, sheets: SheetsClient, spreadsheetId)` – każda tabela biznesowa jako karta (nagłówki = nazwy kolumn, kwoty jako liczba zł z dwoma miejscami, dni jako tekst). Karta jest czyszczona i zapisywana od nowa, plus karta `_info` z datą eksportu i liczbą wierszy.
  - Cron `eksport` 02:30.
  - Konfiguracja Litestream: replika do R2 `etner-backup/db`, `retention: 720h`.
  - Cron `kopia-zdjec` 03:00: kopiowanie nowych kluczy z bucketu roboczego do `etner-backup/files`.

- [ ] **Step 1: Testy (atrapa SheetsClient):**
  - Wszystkie tabele z `TABLES_FOR_EXPORT` mają kartę.
  - Liczba wierszy = liczba rekordów (z usuniętymi, kolumna `deleted_at`).
  - Brak konfiguracji → zadanie się pomija i zapisuje ostrzeżenie w logu.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementacja: `googleapis` z kontem usługi z env `GOOGLE_SA_JSON`, `values.batchUpdate`, `RAW`.
- [ ] **Step 4:** PASS. Instrukcja odtworzenia: Litestream `restore`, zmienne, start.
- [ ] **Step 5:** Commit.

### Task 16: Dane przykładowe (tryb demo)

**Files:**
- Create: `server/src/scripts/seed-demo.ts`, `server/src/scripts/seed-demo.test.ts`

**Interfaces:**
- Produces: `seedDemo(db, files)` przy `DEMO=1`, gdy baza pusta:
  - 2 adminów, 5 pracowników w dwóch ekipach, linki demo wypisane w logu przy starcie,
  - słowniki,
  - 12 klientów z obiektami (wymyślone nazwiska i miejscowości z okolicy),
  - 6 leadów,
  - 14 zleceń w różnych statusach,
  - harmonogram bieżący i kolejne 3 tygodnie,
  - dzienniki z 10 wygenerowanymi zdjęciami (sharp, gradienty z podpisem),
  - zakupy, listy „na jutro”, zadania.

- [ ] **Step 1: Test:** `seedDemo` na pustej bazie → liczności jak wyżej. Drugie wywołanie nic nie dodaje.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementacja.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit.

### Task 17: Web – fundament (sesja, synchronizacja, kolejka offline, układ, motyw)

**Files:**
- Create:
  - `web/index.html`, `web/vite.config.ts` (PWA), `web/src/{main.tsx,App.tsx,routes.tsx,theme.css}`
  - `web/src/core/{api.ts,session.ts,sync.ts,outbox.ts,store.ts}`
  - `web/src/core/layout/{Shell.tsx,BottomNav.tsx,SideNav.tsx,TopBar.tsx}`
  - `web/src/core/ui/*` (shadcn: button, input, dialog/sheet, command/combobox, select, checkbox, toast, skeleton)
  - `web/src/core/*.test.ts`

**Interfaces:**
- Consumes: trasy `/api/login`, `/api/me`, `/api/snapshot`, `/api/changes`, `/api/stream`.
- Produces:
  - `store`: kolekcje encji w pamięci + IndexedDB (`idb-keyval`), `useEntities(entity, filter)`, `useEntity(entity, id)`.
  - `sync.start()`: snapshot przy pierwszym razie, potem `changes?since`, SSE z ponownym łączeniem, `last` zapisany w IndexedDB.
  - `outbox.enqueue({kind, url, method, body, files?: Blob[]})`:
    - nadaje `opId` (ULID), od razu wywołuje `optimistic(store)`,
    - wysyła po kolei, ponawia przy błędzie sieci,
    - przy 4xx zwraca błąd do formularza, przy 401 wstrzymuje kolejkę i pokazuje „Zaloguj się ponownie”.
  - Zdjęcia: `resizePhoto(file): Promise<Blob>` (2560 px, JPEG 0.85, `createImageBitmap` z `imageOrientation:'from-image'`).
  - Układ:
    - telefon: dolny pasek Harmonogram · Na jutro · Zlecenia · Zakupy · Więcej,
    - komputer (≥1100 px): boczne menu,
    - pasek górny ze znacznikiem offline i liczbą zapisów w kolejce.
  - Motyw: zmienne CSS z Global Constraints, Archivo z Google Fonts (`wdth 62..125`), tryb ciemny przez `prefers-color-scheme` i przełącznik w Ustawieniach.
  - Wygląd ekranów projektować skillem `taste-skill:design-taste-frontend-v2-experimental` według systemu ze specyfikacji całości.

- [ ] **Step 1: Testy (Vitest + fake-indexeddb, MSW):**
  - Dwa zapisy offline, „restart” (nowa instancja `outbox` z tego samego IndexedDB), sieć wraca → serwer dostaje oba w kolejności, każdy raz.
  - Odpowiedź 401 → kolejka wstrzymana, nie skasowana, zdarzenie `session-expired`.
  - Odpowiedź 422 → zapis zdjęty z kolejki, błąd przekazany do wywołującego, `optimistic` cofnięte.
  - SSE zerwane → ponowne łączenie z `since=last`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementacja. Workbox: cache aplikacji, `navigateFallback`, aktualizacja przez `registerType:'autoUpdate'` z odświeżeniem po powrocie z tła.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit.

### Task 18: Klikalna wersja na Render (punkt kontrolny właściciela)

**Files:**
- Create:
  - `render.yaml`
  - `web/src/features/harmonogram/*`, `web/src/features/zlecenia/*`, `web/src/features/dziennik/*`, `web/src/features/zakupy/*`, `web/src/features/klienci/*`
  - `web/e2e/demo.spec.ts`

**Interfaces:**
- Consumes: Task 8–17.
- Produces (ekrany):
  - **Harmonogram:** tydzień na telefonie (karty dni, „Gdzie jedziesz” na górze, „Ty”, wyróżnienie ekip), miesiąc i pełna tabela na komputerze. Komórka: wybór zlecenia z podpowiedzią / kod / tekst + pełny / pół. Pasek szkiców z „Zatwierdź i powiadom” i „Przejrzyj”.
  - **Zlecenia:** lista wg grup (Aktualne / Na później / Zamknięte), wyszukiwanie, „nowe” liczniki, „brak w harmonogramie”. Karta: klient i obiekt (zadzwoń, nawiguj), status, ekipa, dni, dziennik.
  - **Dziennik:** wpis z tekstem i zdjęciami (aparat lub galeria), galeria z podglądem pełnoekranowym, przełączka „pokaż klientowi” (admin).
  - **Zakupy:** dodaj, sekcje wg statusu, kupione zwinięte.
  - **Karta klienta:** obiekty, leady, zlecenia.
  - `render.yaml`: web service Node, `pnpm i && pnpm build`, start `node server/dist/main.js`, `DEMO=1`, `DATA_DIR=/tmp/etner`, zmienne R2 jako sekrety (O2).

- [ ] **Step 1: Test e2e** `demo.spec.ts` (Playwright, iPhone 13 i 1440×900, serwer w trybie demo):
  - logowanie linkiem demo,
  - otwarcie zlecenia,
  - dodanie wpisu ze zdjęciem z pliku,
  - zdjęcie widoczne w galerii,
  - harmonogram: ustawienie komórki → szkic → zatwierdzenie → komórka zapisana,
  - zakupy: dodanie pozycji.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementacja ekranów.
- [ ] **Step 4:** e2e PASS. Wdrożenie na Render, sprawdzenie adresu na telefonie (zrzuty ekranu dla właściciela).
- [ ] **Step 5:** Commit. **STOP: właściciel sprawdza wygląd i działanie na telefonie i komputerze. Poprawki przed dalszymi zadaniami.**

### Task 18a: Login i hasło zamiast linków

**Files:**
- Modify: `server/src/core/auth.ts`, `core/schema-base.ts` (+ migracja), `modules/uzytkownicy/*`, `scripts/seed-demo.ts`, `scripts/export-sheets.ts`, `test-utils.ts`, `web/src/core/session.ts` + ekran logowania, `web/e2e/demo.spec.ts`, `README.md`

**Interfaces:**
- `users.login` (unikalny, bez rozróżniania wielkości liter), `users.password_hash` (scrypt z solą); kolumna tokenu linku usunięta.
- `POST /api/login {login, haslo}` → cookie `etner_s` jak dotąd; zły login lub hasło → 401 `ZLE_DANE`; po 5 nieudanych próbach na login w 15 min → 429 `ZA_DUZO_PROB`.
- `POST /api/me/haslo {stare, nowe}` – zmiana własnego hasła (min. 8 znaków), wylogowuje pozostałe urządzenia.
- `POST /api/users` (admin) przyjmuje `login` i `haslo`; `POST /api/users/:id/haslo {haslo}` (admin) – reset, wylogowuje wszystkie urządzenia tej osoby. Trasa nowego linku znika.
- Tryb demo: stałe hasło demo, `GET /api/demo/konta` (tylko DEMO=1), ekran logowania pokazuje konta demo do wyboru.

- [ ] **Step 1: Testy:** dobre i złe hasło, wyłączony użytkownik, blokada po 5 próbach, reset przez admina unieważnia sesje, zmiana własnego hasła, skrót hasła nigdy w zmianach, snapshot ani eksporcie.
- [ ] **Step 2:** FAIL. **Step 3:** Implementacja. **Step 4:** PASS + e2e. **Step 5:** Commit.

### Task 18c: Harmonogram – kilka osób i dni naraz, widok miesiąca, bez wierszy adminów

Decyzje właściciela 2026-10-21 po klikalnej wersji:
- **Kilka osób i dni naraz:** edytor komórki (admin) pozwala wybrać kilka osób i zakres dni od–do (z „tylko dni robocze”) i zapisuje jeden szkic przez istniejące `POST /api/schedule/drafts` (`from`, `to`, `people`, `workdaysOnly`).
- **Widok miesiąca na komputerze:** przełącznik Tydzień / Miesiąc; miesiąc jako zwarta tabela osoba × dzień z poprzedni / następny / bieżący miesiąc; komórka w miesiącu otwiera ten sam edytor.
- **Bez harmonogramu dla adminów:** admini nie mają własnych kolumn (wierszy) harmonogramu – dane demo bez kolumn adminów; admin bez kolumny nie widzi „Gdzie jedziesz” ani „Ty”, ale nadal edytuje i zatwierdza harmonogram innych.

- [ ] **Step 1: Testy:** jednostkowe dla wyliczenia dni i osób w szkicu zbiorczym; e2e: admin ustawia jedno zlecenie dwóm osobom na 3 dni robocze → szkic → zatwierdzenie → 6 komórek; widok miesiąca pokazuje bieżący miesiąc; admin nie ma wiersza.
- [ ] **Step 2–5:** FAIL → implementacja → PASS → commit.

### Task 18d: Edycja istniejących klientów

Decyzja właściciela 2026-10-21: musi być możliwość edycji istniejących klientów.
- Karta klienta (admin): „Edytuj” – typ, nazwa, telefony, e-maile, NIP, notatki; obiekty: dodaj i edytuj (nazwa, adres, miejscowość, mapa, opis). Serwer już ma `PUT /api/clients/:id`, `POST /api/clients/:id/sites`, `PUT /api/sites/:id`. Ostrzeżenie o duplikacie telefonu / e-maila jak przy zakładaniu. Pracownik nie widzi „Edytuj”.

- [ ] **Step 1: Testy:** e2e: admin zmienia telefon klienta i adres obiektu, zmiana widoczna na karcie zlecenia; pracownik bez przycisku.
- [ ] **Step 2–5:** FAIL → implementacja → PASS → commit.

### Task 18e: Zakupy uproszczone, zakres prac ze zdjęciami, liczniki w menu

Decyzje właściciela 2026-10-21:
- **Zakupy:** pozycja = co + uwagi. Bez kwoty, sklepu i grupy (pola usunięte z ekranu, API i tabeli; słownik `grupa_zakupow` usunięty). Statusy tylko „Do kupienia” i „Kupione” (bez „Zamówione”); istniejące „Zamówione” → „Do kupienia” w migracji.
- **Zakres prac w zleceniu:** lista punktów; punkt = tekst + zdjęcia (0..n), kolejność, dodaj / edytuj / usuń / przesuń. Edytuje tylko admin; pracownik widzi. Zdjęcia jak w dzienniku (zmniejszanie, kolejka offline, podgląd, „Pokaż klientowi”). Dotychczasowy tekst `zakres` zostaje jako pierwszy punkt (migracja).
- **Liczniki w menu (dolny pasek i boczne menu):** Na jutro – liczba niezabranych rzeczy mojej ekipy na dziś i jutro (admin: wszystkich ekip); Harmonogram – liczba zmian w moim harmonogramie od ostatniego wejścia na ekran; Zlecenia – liczba zleceń z nowymi wpisami lub zmianami od ostatniego otwarcia; Zakupy – admin: liczba „Do kupienia”. Liczniki liczone na urządzeniu z danych zsynchronizowanych; „ostatnio widziane” w pamięci urządzenia.

- [ ] **Step 1: Testy:** serwer – zakupy bez usuniętych pól i z dwoma statusami, punkty zakresu (admin zapisuje, pracownik 403, zdjęcia podpięte do punktu, widoczność jak zlecenia); web – wyliczenie liczników; e2e – admin dodaje punkt zakresu ze zdjęciem; licznik „Na jutro” pokazuje liczbę.
- [ ] **Step 2–5:** FAIL → implementacja → PASS → commit.

### Task 18f: Poprawki harmonogramu, zakupów, słowników; „nowe” do obejrzenia; włączanie push

Decyzje właściciela 2026-10-21:
- **Nawigacja tygodnia (telefon i komputer):** strzałki zawsze w tym samym miejscu; gdy pokazany jest inny tydzień niż bieżący, po lewej od strzałek pojawia się „Dziś”, które wraca do bieżącego tygodnia i przewija do dzisiejszego dnia.
- **Widok miesiąca:** te same karty (rozmiar i treść jak w tygodniu: numer, miejscowość, klient, ½), przewijany w poziomie strzałkami lewo / prawo; bez skróconych etykiet.
- **Kolor przy zleceniu w harmonogramie = kategoria zlecenia:** elektryka niebieski, fotowoltaika czerwony, rekuperacja zielony, klimatyzacja fioletowy, inne żółty (kolor w słowniku `kategoria`). Zastępuje kolor ekipy na kartach zleceń.
- **Słowniki:** `kategoria` = Elektryka, Fotowoltaika, Rekuperacja, Klimatyzacja, Inne (Pompa ciepła i Serwis usunięte; istniejące zlecenia: Pompa ciepła → Inne, Serwis → Inne). `rodzaj_zlecenia` = montaż, przygotówka, serwis, inne (gwarancja usunięta; istniejące → inne).
- **Zakupy:** usuwa tylko admin i autor pozycji. Zamiast listy statusów admin ma „ptaszek” (zaznaczone = Kupione, odznaczone = Do kupienia).
- **„Nowe” zostaje do obejrzenia zmiany:** wejście na ekran nie kasuje znacznika. Harmonogram: zmieniony dzień ma znacznik „nowe”, który znika dopiero, gdy ten dzień był widoczny na ekranie; licznik w menu = liczba nieobejrzanych zmienionych dni. Zlecenia: znacznik przy zleceniu do czasu otwarcia jego karty; licznik w menu = liczba takich zleceń.
- **Push:** w „Więcej” przycisk „Włącz powiadomienia na tym urządzeniu” (z instrukcją dla iPhone: najpierw „Do ekranu początkowego”), stan włączone / wyłączone, „Wyłącz”, oraz „Wyślij próbne powiadomienie” (`POST /api/push/test` do samego siebie).

- [ ] **Step 1: Testy:** serwer – migracja słowników i zleceń, zakupy (usuwa autor / admin, inny pracownik 403), `/api/push/test`; web – licznik i znaczniki dni / zleceń jako czyste funkcje; e2e – „Dziś” wraca do bieżącego tygodnia, znacznik dnia znika po obejrzeniu, ptaszek kupione.
- [ ] **Step 2–5:** FAIL → implementacja → PASS → commit.

### Task 18g: Kanał Pumble przy zleceniu

Decyzja właściciela 2026-10-21 (zmienia „bez Pumble” z projektu całości):
- Przy utworzeniu zlecenia serwer zakłada **prywatny** kanał Pumble (nazwa z numeru, klienta i miejscowości, np. `z0012-kowalski-zawoja`), dodaje adminów i ekipę zlecenia (później także osoby z harmonogramu tego zlecenia i nową ekipę po zmianie). Id kanału w `jobs.pumble_channel_id`.
- Karta zlecenia: sekcja „Pumble” z kilkoma ostatnimi wiadomościami, aktualizowanymi bez klikania (serwer odpytuje Pumble i rozsyła nowe wiadomości przez zmiany / SSE), pole „Napisz” (wiadomość idzie jako bot ETNER z imieniem autora) i przycisk „Przejdź do Pumble”.
- API: dodatek Pumble „API Keys” (`https://pumble-api-keys.addons.marketplace.cake.com`, nagłówek `ApiKey`; `createChannel`, `addUsersToChannel`, `listMessages`, `sendMessage`, `listUsers`, `myInfo`). Klucz w sekrecie `PUMBLE_API_KEY` (wkleja właściciel). Brak klucza → funkcja wyłączona, sekcja ukryta. Pumble nie wysyła zdarzeń, więc nowe wiadomości są pobierane cyklicznie.
- Dziennik zostaje bez zmian obok Pumble.

- [ ] **Step 1: Testy (atrapa Pumble):** nowe zlecenie zakłada kanał i dodaje właściwe osoby; błąd Pumble nie psuje zapisu zlecenia (ponowienie później); odpytywanie zapisuje tylko nowe wiadomości i rozsyła je; pracownik widzi wiadomości zleceń jak zlecenia; wysyłka idzie jako bot z imieniem; bez klucza nic się nie dzieje.
- [ ] **Step 2–5:** FAIL → implementacja → PASS → commit.

### Task 18h: Wyraźniejsze „nowe”, harmonogram bez numerów

Decyzje właściciela 2026-10-22:
- **„Nowe” zostaje, dopóki użytkownik nie zmieni ekranu albo nie kliknie zmiany:** zmieniony dzień w harmonogramie ma znacznik przez cały pobyt na ekranie; obejrzane (widoczne) dni są oznaczane jako widziane dopiero przy wyjściu z ekranu harmonogramu albo po kliknięciu w zmienioną komórkę / dzień. Zlecenia bez zmian (znacznik do otwarcia karty).
- **Znaczniki „nowe” na czerwono:** liczniki w menu, pigułki „nowe” na dniach, zleceniach i w Pumble – czerwone tło (#c62828), biały tekst, dobrze widoczne w jasnym i ciemnym motywie.
- **Harmonogram bez numerów zleceń:** karta zlecenia w harmonogramie pokazuje kategorię (nazwa + kolor), miejscowość i klienta; numer ukryty (zostaje w nazwie dostępności i w karcie zlecenia).

- [ ] **Step 1–5:** testy czystych funkcji „widziane przy wyjściu”, e2e: znacznik zostaje po 2 s na ekranie, znika po przejściu na inny ekran; zrzuty.

### Task 18i: Pumble szybciej i pliki z kanału

Decyzje właściciela 2026-10-22:
- **Szybsze odświeżanie:** kanał zlecenia, którego karta jest otwarta u kogoś (sygnał „oglądam” z aplikacji co 15 s), odpytywany co ~3 s; pozostałe kanały co 30 s. Limit: najwyżej 20 „oglądanych” kanałów naraz, razem poniżej 1000 zapytań/min.
- **Pliki z kanału:** wiadomości z załącznikami zapisują pełne dane plików z Pumble (`files`). Podgląd zdjęć i pobieranie plików w karcie zlecenia dokończone po sprawdzeniu na żywo, jak Pumble udostępnia pliki (dokumentacja tego nie opisuje); do tego czasu nazwa pliku zamiast „(plik)”.

### Task 18j (później, gdy właściciel poda listy): Listy predefiniowane pod rodzaj pracy

Decyzja właściciela 2026-10-22 (do zbudowania, gdy poda pełny zestaw list):
- Szablony list (np. „Klimatyzacja”, „Alarm”, „Reku – przygotówka”, „Montaż rekuperatora”): nazwa + pozycje + do jakich zleceń pasuje (kategoria i/lub rodzaj). Edytuje admin.
- Odhaczanie tylko lokalne na urządzeniu: po wyjściu z listy wszystko znowu do odhaczenia (nic nie idzie na serwer).
- Podpowiedź: w „Na jutro” (i przy dniu w harmonogramie) listy pasujące do zleceń, na które dana osoba jedzie danego dnia, są podświetlone i proponowane na górze.
- Logika dopasowania: szablon ma `kategorie[]` i `rodzaje[]`; pasuje, gdy zlecenie dnia ma pasującą kategorię i (jeśli podano) rodzaj.

### Task 19: Pozostałe ekrany

(Wykonywane w dwóch częściach: 19a – Leady z „Zrób zlecenie”, Na jutro, Zadania; 19b – Użytkownicy z loginem, hasłem, e-mailem do Pumble i wierszem harmonogramu, Ustawienia. Z leada powstaje zlecenie: klient, obiekt, kategoria, opis → zakres, `lead_id`.)

**Files:**
- Create: `web/src/features/{leady,na-jutro,zadania,uzytkownicy,ustawienia}/*`, `web/e2e/full.spec.ts`

**Interfaces:**
- Produces:
  - **Leady:** lista „Na już / Na kiedyś / Zamknięte” z zaległymi kontaktami na górze, karta z historią kontaktów, „Zapisz kontakt” (notatka + następny termin), „Zrób zlecenie” (z „oznacz jako Przyjęta”).
  - **Na jutro:** wybór ekipy (pracownik: tylko swoja) i dnia, lista z odhaczaniem, szybkie dodawanie.
  - **Zadania:** grupy, priorytet, termin, cykliczne.
  - **Użytkownicy:** lista, edycja, login, ustawienie / reset hasła, kolumny harmonogramu.
  - **Ustawienia:**
    - słowniki,
    - godzina porannego przypomnienia,
    - włączenie push na tym urządzeniu (z instrukcją dla iPhone: najpierw „Dodaj do ekranu początkowego”),
    - motyw,
    - log błędów (admin),
    - stan kopii (ostatni eksport, ostatnia replika).
  - **Powiadomienia:** adres `#…~id` otwiera ekran, przewija i podświetla element; znaczniki „nowe” i liczniki na zakładkach.

- [ ] **Step 1: Test e2e** `full.spec.ts`:
  - lead → kontakt → zlecenie,
  - pracownik nie widzi „Leady” ani „Zadania” w menu i dostaje 403 przy wejściu przez adres,
  - na jutro: odhaczenie przez członka ekipy,
  - kliknięcie adresu `#zl/<id>~<entry>` podświetla wpis.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementacja.
- [ ] **Step 4:** PASS. Wdrożenie na Render.
- [ ] **Step 5:** Commit. **STOP: właściciel sprawdza pełny moduł na Render.**

### Task 19c: Uwagi właściciela po zadaniu 19 (CZEKA – start na sygnał właściciela)

Zapisane 2026-10-22, do zrobienia dopiero gdy właściciel powie:
1. **Pumble:** kanały tylko dla nowych zleceń (bez automatycznego zakładania dla istniejących); przy istniejącym zleceniu przycisk „Utwórz kanał w Pumble” (dla admina).
2. **Komputer:** wszystko wyraźnie mniejsze (okna, czcionka, przyciski, odstępy), żeby więcej mieściło się na ekranie; telefon bez zmian.
3. **Na jutro:** przy pozycji widać kto dodał i kto zabrał (i kiedy).
4. **Licznik „Na jutro” w menu:** tylko niezabrane rzeczy na następny dzień (bez dzisiejszych).
5. **Leady – kontakty:** grupowane według statusu; możliwość usunięcia pozycji kontaktu (do doprecyzowania z właścicielem: które statusy, kto usuwa).
6. **Zaległe kontakty:** wyraźnie na czerwono + codziennie o 7:00 e-mail na etner@etner-instalacje.pl z listą zaległych kontaktów (wymaga skrzynki / usługi do wysyłki e-maili – sekret od właściciela).
7. **Klient:** pole e-mail widoczne i edytowalne w formularzach (szczególnie przy leadach).
8. **Następny kontakt:** przyciski +3 dni, +1 tydzień, +1 miesiąc liczone od dziś, wypełniają datę.
9. **Zadania cykliczne:** wybór cyklu (np. co 1 tydz., 2 tyg., 1 mies., 3 mies., rok); po wykonaniu następny termin = dziś + cykl.
10. **Listy predefiniowane (zadanie 18j):** pod elektrykę i fotowoltaikę: „Elektryka”, „Montaż fotowoltaiki”, „Alarm”, „Kamery”; pod rekuperację: „Reku przygotówka”, „Reku rozkładanie instalacji”, „Montaż rekuperatora”; pod klimatyzację: „Rozciąganie rur klimy”, „Montaż klimy”. Pozycje list dodaje admin w Ustawieniach.
11. **Push o 7:00** z listą „na jutro” (sprawdzić, że działa; godzina z ustawień).
12. **Zadania:** opcjonalne przypisanie do klienta (wybór klienta).
13. **Leady:** bez numerów leadów w interfejsie.
14. **Avatary użytkowników:** zdjęcie / inicjały, widoczne m.in. przy wpisach dziennika, w Pumble, harmonogramie.

### Task 19d: Listy na następny dzień roboczy

Decyzja właściciela 2026-10-27:
- W „Na jutro” sekcja list predefiniowanych jest **na samej górze ekranu** (nad rzeczami do zabrania), a listy pasujące do zleceń, na które oglądający (pracownik: on sam; admin: wybrana ekipa) jedzie **następnego dnia roboczego**, są podświetlone i pierwsze.
- „Następny dzień roboczy” = najbliższy dzień po dziś, dla którego `isWorkday` (shared/src/dates.ts; pomija sob., niedz. i święta). W pt / sob / niedz. → poniedziałek (lub następny roboczy po święcie).
- Ten sam dzień jest domyślnym dniem ekranu „Na jutro” i dniem licznika „Na jutro” w menu (`naJutroCount`), żeby lista, podświetlenie i licznik mówiły o tym samym dniu. Poranny push „Do zabrania dziś” bez zmian (dziś).
- Test jednostkowy funkcji „następny dzień roboczy” (pt → pon, sob → pon, czw → pt, przed świętem).

### Task 19e: Moduł „Utrzymanie samochodów”

Decyzja właściciela 2026-10-27:
- Samochody: na start trzy – „Nowa Duża Toyota”, „Mała Toyota”, „Stary Ducato” (wstawiane przy pierwszym uruchomieniu i w demo). Każdy przypisany do ekipy (wartość słownika `ekipa`) albo bez przypisania. Przypisanie (i nazwę, dodanie nowego auta) zmienia admin. Zmiana nazwy ekipy w słowniku przenosi się na auta (DictRefs, R36).
- Usterki: każdy użytkownik zgłasza usterkę auta (opis, np. „zaświecił się check engine”); widać kto i kiedy. Lista usterek per auto widoczna dla wszystkich.
- Admin: usuwa usterkę albo planuje naprawę na konkretny dzień (może zmienić dzień lub odwołać). Po zaplanowaniu wszyscy aktywni użytkownicy dostają push „🔧 <auto>: naprawa <dzień> – <opis>”, kliknięcie otwiera usterkę.
- Harmonogram: w dniu naprawy członkowie ekipy przypisanej do auta (wg ekipy w chwili oglądania) mają cały dzień oznaczony na czerwono z opisem „<auto> w naprawie” (nakładka, nie zmienia wpisów harmonogramu). Auto bez ekipy → nikt nie oznaczony.
- Usterka usunięta → oznaczenie znika. Usterka z naprawą w przeszłości zostaje na liście jako „po naprawie” do usunięcia przez admina.
- Ekran „Samochody” w menu bocznym / Więcej.

### Task 19f: Moduł „Stan narzędzi”

Decyzja właściciela 2026-10-27:
- Miejsca: każdy samochód z zadania 19e (lista samochodów, zmiana nazwy auta zmienia nazwę miejsca) + „Magazyn”.
- Narzędzie: nazwa, miejsce, a w samochodzie dokładne miejsce z listy: „Górna półka na regale”, „Środkowa półka na regale”, „Nad kabiną”, „Dolna półka”, „W kabinie”. Magazyn ma jedną listę bez podmiejsc.
- Ekran: pasek wyszukiwania na górze; wpisanie nazwy pokazuje wszystkie miejsca, gdzie narzędzie powinno być (np. wkrętarka w „Mała Toyota · Górna półka” i „Stary Ducato · W kabinie”); bez wyszukiwania – listy per miejsce (zakładki lub sekcje), w aucie pogrupowane wg podmiejsca.
- Dodawanie / edycja / przeniesienie: każdy użytkownik; usuwanie: admin i autor.
- Ekran „Narzędzia” w menu bocznym / Więcej.

### Task 19g: „Nietypowe rzeczy na magazynie”

Decyzja właściciela 2026-10-27:
- Rzecz: nazwa + ilość jako dowolny tekst (np. „opakowanie”, „pudełko”, „garść”). Dodaje każdy użytkownik.
- Pasek wyszukiwania na górze (filtruje obie listy).
- Przycisk „Zabieram” przenosi rzecz do listy „Zabrane” pod spodem (inny kolor tła), z informacją kto i kiedy zabrał.
- Na rzeczy z „Zabrane” przycisk „Zwracam” otwiera okno z polem ilości (wstępnie dotychczasowa); po zatwierdzeniu rzecz wraca na listę główną z nową ilością.
- Rzeczy w „Zabrane” dłużej niż 7 dni są automatycznie usuwane (zadanie w tle raz dziennie).
- Usuwanie ręczne: admin i autor.
- Ekran „Magazyn” w menu bocznym / Więcej.

### Task 19h: Uwagi właściciela po 19d–19g

Decyzje właściciela 2026-10-28:
1. **Na jutro:** sekcja „Do zabrania” nad listami predefiniowanymi (kolejność: wybór ekipy/dnia → Do zabrania → Listy).
2. **Samochody – licznik w menu:** jak przy Zakupach – liczba usterek zgłoszonych, a bez wyznaczonego terminu naprawy (dla wszystkich).
3. **Magazyn → „Rzeczy nietypowe”:** zmiana nazwy ekranu, menu, kafelka w Więcej (adres i dane bez zmian).
4. **Push o naprawie nie dotarł do użytkownika:** znaleźć przyczynę (np. kto jest odbiorcą, czy push działa w ogóle dla innych zdarzeń, subskrypcja urządzenia, konfiguracja VAPID na Render) i naprawić; jeśli przyczyna leży w konfiguracji po stronie właściciela – opisać krok.
5. **Harmonogram – „Dziś”:** przycisk widoczny także w bieżącym tygodniu / miesiącu; kliknięcie przewija do dzisiejszego dnia.
6. **Narzędzia – dodawanie schowane:** bez dużego przycisku „+” przy wyszukiwarce; dodawanie i edycja w trybie „Edytuj listy” dostępnym tylko dla admina (np. mały przycisk na dole ekranu). Na co dzień ekran służy do wyszukiwania.
7. **Narzędzia – tylko admin edytuje:** pracownik nie dodaje, nie zmienia, nie przenosi i nie usuwa narzędzi (serwer 403, w interfejsie brak przycisków). Zmienia R40.
8. **Listy predefiniowane – podświetlenie tylko dla zleceń danej osoby:** pracownik widzi podświetlone listy tylko dla zleceń, na które sam jedzie danego dnia (jego wiersz w harmonogramie), nie dla zleceń innych osób czy drugiej ekipy. Admin: zlecenia osób z wybranej ekipy.
9. **Historia napraw:** usterki po naprawie (dzień naprawy minął lub admin oznaczył „Naprawione”) trafiają na szarą listę „Historia napraw” pod spodem, jak „Zabrane” w Rzeczach nietypowych. Nie są usuwane automatycznie.
10. **Zlecenie z leada:** usunąć bezsensowne statusy „nowe” i „do wyceny” z wyboru przy tworzeniu zlecenia z leada (zlecenie dostaje pierwszy sensowny status).

### Task 20: Przegląd dostępności i szybkości

**Files:**
- Modify: ekrany z zadań 18–19
- Create: `web/e2e/a11y.spec.ts`

- [ ] **Step 1: Test** `a11y.spec.ts`: `@axe-core/playwright` na 6 głównych ekranach (telefon, jasny i ciemny) → 0 naruszeń „serious/critical”.
- [ ] **Step 2:** Uruchom → lista naruszeń.
- [ ] **Step 3:** Poprawki. Budżet: JS aplikacji po gzip ≤ 250 KB (sprawdzany w CI przez `size-limit`), LCP z cache < 1 s na profilu „Fast 3G” w Lighthouse CI dla ekranu harmonogramu.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit.

### Task 21: Atrapa danych starej aplikacji (do testu przeniesienia)

**Files:**
- Create: `server/src/scripts/migrate-old/fixtures/` (wygenerowane, wymyślone dane w układzie arkuszy Firma_2026 i bazy aplikacji), `server/src/scripts/migrate-old/fixtures.ts`

**Interfaces:**
- Produces: `oldFixture(): OldData` z tym samym kształtem, jaki da odczyt prawdziwego eksportu:
  - `zlecenia`, `wyceny`, `historia`, `harmonogram {persons, days}`, `zadania`, `zakupy`, `parametry`,
  - `uzytkownicy`, `obiekty`, `dziennik`, `listy`, `firestore {checks, buys, diary}`.
  - Celowo zawiera:
    - tego samego klienta w dwóch zleceniach z różnie zapisanym telefonem,
    - lead powiązany ze zleceniem,
    - komórki harmonogramu „Kowalski / Nowak”, „urlop”, „szkolenie”,
    - wpis z literówką w haśle.

- [ ] **Step 1:** Test kształtu (`OldData` przechodzi schemat Zod).
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementacja.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit.

### Task 22: Przeniesienie danych ze starej aplikacji

**Files:**
- Create: `server/src/scripts/migrate-old/{read-xlsx.ts,read-firestore.ts,read-drive.ts,transform.ts,run.ts,report.ts,migrate.test.ts}`

**Interfaces:**
- Consumes: `OldData` (Task 21), serwisy modułów (zapis przez serwisy, nie SQL wprost).
- Produces:
  - `readOld(paths, firestore?): OldData` – xlsx przez `exceljs`, Firestore przez REST tylko do odczytu, zdjęcia z Dysku przez Drive API.
  - `transform(old): Plan` – klienci, obiekty, encje, wpisy harmonogramu.
    - **Łączenie klientów:**
      - ten sam znormalizowany telefon albo e-mail → jeden klient,
      - sama ta sama nazwa bez telefonu → osobni + pozycja „do przejrzenia”,
      - lead powiązany ze zleceniem → ten sam klient.
    - **Obiekt:** adres z Obiektów albo „lokalizacja” zlecenia.
    - **Harmonogram:**
      - „A / B” → dwa sloty `pol_dnia`,
      - kod ze słownika → `kod`,
      - zgodne hasło → `zlecenie`,
      - reszta → `tekst` + „do przejrzenia”.
    - Załączniki z `dla_klienta=false`.
    - Numery Z/L bez zmian. Logowanie: każdy dostaje login i hasło startowe (stare linki nie działają).
  - `apply(plan, deps)`; `report(plan, db)` → tabela źródło / baza / różnica + lista „do przejrzenia” (CSV i ekran w Ustawieniach).
  - CLI: `pnpm migrate-old --xlsx Firma.xlsx --appdb Aplikacja.xlsx --firestore <SA_PATH> --drive <folderId> [--dry-run]`.

- [ ] **Step 1: Testy na `oldFixture()`:**
  - dwa zlecenia z telefonem „727 728 903” i „+48727728903” → jeden klient,
  - „Kowalski / Nowak” → dwa sloty po pół dnia z właściwymi zleceniami,
  - literówka → `tekst` + pozycja w „do przejrzenia”,
  - raport: każda liczba w źródle = w bazie, poza zgłoszonymi do przejrzenia,
  - `--dry-run` nic nie zapisuje.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementacja.
- [ ] **Step 4:** PASS. Próbne przeniesienie z prawdziwych eksportów (O3) **tylko lokalnie**, raport do właściciela.
- [ ] **Step 5:** Commit (bez danych).

### Task 23: Produkcja (Hetzner) i przełączenie

**Files:**
- Create: `deploy/{Caddyfile,etner.service,litestream.service,setup.sh}`, `.github/workflows/deploy.yml`

**Interfaces:**
- Produces:
  - Serwer z Ubuntu LTS, `unattended-upgrades`, użytkownik `etner`, Node 22.
  - Caddy (HTTPS dla domeny z O4), systemd dla aplikacji i Litestream.
  - Deploy z GitHuba:
    - po zielonym CI na `main`: build, `rsync` do `releases/<sha>`, zmiana dowiązania `current`, `systemctl restart`,
    - `deploy.yml` z ręcznym `rollback` do poprzedniego `sha`.
  - Sekrety: klucz SSH wdrożenia, VAPID, R2, `GOOGLE_SA_JSON`, `APP_SECRET`. Wkleja je właściciel w ustawieniach repozytorium i w `/etc/etner.env`.

- [ ] **Step 1:** `setup.sh` jest idempotentny. Test: `bash -n` + `shellcheck` w CI.
- [ ] **Step 2:** Uruchomienie na serwerze. `GET /api/health` z domeny → 200. Wymuszony `rollback` działa.
- [ ] **Step 3:** Test odtworzenia: `litestream restore` na czysty katalog → aplikacja startuje z tymi samymi danymi.
- [ ] **Step 4:** Przeniesienie danych na produkcji (Task 22). Raport do właściciela. Wyłączenie wyzwalaczy i wdrożenia Apps Script. Pracownicy dostają login i hasło startowe, nowy adres.
- [ ] **Step 5:** Commit. **STOP: właściciel potwierdza raport przeniesienia i działanie na telefonach.**
