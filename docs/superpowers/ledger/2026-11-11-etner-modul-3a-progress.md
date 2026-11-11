# Progress ledger – moduł 3a „Finanse” (Przychody, Koszty, importy, Rozliczone)
Plan: docs/superpowers/plans/2026-11-11-etner-modul-3a-finanse.md · Spec: docs/superpowers/specs/2026-11-11-etner-modul-3-finanse-szkic.md · KPiR: docs/instrukcje/import-kpir.md
Owner 2026-11-11: answers (all admins; KPiR monthly via JSON made by Claude; per-job result concept, materials as estimate; no cash; Rozliczone dialog + optional auto-add); „buduj” (subagent-driven, Sonnet implementers, Opus final review).
- Ruling R87: shared/src/finanse.ts zod-free (web bundle); zod in shared/src/schemas/finanse.ts.
- Ruling R88: cost `miesiac` is a client field (KPiR booking month may differ from document date) — cost: manual date edit keeps month.
- Ruling R89: owner hotfixes built on a worktree from produkcja and released alone; Finanse migration renumbered 0026 (regenerated, newer journal timestamp) after merging the hotfix (0025_krotki_opis).
- Ruling R90: start bundle 149.79/150 kB (eager finance imports) fixed by lazy loading → 134 kB.
Tasks 1–5 complete (40baf17..dff284f), each reviewed; Task 3 verified on the owner's real workbook (local demo DB): 81 revenues (3 cash+invoice rows split), 758 costs, 9 KPiR months, monthly netto sums equal to „Wyniki firmy”.
Final review (Opus): ready with fixes I1 (KPiR duplicates only vs DB, sums from stored month), I2 (migration order), I3 (sheet import blocked only by non-deleted rows) + costs editable → fixed (02366ae..ddbfa01), re-review clean; lazy-load 3be298f.
Owner hotfix bundle (Do serwisu link, Serwis badge/filter, job delete, krótki opis, phone Wróć, stable chips) released 2026-11-11 (46a5eb9, migration 0025 additive).
Verification at 3be298f: shared 21, web 111, server 310; build ok; size 134.06/150, 362.08/500 kB; full e2e 95 passed / 5 skipped / 0 failed.
Deferred minors: auto-add path untested (lead value treated as brutto); no server guard vs second revenue per job; dialog only on job edit (not on create with Rozliczone); negative invoice (credit note) rows skipped in sheet import; hotfix minors (empty number on optimistic link, delete confirm never expires, first not newest open service job).
Release pending owner OK (new module + migration 0026). After deploy: owner runs Ustawienia → „Finanse z arkusza” (trial, then save) before using Finanse.
Owner 2026-11-11: „tak” — Finanse 3a released to produkcja + modul-1 (6ddfdd4, migration 0026 additive). Owner runs sheet import next.
Owner 2026-11-11 (after 3a release, all released): sheet import done on production (81 revenues). Released fixes: Finanse default whole year, Materiały column, revenue link on job card, krótki opis in job tile, auto job status from schedule (Nowe/Do wyceny ↔ Zaplanowane), status_zlecenia dictionary locked (403, hidden in Ustawienia), Wrench mark for service jobs in schedule, Do serwisu shows job schedule dates / „brak w harmonogramie”, Zlecenia desktop: clicking the open row closes the panel.
Known flaky: web/e2e/demo.spec.ts:105 fails when re-run on the same DB (not idempotent) — fix when touching e2e.
NEXT: module 3b (Wynik firmy, Kontrola KPiR, Statystyki) — write plan from spec §2 (1, 4, 5) in a fresh session; then 3c (wynik zlecenia, spec §6.3).
Owner 2026-11-11: 3b (Wynik, KPiR, Statystyki; employee costs per month in settings 'finanse_place') + Wykresy tab (9 SVG charts, app category colours with legends; reference palette for cost categories) released together (19c4258). Next: 3c (wynik zlecenia, spec §6.3), then Płace in a fresh session.
