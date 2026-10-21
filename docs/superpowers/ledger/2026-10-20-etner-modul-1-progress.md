# SDD ledger — plan: docs/superpowers/plans/2026-10-20-etner-modul-1.md

Spec: docs/superpowers/specs/2026-10-20-etner-aplikacja-design.md + 2026-10-20-etner-modul-1-design.md
Branch: modul-1 (worktree /home/claude/etner-m1), base main 312a013

## Pre-flight scan

| Tasks | Produces vs consumes | Finding |
|---|---|---|
| T1–T18 | createApp serves API; T18 render start serves web/dist | T1 has no static serving → Ruling R1 |
| T3–T5 | recordChange (T3) must trigger broadcast (T5) | T3 is before T5 → Ruling R2 |
| T3–T15 | export needs list of tables | TABLES_FOR_EXPORT undefined → Ruling R3 |
| T8–T10/T13 | users.crewMembers/admins → notify recipients | consistent |
| T9–T10 | klienci.get / create used by zlecenia.save(newClient) | consistent; worker visibility vague → Ruling R4 |
| T10–T14 | zlecenia.active → harmonogram; jobDays used by zlecenia lists (web) | consistent |
| T11–T12 | leady.toJob uses dziennik.addSystem (T12 later) | order → Ruling R5 |
| T12–T14 | dziennik uses harmonogram.peopleForJob (T14 later) | plan says stub; Ruling R6 |
| T16 | seed needs all modules | after T14, ok |
| T17–T18/19 | web core consumed by screens | consistent |
| T21–T22 | OldData fixture → migration | consistent |
| each task | own text self-consistent | T2 fmtZl uses Intl narrow nbsp: test must use the exact char Intl produces → Ruling R7 |

## Rulings
- Ruling R1: Task 1 createApp also serves `web/dist` statically (SPA fallback to index.html) when the folder exists — needed by T18 single-service deploy — cost if wrong: trivial removal.
- Ruling R2: Task 3 `recordChange` emits on an in-process `changeBus` (EventEmitter) after transaction commit (`tx` collects seqs and emits after COMMIT); Task 5 subscribes — cost if wrong: refactor of one emitter.
- Ruling R3: `ModuleDef` gets `tables?: Record<string, SQLiteTable>`; export = all module tables + core `firmy`, `users` (without token hash), excluding sessions, op_ids, push_subscriptions, changes — cost: small.
- Ruling R4: workers receive a client (projection `forWorker`) only if the client has ≥1 non-deleted job; lead-only clients are hidden; sites likewise — matches spec "pracownik nie dostaje danych klienta poza tym, co jest na zleceniu" — cost: visibility tweak.
- Ruling R5: Task 11 takes `deps.diary?.addSystem` optional (no-op when absent); Task 12 registers it into AppDeps — cost: minor wiring.
- Ruling R6: Task 12 uses `deps.schedule?.peopleForJob` defaulting to `() => []`; Task 14 provides it — cost: minor wiring.
- Ruling R7: money format tests compare against `Intl.NumberFormat('pl-PL')` output char (U+00A0) — cost: none.

## Progress
Task 1: BLOCKED — registry.npmjs.org denied by session egress proxy (403 CONNECT, DNS bypass fails); uncommitted scaffold in worktree; waiting for owner to enable npm access

