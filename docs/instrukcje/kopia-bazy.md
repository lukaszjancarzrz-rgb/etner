# Kopie danych ETNER

## Co się robi samo
| Kopia | Kiedy | Gdzie |
|---|---|---|
| Ciągła kopia bazy (Litestream) | na bieżąco | Cloudflare R2, katalog `db/` |
| **Pełna kopia bazy** | codziennie 3:45 | R2 (bucket kopii albo zdjęć), katalog `kopie-bazy/`, plik `etner-RRRR-MM-DD.db.gz` |
| Eksport do arkusza Google | codziennie 2:30 | arkusz z `SHEETS_ID` |
| Kopia zdjęć | codziennie 3:00 | bucket `R2_BACKUP_BUCKET` |

Pełne kopie bazy: zostają z ostatnich 30 dni oraz z 1. dnia każdego miesiąca przez rok. Stan i przycisk „Zrób kopię bazy teraz”: **Ustawienia → Stan kopii**.

## Przywrócenie bazy z wybranego dnia
1. Render → usługa **etner** → **Shell**.
2. Lista kopii:
   ```
   pnpm --filter @etner/server kopia:przywroc
   ```
3. Przywrócenie (np. z 14 listopada):
   ```
   pnpm --filter @etner/server kopia:przywroc 2026-11-14
   ```
4. Render → **Manual Deploy → Restart service**. Przy starcie obecna baza zostaje odłożona obok (`etner.db.przed-odtworzeniem-…`), a kopia zaczyna działać.
5. Telefony same pobiorą dane od nowa; zmiany zrobione po godzinie kopii trzeba wpisać ponownie.

## Pobranie kopii na własny komputer
Cloudflare → R2 → bucket → katalog `kopie-bazy/` → plik → **Download**. Plik `.db.gz` to spakowana baza SQLite (rozpakuj np. 7-Zip, otwórz programem „DB Browser for SQLite”). Zawiera wszystkie dane firmy, w tym płace – przechowuj bezpiecznie.
