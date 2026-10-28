# Odtworzenie danych ETNER

Kopie powstają trzema drogami:

- **Baza, na bieżąco:** Litestream replikuje `etner.db` do bucketu kopii `R2_BACKUP_BUCKET` (u nas `etner-backup`, bucket produkcji), ścieżka `db` (przechowywanie 720 h = 30 dni). Konfiguracja: `deploy/litestream.yml`. Na Render usługa `etner` startuje pod Litestream, gdy ustawione są `LITESTREAM_*` (`render.yaml`, `startCommand`); plik wykonywalny leży w `bin/litestream`. Render robi też codzienną migawkę dysku `/var/data`.
- **Zdjęcia, co noc o 03:00:** nowe pliki z bucketu roboczego (`R2_BUCKET`) trafiają do `R2_BACKUP_BUCKET` (u nas `etner-backup`) pod prefiks `files/`.
- **Tabele, co noc o 02:30:** eksport wszystkich tabel do arkusza Google (`SHEETS_ID`), do wglądu i jako ostatnia deska ratunku. Arkusz nie zawiera tokenów logowania.

## Zmienne środowiska

| Zmienna | Do czego |
|---|---|
| `DATA_DIR` | katalog z bazą (`etner.db`) i plikami |
| `LITESTREAM_ACCESS_KEY_ID`, `LITESTREAM_SECRET_ACCESS_KEY` | klucz R2 do bucketu kopii; bez nich ciągła kopia bazy jest wyłączona (komunikat w logu przy starcie) |
| `R2_ENDPOINT` | adres S3 konta R2 (`https://<konto>.r2.cloudflarestorage.com`) |
| `R2_BUCKET`, `R2_KEY`, `R2_SECRET` | bucket roboczy ze zdjęciami i jego klucz |
| `R2_BACKUP_BUCKET` | bucket kopii (`etner-backup`): zdjęcia pod `files/`, baza (Litestream) pod `db`; bez niego kopia zdjęć jest pomijana |
| `GOOGLE_SA_JSON` | klucz konta usługi Google (cały JSON); arkusz musi być udostępniony temu kontu do edycji |
| `SHEETS_ID` | identyfikator arkusza z adresu URL |
| `APP_SECRET` | sekret aplikacji |

Klucze wkleja właściciel jako sekrety środowiska. Brak `GOOGLE_SA_JSON` / `SHEETS_ID` lub `R2_BACKUP_BUCKET` nie psuje aplikacji: zadanie jest pomijane, a ostrzeżenie widać w dzienniku błędów (miejsce `eksport` lub `kopia-zdjec`).

## Odtworzenie bazy

Na Render najprościej przywrócić codzienną migawkę dysku: usługa `etner` → **Disks** → migawka → **Restore** (stan sprzed najwyżej doby). Stan z dowolnej chwili z ostatnich 30 dni daje Litestream: kroki niżej, w **Shell** usługi `etner` (zmienne są tam ustawione, `DATA_DIR=/var/data`, program `./bin/litestream`) – najlepiej z pomocą Claude.

1. Zatrzymaj aplikację i Litestream.
2. Przenieś uszkodzoną bazę na bok, jeśli istnieje: `mv $DATA_DIR/etner.db $DATA_DIR/etner.db.uszkodzona` (usuń też pliki `-wal` i `-shm`).
3. Ustaw zmienne z tabeli wyżej, po czym odtwórz najnowszy stan:
   `litestream restore -config deploy/litestream.yml $DATA_DIR/etner.db`
   Stan z chwili w przeszłości: `litestream restore -config deploy/litestream.yml -timestamp 2026-10-20T08:00:00Z $DATA_DIR/etner.db` (w zakresie 720 h).
4. Uruchom aplikację razem z Litestream: `litestream replicate -config deploy/litestream.yml -exec "node server/dist/main.js"`.
5. Sprawdź `/api/health` i ostatnie wpisy w aplikacji.

## Odtworzenie zdjęć

Zdjęcia leżą w buckecie kopii pod `files/<klucz>`; w bazie klucze są bez prefiksu `files/`. Skopiuj je z powrotem do bucketu roboczego (`R2_BUCKET`), np. rclone lub aws cli z `--endpoint-url $R2_ENDPOINT`:

`aws s3 sync s3://etner-backup/files/ s3://<R2_BUCKET>/ --endpoint-url $R2_ENDPOINT`

Gdy aplikacja działa na dysku (bez R2), skopiuj pliki do `$DATA_DIR/files/` (`aws s3 sync s3://etner-backup/files/ $DATA_DIR/files/ --endpoint-url $R2_ENDPOINT`).

Uwaga: kopia zdjęć dodaje nowe pliki, nie usuwa starych, więc zdjęcia usunięte w aplikacji zostają w kopii.

## Ostatnia deska ratunku

Arkusz Google (karta `_info` pokazuje datę eksportu i liczbę wierszy) zawiera wszystkie tabele z usuniętymi rekordami. Nagłówki to nazwy kolumn bazy, kwoty (`*_gr`) są w złotych, wartości logiczne jako TRUE/FALSE.
