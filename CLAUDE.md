# ETNER – zasady dla Claude

- Pisz do właściciela po polsku, krótko, zrozumiale dla osoby nietechnicznej.
- Stan projektu: `web/PRODUCT.md`, `web/DESIGN.md`, ledgery w `docs/superpowers/ledger/` (decyzje R1…), specyfikacje w `docs/superpowers/specs/`.
- Gałąź robocza `claude/great-lovelace-gwkc9f`; wydanie = push tej gałęzi na `modul-1` i `produkcja` (Render buduje z `produkcja`). Poprawki po testach i przeglądzie idą od razu na produkcję, bez zrzutów i bez pytania (R86); nowe moduły i zmiany bazy – po zgodzie właściciela.
- Migracje bazy wyłącznie dodające; nigdy nie usuwaj ani nie nadpisuj danych produkcyjnych. Prawdziwych danych klientów nie commituj.
- Testy przed wydaniem: `pnpm -r test`, `pnpm -r build`, `pnpm size` (web), e2e Playwright (Chromium jest zainstalowany – nigdy `playwright install`).
- Hasła i klucze (R2, SMTP, VAPID…) właściciel wpisuje sam w Render.
- Miesięczny import kosztów z KPiR (PDF → plik JSON): `docs/instrukcje/import-kpir.md`.