## Sesja 2 (2026-10-21)
- npm/pnpm registry reachable again (npm view OK) — Task 1 unblocked.
- Ruling R8: work happens on session branch `claude/great-lovelace-gwkc9f` (fast-forwarded from `origin/modul-1`); after each task both `claude/great-lovelace-gwkc9f` and `modul-1` are pushed (fast-forward only) — the owner named `modul-1` as the working branch — cost if wrong: delete one remote branch.
- Ruling R9: commit trailer uses the current session URL (session_01HTiD5JyMBT5NuhkatKv4V7) instead of the plan's old one — trailer must point at the session that made the commit — cost: none.
- Ruling R10: ledger stays committed here (docs/superpowers/ledger) instead of only in git-ignored .superpowers/sdd — cloud containers are ephemeral; briefs/reports live in .superpowers/sdd — cost: none.
Task 1: BASE 6da7c8c; impl 8a50857; review: Important — deps majors (TS7/React19) vs plan
- Ruling R11: pin typescript ^5, react ^18 (plan stack); vite/vitest majors chosen by peerDeps of vite-plugin-pwa and @tailwindcss/vite — cost if wrong: one version bump later.
Task 1: minor (deferred): index.html read once at startup (needs restart after web rebuild) — fine for deploy model
Task 1: fix round 1/5 (4 addressed, 0 open; commits 8a50857..87a3a70)
Task 1: minor (deferred): two vite majors in lockfile (vitest optional peer resolves vite 8 in server/shared) — collapse when web plugins are added
Task 1: minor (deferred): SPA fallback 404s client routes whose last segment has a dot (e.g. /x/1.5)
Task 1: complete (commits 6da7c8c..87a3a70, review clean)
Task 2: minor (deferred): dayOf lacks 23:30-local and DST-boundary test cases (Review Focus 3) — add 2026-10-20T21:30Z→10-20, 2026-01-15T23:30Z→01-16, 2026-03-29T01:30Z→03-29
Task 2: minor (deferred): Wigilia returned for years <2025; newId re-export exposes seedTime; fmtZl(-0.4) → "-0,00 zł"
Task 2: complete (commits d8e45e4..ba408a3, review clean)
- Ruling R13: logError takes db first: logError(db, where, err, userId?) (no global db); recentErrors(db) helper for Task 4 — cost: none.
Task 3: BASE 2900590; impl e1f057f; review: Important — global modules list; controller adds per-db changeBus, emit outside try, opId user check
Task 3: minor (deferred): nested tx has no SAVEPOINT; undefined result stored as null; runOp accepts Promise fn; no index changes(entity,entity_id); recentErrors unused until T4
Task 3: fix round 1/5 (4 addressed, 0 open; commits e1f057f..d7ea7bf)
Task 3: minor (deferred): foreign-user opId throws plain Error → 500; map to 409 when routes use runOp
Task 3: complete (commits 2900590..d7ea7bf, review clean)
Task 4: minor (deferred): requireAdmin wraps requireUser with custom next; old session not deleted on re-login, expired sessions never purged; cookie Path / limit / forged-cookie tests missing; deleteCookie without flags
Task 4: complete (commits e605ed1..f213c91, review clean)
Task 5: BASE 5820237; impl ac6dc6e; review: Important — swallowed SSE drain error; controller adds session recheck, Last-Event-ID, Object.hasOwn
Task 5: minor (deferred): clients list write-only; tests lack since>0 SSE, hidden rows between since, concurrent backlog/live
Task 5: fix round 1/5 (4 addressed, 0 open; commits ac6dc6e..57e85ad)
Task 5: minor (deferred): ping-path .catch(stop) unlogged; client-abort during drain logs a noise error row; ping-path session check untested
Task 5: complete (commits 5820237..57e85ad, review clean)
Task 6: BASE a87ca96; impl ec5fef0; review: Important — empty APP_SECRET fallback (forgeable links)
Task 6: minor (deferred): makeVariants decodes image 3x (perf); disk content-type from extension only
Task 6: fix round 1/5 (4 addressed, 0 open; commits ec5fef0..6c56d9c)
Task 6: minor (deferred): serve() checks KEY_RE but not ./.. segments — validly signed bad key → 500 (needs APP_SECRET)
Task 6: complete (commits a87ca96..6c56d9c, review clean)
- Ruling R14: notify is `notify(deps, userIds, n)`; push sender injected as AppDeps.push; morning job: core `settings` key-value table (key `rano_godzina`, default '07:00'); CronDef.schedule may be the literal 'rano' — registerCron checks every minute (Europe/Warsaw) and runs 'rano' defs when HH:MM matches; VAPID missing outside demo → push disabled with a warning (notify returns 0) — cost: small.
Task 7: BASE eefa69a; impl b184987; review: Important — disabled push logs error per subscription
Task 7: minor (deferred): rano tick no overlap / once-per-day guard; corrupt vapid.json throws at start; real web-push sender untested
Task 7: fix round 1/5 (4 addressed, 0 open; commits b184987..6824695)
Task 7: minor (deferred): rankoGodzina DB read outside try/catch in minute tick
Task 7: complete (commits eefa69a..6824695, review clean)
- Ruling R15: real Parametry lists are not in the repo (O3 not delivered) — Task 8 seeds best-guess dictionaries matching every value later tasks/tests name ('Rozliczone'→zamkniete, 'Na później'→pozniej, lead 4th value 'Przyjęta', 'ekipa Bartek', 'mieszane', 'Do zrobienia'/'Zrobione'); owner edits in app, Task 22 imports real lists — cost: owner corrects values.
- Ruling R16: personal link format `<origin>/login#<token>` (token in hash, never sent to server logs); origin from env BASE_URL or request — cost: trivial.
- Ruling R17: Task 8 also seeds one firma 'ETNER' when none exists (needed by firm-scoped tables) — cost: none.
Task 8: BASE 0759566; impl d695a59; review: Important — plaintext login link cached in op_ids.result
Task 8: minor (deferred): no test for PUT /api/dict opId replay / update+resurrect branches; users.admins/crewMembers return ids
Task 8: fix round 1/5 (4 addressed, 0 open; commits d695a59..0f94d1a)
Task 8: minor (deferred): op_ids test checks '/login#' not raw token; BASE_URL test deletes rather than restores; lost-response replay gets link:null (use new-link)
Task 8: complete (commits 0759566..0f94d1a, review clean)
- Ruling R18: klienci.visibleTo for workers asks an injected `deps.clientHasJobs?(clientId)` (default false → hidden); Task 10 provides it. When a job is created or its client/site changes, zlecenia records an 'update' change for that client and site (re-emit) so workers who never got the earlier client change receive it — cost: extra change rows.
Task 9: minor (deferred): snapshot leak assertion weak (no length/whitelist check); no worker-403 tests on write routes; '+48 727' partial phone query; szukaj updates not in changes; Record<string,any> in projections
Task 9: minor → carried into Task 10: addSite spreads Partial input (explicit undefined → NOT NULL) — Task 10 calls it directly
Task 9: complete (commits f86fca0..12653e4, review clean)
Task 10: BASE 1253d86; impl 241e714; review: Important — zod4 .partial() keeps defaults → partial PUT wipes fields (check all modules)
Task 10: minor (deferred): newClient silently ignores clientId; no invalid-status PUT test; next numer scans all jobs (shortcut); notify title tail = job number
Task 10: fix round 1/5 (3 addressed, 0 open; commits 241e714..322e559)
Task 10: minor (deferred): push-failure test doesn't exercise the route-level .catch (notify already absorbs sender errors)
Task 10: complete (commits 1253d86..322e559, review clean)
Task 11: minor (deferred): untested no-client toJob path, diary-absent, opId replay on contact/to-job, soft-deleted numbering; save uses new Date() not injectable now; toJob needs explicit job.status; cron test doesn't assert worker excluded
Task 11: complete (commits 52b537e..a369664, review clean)
- Ruling R19 (Task 12): pending uploads are attachments rows with owner_type/owner_id NULL owned by the uploader (no change recorded until attached); variants made at upload; file bytes reached via GET /api/attachments/:id/file?v=orig|view|thumb (requireUser + owner visibility) → 302 to a signed URL, so <img src> works with the session cookie; attachment visibility follows its entry; lead diary URL '#ld/<leadId>~<entryId>' — cost: small.
Task 12: BASE a5ec363; impl 1ba8261; review: Important — 25 MB limit applied after buffering whole body
Task 12: minor (deferred): never-attached pending uploads not cleaned; files.put before DB insert can orphan files; diary entry dla_klienta default untested
Task 12: fix round 1/5 (3 addressed, 0 open; commits 1ba8261..e521af2)
Task 12: minor (deferred): 413 shapes differ ({error} from bodyLimit vs HTTPException message) — final review: check API error shape consistency app-wide
Task 12: complete (commits a5ec363..e521af2, review clean)
- Ruling R20 (Task 13): checklist text edits are admin-only (crew members only toggle `zabrane`; author or admin deletes); crew = users with user.ekipa === checklist.ekipa; add allowed for crew members and admins; add → push to crew minus author — cost: small permission tweak.
Task 13: BASE 906a5c1; impl 03d7e3b; review: Important — checklist move leaks to old crew; core/body.ts 6th verbatim copy
Task 13: minor (deferred): author who changed crew can't delete own item; PUT ekipa not validated; pending() filters in JS; missing tests (admin-author Kupione no push, non-author co edit 403, cron skip without subs)
Task 13: fix round 1/5 (4 addressed, 0 open; commits 03d7e3b..4fe01f2) — core/sync toOut now honours the action returned by visibleTo
Task 13: complete (commits 906a5c1..4fe01f2, review clean)
- Ruling R21 (Task 14): draft key = `<dzien>|<personId>` or `<dzien>|uwagi`; proposal = full desired cell (array of 0–2 slot values {rodzaj, jobId?, kod?, tekst?, polDnia}) or {tekst} for notes; proposalHash = sha256 of canonical JSON of proposal; approve applies only drafts whose current hash matches; schedule entries unique (dzien, person_id, slot) as a partial unique index WHERE deleted_at IS NULL (soft delete kept); peopleForJob = users of schedule_people having any non-deleted entry for the job; module sets deps.schedule = {peopleForJob} — cost: moderate if owner wants other draft semantics.
Task 14: minor (deferred, worth fixing before T18 review): cellLabel ignores polDnia (full→half on same job sends no push); approve items with no live draft missing from skipped; dzien_wolny info = bare date (should read e.g. "Dzień wolny"); timestamps use new Date() not deps.now; jobId not re-validated at approve; no DB-level one-draft-per-key index
Task 14: plan-mandated note: peopleForJob counts past entries (R21 literal) — owner may want only current crew
Task 14: complete (commits 7181209..0b3da51, review clean)
- Ruling R22 (Task 15): TABLES_FOR_EXPORT = every registered module's tables + core firmy + users (token_hash column dropped); excluded sessions, op_ids, push_subscriptions, changes, errors, settings; columns ending `_gr` exported as zł number (2 decimals); SheetsClient injected (googleapis impl from GOOGLE_SA_JSON + SHEETS_ID); kopia-zdjec copies keys of attachments created since the last run (settings key) from R2_BUCKET to R2_BACKUP_BUCKET via S3 CopyObject, skipped (logged) without R2 — cost: small.
Task 15: BASE 9ddc052; impl b746829; review: Important — non-atomic clear+single huge batchUpdate; missing failed-copy cursor test
Task 15: minor (deferred): CopyObject uses one R2 key for both buckets (owner must grant it both); litestream config untested against real version
Task 15: fix round 1/5 (4 addressed, 0 open; commits b746829..8a1e6b1)
Task 15: minor (deferred): chunking by rows only (request size); ~2 requests/table vs 60/min write quota, no backoff; silent 50k truncation; failed-copy test starts without cursor
Task 15: complete (commits 9ddc052..8a1e6b1, review clean)
- Ruling R23 (Task 16): DEMO tokens are deterministic (HMAC(APP_SECRET, 'demo:<login>')) so links survive restarts on Render (/tmp is wiped → reseed); links printed in the log at start AND listed by GET /api/demo/links (only when DEMO=1) so the owner can pick a user on a phone — data is invented, so the public list is acceptable for the demo; never enabled without DEMO=1 — cost: remove route before production (DEMO off).
Task 16: minor (deferred): seed inserts attachments directly (duplicates upload route row shape); orphan files if seed tx fails; demoLinks prints links without checking stored hash; checklist test doesn't check both crews per day
Task 16: complete (commits c9d8653..41c0014, review clean)
- Ruling R24 (Task 17): synced data lives in a small custom store (Map per entity + useSyncExternalStore, persisted with idb-keyval) as the plan's Interfaces describe; TanStack Query is NOT added until a screen needs ad-hoc server queries (YAGNI vs plan stack line) — cost: add it later in one place.
- Ruling R25 (Task 17): routing is a tiny hash router matching the notification URL format `#<screen>/<param>~<highlightId>` (e.g. `#zl/<id>~<entryId>`, `#harm/<day>`, `#jutro~<id>`); React Router not added — HashRouter would need `#/zl`, breaking the URLs the server already sends; `/login#<token>` is handled before the router — cost: swap to React Router later if nesting grows.
Task 17: BASE 0a62c66; impl f044e4c (resumed after API rate limit); review dispatched
Task 17: review: Important — multi-tab outbox overwrite (data loss), 401 on SSE reconnect not detected, undo overwrites newer server data
Task 17: minor (deferred): snapshot replace drops optimistic records during first sync; misleading 'Błąd serwera' text for 4xx without error string
Task 17: fix round 1/5 (4 addressed, 0 open; commits f044e4c..16e3280)
Task 17: minor (deferred): tab B may send tab A's item → A's awaiting caller hangs / no rollback in A on 4xx; two rejected writes to same record leave first optimistic value; wake() skips catch-up when stream reports open; stop() may wait on another tab's lock
Task 17: complete (commits 0a62c66..16e3280, review clean)
- Ruling R26 (Task 18): this session has no Render credentials (owner step O2) — Task 18 delivers render.yaml (Blueprint, branch modul-1, free plan, DEMO=1, DATA_DIR=/tmp/etner, APP_SECRET generated by Render, R2 vars as sync:false secrets) + local e2e on the production build + phone/desktop screenshots; the owner creates the service from the Blueprint — cost: one manual step for the owner.
Task 18: BASE 0d3fb75; impl 4951fd9..6156d48; review dispatched
Task 18: review: Important — withoutEchoes hides genuinely new look-alike entries (offline duplicates); demo cookie not Secure; month view missing
- Ruling R27: month view dropped for the owner checkpoint (week table + prev/next on desktop); owner decides after review — cost: one more screen later if wanted.
Task 18: minor (deferred): no worker-role e2e; job form / Zakupy admin controls / „Pokaż klientowi” / swipe only checked by eye; corepack on Render unverified until owner deploys
Task 18: fix round 1/5 (all addressed, 0 open; commits 85b9752..4bdb655)
Task 18: minor (deferred): 30 s echo window assumes phone clock within 30 s of server
Task 18: complete (commits 0d3fb75..4bdb655, review clean) — controller verified: unit 12/21/128 pass, build clean, e2e 2/2 pass
STOP: owner checkpoint after Task 18 (deploy via render.yaml Blueprint = owner step O2). Final whole-branch review runs after the last task.

