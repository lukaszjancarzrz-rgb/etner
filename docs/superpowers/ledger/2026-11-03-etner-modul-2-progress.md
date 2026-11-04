# Progress ledger – moduł 2 (paszport)

Plan: docs/superpowers/plans/2026-11-03-etner-modul-2-paszport.md · Spec: docs/superpowers/specs/2026-10-29-etner-modul-2-paszport-design.md
Owner approved plan 2026-11-03 (execution: subagent-driven, as module 1). Release after each part (2a, 2b, 2c). Rulings continue numbering from module 1 (R65 = link token stored in clear).
- Ruling R66: printing — share/download PNG via the Niimbot app is the baseline (2b); direct printing from the browser via the open-source niimbluelib (Web Bluetooth: Chrome on Android/PC, not iPhone; B4 support unconfirmed) only after a test with the owner's B4 — cost: one extra button later.
Owner 2026-11-03: crews use both Android and iPhone → share/download PNG (works on both) remains the main path; direct Web Bluetooth printing (Android only) stays optional after the B4 test.
Tasks 1–3: impl 6de362e (migration 0023), 2e49a18, 1d23d0d; review dispatched. Gap for Task 4: PATCH attachments for teczka owner (dla_klienta, typDok), delete folder file.
Tasks 1–3: review — Needs fixes: seeded activity dictionary unsavable (duplicate name across categories), category merge via „Zamień na…” → 500 on the unique folder index, no PATCH typDok/dla_klienta for passport attachments nor folder-file delete. Fix round 1 dispatched.
- Ruling R67: default service cycle lives in the dictionary (`dict.cykl_mies` on kategoria rows, seeded 6/12/12), editable in Ustawienia (Task 4) — replaces the name-based default; migration 0023 amended (not released yet).
- Ruling R68: category merge merges passport folders (children moved, source folder soft-deleted) instead of failing.
Tasks 1–3: fix round 1/5 (e5f968c); re-review dispatched. Task 4 (screens) dispatched in parallel (web files).
Tasks 1–3: re-review clean; controller folded 2 minors (old-client cyklMies wipe, empty PATCH) — complete (5640d1a..e5f968c + controller fix).
Task 4: impl 7839722..5f5bd33 (screens, e2e paszport.spec, a11y); review dispatched. Gap: „nowe” in folder (spec §7).
Task 4: review — Needs fixes: folder settings lost if app closes offline (PUT chained after POST in memory); parseHash breaks for categories with / or ~. Fix round 1 dispatched + minors + spec §7 „nowe” in folder (assigned here).
- Ruling R69: clients never see diary entries (owner 2026-10-21) — entry-level „Pokaż klientowi” hidden; only files/photos have „W paszporcie dla klienta”.
- Deferred: device-own instruction file (use folder file type „Instrukcja”).
Task 4: fix round 1/5 (f0f8f19..98af9a1; outbox Write.next, parseHash split-then-decode, R69, tones, folder „nowe” local-only); re-review dispatched. Deferred: folder „nowe” seen is device-local (POST /api/seen accepts only job ids) — follow-up if owner wants cross-device.
Task 4: re-review clean — complete. Part 2a controller verification: shared 15, web 95, server 271, build clean, size 126.5/307.3 kB, e2e 78 passed / 4 skipped. Released 2a to produkcja (migration 0023 additive).
## Owner 2026-11-03 after 2a release → Task 4b: „Paszporty” tab; duplicate sites from the import auto-merged (exact normalized match per client) + manual merge; diary per-attachment toggle visible without opening the viewer. Owner asked whether text of a diary entry with a photo is visible to the client → answered: only the photo (R69); text stays internal.
- Ruling R70: automatic site merge only for exact normalized (nazwa, adres, miejscowość) duplicates of the same client, run once at startup (idempotent) and on create; near-duplicates via manual „Połącz z…” — cost: owner merges typos by hand.
- Ruling R71 (owner 2026-11-03): „Rozliczenie (notatka)” removed from UI and API inputs (DB column kept, additive-only); settlements wait for module 3. Also: passport uploads default dla_klienta ON (faktura internal); folder splits Zdjęcia (images, own „+ Zdjęcie”) vs Dokumenty (files).
Task 4b: impl eb2ab4b..f29b609; review — Needs fixes: startup site merge ran on every boot without guard or per-pair error isolation (spec: one-time). Fix round 1 dispatched (one-time settings guard, try/catch per pair, dedupe in client merge, Paszporty perf, entry photos inherit dlaKlienta, tests, SiteForm hint, one-off faktura dla_klienta=0).
Deferred: offline-queued writes for a merged duplicate site/folder get 4xx and are dropped (deploy when phones synced); optimistic SiteMergeDialog doesn't move passports/devices (flicker until sync).
Task 4b: fix round 1/5 (90fa2ed) re-review clean — complete. Verification: shared 15, web 98, server 278, build clean, e2e 82 passed / 4 skipped. Release held: owner asked about timing (phones' offline queues vs. one-time site merge). After deploy: check first boot log for skipped site pairs.
Owner 2026-11-04: „wydaj” — Task 4b released to produkcja.
Owner 2026-11-04: Word/Excel uploads (docx/xlsx by ZIP part word/ or xl/, doc/xls by OLE magic + extension) — controller change with test; released.
Owner 2026-11-04: folder „Wróć” → #paszporty; logs: Pumble 'already part of channel' treated as success; missing optional backups (R2_BACKUP_BUCKET, Sheets) no longer logged as errors daily (console warn only); SMTP missing still logged (leady e-mail is requested by owner).
Owner 2026-11-04: „następny serwis” label; Samochody repair history collapsible (details) — controller changes, released.
## Owner 2026-11-04: „karta nadrzędna” of a site passport (QR + global info) + deploy rest of module 2 (2b + 2c)
Plan Task 7 amended (site passport screen `#psz/<siteId>`, folder „Wróć” → site card, folder label option).
Pre-flight scan (2b/2c):
| pair / task | produces → consumes | finding |
| 5→6 | passports.token, firma settings → public page header/inactive page | consistent |
| 5→7 | POST /api/passports, /link, GET/PUT settings/firma → web screen, Ustawienia | consistent |
| 6→7 | /p/:token (+#slug anchors) → QR URL, „Podgląd klienta” | amendment needs section anchors by slug in Task 6 — carried in dispatch |
| 7→8 | routes.tsx, badges | sequential, no conflict |
| 5 self | tests vs interfaces | consistent |
| 6 self | CSP no scripts vs plan | consistent |
| 7 self | amended: route `#psz/<siteId>` one segment vs Teczka parts | consistent (parseHash parts only when >1) |
| 8 self | „pierwszy status otwarty”, rodzaj „serwis” | must use existing job status/rodzaj dicts — carried in dispatch |
- Ruling R72: site passport screen at `#psz/<siteId>`; folder „Wróć” → site card (replaces R-owner 2026-11-04 „Wróć” → #paszporty, owner now asked for the parent card) — cost: one extra tap to the list.
- Ruling R73: 2b and 2c released together-or-separately as each passes review (owner: „wdróż … ostatnią część”); reminder e-mail text written per spec (owner had not approved wording yet) — cost: owner rewords later, text in one template.
Tasks 5+6: dispatched one implementer (server, base 76238fd).
Tasks 5+6: impl 396dd60, 9e417b6 (DONE_WITH_CONCERNS: XFF-first IP, in-memory limiter, numer uniqueness via tx, link without opId); review dispatched.
Tasks 5+6: review — spec ✅, Needs fixes: rate limiter keyed on client-controlled leftmost XFF + full map → 429 for all (lockout DoS). Fix round 1 dispatched (rightmost XFF, evict oldest; folded minors: CSP font-src, empty/duplicate slug anchors; ⚠️ soft-deleted site → inactive).
Tasks 5+6: minor (deferred): createPassport timestamps from clock not `at`; no index on passports.token (small table); logo depends on web build; retried /link rotates twice (admin-only, online).
Tasks 5+6: fix round 1/5 (4 addressed, 0 open; commits 9e417b6..a96db40) — complete (396dd60..a96db40, review clean).
- Ruling R74: rate-limit key = rightmost X-Forwarded-For (appended by Render's proxy) — cost if Render appends its own edge address: all visitors share one 60/min bucket → check after deploy by opening /p/ links from two networks.
