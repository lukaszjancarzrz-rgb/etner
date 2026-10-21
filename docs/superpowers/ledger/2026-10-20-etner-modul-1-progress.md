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