## Zmiana właściciela 2026-10-21: login i hasło zamiast linków
- Owner decision (not a ruling): replace personal links with login (first name / short name) + password; admin sets the initial password and resets it, worker may change own password; done now as Task 18a, before Task 19. Spec + plan amended (plan section "Zmiana 2026-10-21", new Task 18a).
- Ruling R28: scrypt from node:crypto (no new dependency), format `scrypt$<salt b64>$<hash b64>` with timingSafeEqual; failed-attempt limit in process memory (5 per login / 15 min → 429), shortcut acceptable for one process; token_hash column dropped; R16/R23 superseded (demo: fixed demo password, GET /api/demo/konta only with DEMO=1, login screen lists demo accounts); Task 22 will not carry old link tokens — cost: owner hands out passwords at go-live.
Task 18a: BASE 8b83f13; impl a239af4; review dispatched
Task 18a: review Approved (no Critical/Important)
- Ruling R29: security minors from the 18a review are fixed now in one hardening round instead of deferring (async scrypt + race-free limiter, capped limiter map, limit on /api/me/haslo, password length cap, revoke incoming session on login, dummy scrypt for null hash, demo password single source, first-admin CLI create-admin for fresh production DB) — the app is a security boundary and each fix is small — cost: one extra fix round.
Task 18a: minor (deferred): soft-deleted users keep their login in the unique index (cannot be reused); no way back from the login screen to cached data when expired
Task 18a: hardening round d4d4fee (R29 items 1–9)
Owner withdrew both 2026-10-21 (2) changes ("zostawmy to na razie"): Task 18b removed from plan/spec; nothing in code changed. Client editing UI and „pokaż klientowi” scope remain open questions for later.
Task 18a: hardening re-review — all 9 addressed, no new breakage (commits a239af4..d4d4fee)
Task 18a: minor (deferred): 5000 distinct logins can fill limiter (429 for new keys ≤15 min); anyone can lock a known login with 5 bad attempts (accepted)
Task 18a: complete (commits 8b83f13..d4d4fee, review clean)
Note: klienci worker-visibility test failed once (1/9 runs) while a reviewer subagent was concurrently running/checking out the repo (it left HEAD detached at d4d4fee — reviewer violated read-only; fixed by cherry-pick); 8 later runs green — watch for flakiness in final review
## Zmiany właściciela 2026-10-21 (3): harmonogram → Task 18c
- Owner: multi-person / multi-day entry in the cell editor; month view on desktop (supersedes R27); admins have no schedule rows at all. Plan amended (Task 18c).
- Owner: existing clients must be editable → Task 18d (plan amended); dispatched together with 18c.
- Owner: remove shopping group 'Biuro' (R15 seed correction) — added to the 18c/18d implementer as a separate commit.
Tasks 18c/18d + 'Biuro': implemented (581955d, b720240, 13778cb; container restarted after the agent finished — report in task-18cd-report.md); review dispatched
## Zmiany właściciela 2026-10-21 (4) → Task 18e (plan amended)
- Shopping: only co + uwagi; no kwota/sklep/grupa; statuses Do kupienia / Kupione only. Job scope: list of points (text + photos), admin-edited (owner picked this over Pumble-style threads). Nav badges with counts (na jutro untaken, schedule changes, jobs with news, shopping to buy for admin).
Tasks 18c/18d: review Approved; Important — multi-person/day save silently overwrites others' different entries (drafts, reviewable) → fix queued as a separate commit after 18e (overwrite warning + confirm); minor: PUT clients returns duplicates on every save (queued too)
Tasks 18c/18d: minor (deferred): client form "Zapisywanie…" waits for queued retry when server unreachable; server doesn't validate e-mail format; plHolidays per month cell; week→month shows Monday's month; no unit test for optimistic multi-cell; existing DBs keep 'Biuro' (edit in Ustawienia)
Task 18e: BASE bce12dd; impl f4fbfff..13bda48 (+18c overwrite warning e97ac49); review: Important — migrated scope points stamped with migration time (false 'nowe'); fix round 1 dispatched with minors (worker phantom news, badges computed once, midnight, sklep→uwagi, armed warning reset, duplicates only on change, scope kolejnosc, URL revoke, remove single scope photo)
Task 18e: fix round 1/5 (all addressed; commit 1e16c87) — controller verified: unit 12/31/148, build clean, e2e 11 passed 1 skipped
Task 18e: minor (deferred): migrations 0010/0011 edited in place before any deploy (local DBs need fresh DATA_DIR); client PUT replay returns duplicates []
Tasks 18c/18d/18e: complete (commits 1f6c50e..1e16c87, review clean). Owner checkpoint again.
## Zmiany właściciela 2026-10-21 (5) → Task 18f (plan amended)
- Week nav fixed arrows + „Dziś” (scroll to today); month view = same cards as week, horizontal arrows; chip colour = job kategoria (elektryka blue, fotowoltaika red, rekuperacja green, klimatyzacja purple, inne yellow); dict kategoria/rodzaj changed (+przygotówka, −gwarancja, −Pompa ciepła, −Serwis kategoria); zakupy: delete only admin/author, admin checkbox instead of status select; „nowe” persists until the changed day / job is actually seen; push enable button + test push (pulled forward from Task 19 so the owner can test push on Render).
- Ruling R30: user said „rodzaj zlecenia” for colours but the example values are the kategoria list → colour by kategoria — cost: switch the colour source if owner meant rodzaj.
