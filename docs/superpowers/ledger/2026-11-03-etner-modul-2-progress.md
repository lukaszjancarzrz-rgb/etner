# Progress ledger – moduł 2 (paszport)

Plan: docs/superpowers/plans/2026-11-03-etner-modul-2-paszport.md · Spec: docs/superpowers/specs/2026-10-29-etner-modul-2-paszport-design.md
Owner approved plan 2026-11-03 (execution: subagent-driven, as module 1). Release after each part (2a, 2b, 2c). Rulings continue numbering from module 1 (R65 = link token stored in clear).
- Ruling R66: printing — share/download PNG via the Niimbot app is the baseline (2b); direct printing from the browser via the open-source niimbluelib (Web Bluetooth: Chrome on Android/PC, not iPhone; B4 support unconfirmed) only after a test with the owner's B4 — cost: one extra button later.
Owner 2026-11-03: crews use both Android and iPhone → share/download PNG (works on both) remains the main path; direct Web Bluetooth printing (Android only) stays optional after the B4 test.
Tasks 1–3: impl 6de362e (migration 0023), 2e49a18, 1d23d0d; review dispatched. Gap for Task 4: PATCH attachments for teczka owner (dla_klienta, typDok), delete folder file.
Tasks 1–3: review — Needs fixes: seeded activity dictionary unsavable (duplicate name across categories), category merge via „Zamień na…” → 500 on the unique folder index, no PATCH typDok/dla_klienta for passport attachments nor folder-file delete. Fix round 1 dispatched.
- Ruling R67: default service cycle lives in the dictionary (`dict.cykl_mies` on kategoria rows, seeded 6/12/12), editable in Ustawienia (Task 4) — replaces the name-based default; migration 0023 amended (not released yet).
- Ruling R68: category merge merges passport folders (children moved, source folder soft-deleted) instead of failing.
