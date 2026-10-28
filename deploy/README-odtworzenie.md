# Odtworzenie danych ETNER

Kopie powstają trzema drogami:

- **Baza, na bieżąco:** Litestream replikuje `etner.db` do bucketu zdjęć `R2_BUCKET` pod prefiks `db/` (przechowywanie 720 h = 30 dni), tym samym kluczem `R2_KEY` / `R2_SECRET`. Aplikacja nie zapisuje ani nie kasuje plików pod `db/`. Konfiguracja: `deploy/litestream.yml`. Na Render usługa `etner` startuje pod Litestream, gdy ustawiony jest `R2_BUCKET` (`render.yaml`, `startCommand`); program leży w `./bin/litestream`. Render robi też codzienną migawkę dysku `/var/data`.
- **Zdjęcia, co noc o 03:00 (opcjonalnie):** nowe pliki z bucketu roboczego (`R2_BUCKET`) trafiają do `R2_BACKUP_BUCKET` (np. `etner-backup`) pod prefiks `files/`.
- **Tabele, co noc o 02:30:** eksport wszystkich tabel do arkusza Google (`SHEETS_ID`), do wglądu i jako ostatnia deska ratunku. Arkusz nie zawiera tokenów logowania.

## Zmienne środowiska

| Zmienna | Do czego |
|---|---|
| `DATA_DIR` | katalog z bazą (`etner.db`) i plikami |
| `R2_ENDPOINT` | adres S3 konta R2 (`https://<konto>.r2.cloudflarestorage.com`) |
| `R2_BUCKET`, `R2_KEY`, `R2_SECRET` | bucket roboczy ze zdjęciami i ciągłą kopią bazy (`db/`) oraz jego klucz; bez `R2_BUCKET` ciągła kopia bazy jest wyłączona (komunikat w logu przy starcie) |
| `R2_BACKUP_BUCKET` | opcjonalny bucket nocnej kopii zdjęć (`files/`); bez niego kopia zdjęć jest pomijana |
| `GOOGLE_SA_JSON` | klucz konta usługi Google (cały JSON); arkusz musi być udostępniony temu kontu do edycji |
| `SHEETS_ID` | identyfikator arkusza z adresu URL |
| `APP_SECRET` | sekret aplikacji |

Klucze wkleja właściciel jako sekrety środowiska. Brak `GOOGLE_SA_JSON` / `SHEETS_ID` lub `R2_BACKUP_BUCKET` nie psuje aplikacji: zadanie jest pomijane, a ostrzeżenie widać w dzienniku błędów (miejsce `eksport` lub `kopia-zdjec`).

## Odtworzenie bazy

Aplikacja przy starcie (i `startCommand` przed Litestream) sprawdza, czy w `DATA_DIR` leży `restore.db`. Jeśli tak, sprawdza, że to baza SQLite (inaczej odkłada plik jako `restore.db.niepoprawny` i nic nie zmienia), przenosi bieżącą bazę na bok jako `etner.db.przed-odtworzeniem-<data i godzina>` (z `-wal` / `-shm`; kolejne odtworzenie jej nie nadpisze) i wstawia `restore.db` na miejsce `etner.db`. Dzięki temu odtworzenie nie wymaga zatrzymywania działającej aplikacji.

### Na Render (usługa `etner`)

Najprościej, stan sprzed najwyżej doby: usługa `etner` → **Disks** → migawka dysku → **Restore** (nazwy mogą się różnić).

Stan z dowolnej chwili z ostatnich 30 dni (Litestream), najlepiej z pomocą Claude:

1. Usługa `etner` → **Shell** (zmienne są tam ustawione, `DATA_DIR=/var/data`).
2. Odtwórz bazę obok bieżącej, do pliku `restore.db`:
   `./bin/litestream restore -config deploy/litestream.yml -o /var/data/restore.db /var/data/etner.db`
   Stan z chwili w przeszłości: dodaj `-timestamp 2026-10-20T08:00:00Z` (czas UTC, w zakresie 720 h).
3. Uruchom usługę ponownie: **Manual Deploy → Restart service** albo **Deploy latest commit** (nazwa może się różnić). Przy starcie w logu pojawi się „Odtworzona baza (restore.db) podmieniona na etner.db.”, a Litestream zacznie nową serię kopii.
4. Sprawdź `/api/health` i ostatnie wpisy w aplikacji. Pliki `etner.db.przed-odtworzeniem-…` można usunąć, gdy wszystko się zgadza.

### Na innym serwerze

Te same kroki: `litestream restore -config deploy/litestream.yml -o $DATA_DIR/restore.db $DATA_DIR/etner.db` (ze zmiennymi z tabeli wyżej), potem restart aplikacji uruchamianej jako `litestream replicate -config deploy/litestream.yml -exec "node server/dist/main.js"` (przed nim `node server/dist/scripts/restore-swap-cli.js`, jak w `render.yaml`).

## Odtworzenie zdjęć

Zdjęcia leżą w buckecie kopii pod `files/<klucz>`; w bazie klucze są bez prefiksu `files/`. Skopiuj je z powrotem do bucketu roboczego (`R2_BUCKET`), np. rclone lub aws cli z `--endpoint-url $R2_ENDPOINT`:

`aws s3 sync s3://etner-backup/files/ s3://<R2_BUCKET>/ --endpoint-url $R2_ENDPOINT`

Gdy aplikacja działa na dysku (bez R2), skopiuj pliki do `$DATA_DIR/files/` (`aws s3 sync s3://etner-backup/files/ $DATA_DIR/files/ --endpoint-url $R2_ENDPOINT`).

Uwaga: kopia zdjęć dodaje nowe pliki, nie usuwa starych, więc zdjęcia usunięte w aplikacji zostają w kopii.

## Ostatnia deska ratunku

Arkusz Google (karta `_info` pokazuje datę eksportu i liczbę wierszy) zawiera wszystkie tabele z usuniętymi rekordami. Nagłówki to nazwy kolumn bazy, kwoty (`*_gr`) są w złotych, wartości logiczne jako TRUE/FALSE.
