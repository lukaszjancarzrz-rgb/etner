# Progress ledger – moduł 5 „Czasomierz”
Spec: docs/superpowers/specs/2026-11-14-etner-modul-5-czasomierz-design.md
Owner 2026-11-14: mockups approved („wdrażamy czasomierz”); answers C3 (auto-stop 20:00 or 11 h from start), C4 (edit window current + previous week), C6 (Płace hint + Wstaw), C7 (robocizna from timer hours).
- Ruling R95: timer start/stop are id-less actions (POST /api/time/start|stop act on the user's running entry) so the offline queue works before the start reaches the server; a late start/stop after auto-stop closes the auto-stopped entry instead of overlapping it.
- Ruling R96: robocizna per person-day: days with timer entries use hours × hourly cost, other days schedule entries × day cost; monthly hours = timer hours + schedule days without timer × godzDnia (consistent first month of use).
- Ruling R97: worker bottom bar Harmonogram, Zlecenia, Czasomierz, Zakupy, Więcej; Na jutro in Więcej (badge summed on Więcej) – as on the approved mockup.
- Ruling R98: worker may delete only manual entries they created themselves; office-added entries only by admin.
Tasks: server + shared + migration 0028 (d7c5157), robocizna/Płace/job card (fb0236c, 4750cec), screens (0bdbb9e, Sonnet), review fixes (Opus review: late switch after auto-stop, running-entry overlap, radio remount each second, cron vs stop race, midnight entries, admin tmp rows, edit-window inside runOp, delete of office entries).
Verification: shared 25, web 139, server 330; build ok; size 137.09/150, 418.27/500 kB; e2e full run 100 passed / 6 skipped / 4 failed → 2 caused by new bottom bar (fixed, rerun green), 2 known flaky (full.spec:12, paszport.spec:128); czas.spec + a11y green.
Owner 2026-11-14: „tak” — Czasomierz released to produkcja + modul-1 (migration 0028 additive).
Owner 2026-11-15: Czasomierz → Wpisy: pencil edit button on each entry, tap on entry opens job card (Wróć returns: tab, filters, week remembered in session); fix: Start right after Stop was rejected (stop padded end to +1 min → now +1 s). Released (R86).
