# ETNER

Aplikacja firmowa ETNER (zlecenia, klienci, harmonogram, dziennik, zakupy; później paszport, finanse, płace).

- Projekt: `docs/superpowers/specs/`
- Plan: `docs/superpowers/plans/`

## Uruchomienie lokalne

Wymagane: Node 22 i pnpm (`corepack enable`).

```sh
pnpm install          # zależności
pnpm test             # testy we wszystkich pakietach (vitest)
pnpm dev              # serwer (:3000) i frontend (Vite, proxy /api na serwer)
pnpm build            # build shared, server i web
```

Po `pnpm build` serwer (`node server/dist/main.js`, port z `PORT`, domyślnie 3000) sam serwuje `web/dist`.

Testy przeglądarkowe (Playwright, iPhone 13 i komputer 1440×900, serwer demo na wolnym porcie i w pustym katalogu danych) uruchamia się osobno, po `pnpm build`:

```sh
pnpm --filter @etner/web test:e2e
```

Nie są częścią `pnpm test`, żeby testy jednostkowe w CI zostały szybkie.

## Wersja testowa na Render

Usługa `etner-demo` z pliku `render.yaml` ma dane przykładowe (tryb demo). Dane leżą w `/tmp/etner`, więc po każdym wdrożeniu lub uśpieniu darmowej usługi wracają do stanu początkowego. Ten sam Blueprint zakłada też produkcję – zakłada się go raz (zob. „Produkcja na Render”).

1. Na [dashboard.render.com](https://dashboard.render.com) wybierz **New → Blueprint** (tylko gdy Blueprintu jeszcze nie ma).
2. Wskaż repozytorium ETNER (gałąź `modul-1`).
3. Render pokaże usługi `etner-demo` i `etner` i zapyta o zmienne oznaczone jako sekrety. W `etner-demo` `R2_*` można zostawić puste (zdjęcia zapiszą się wtedy na dysku usługi). Kliknij **Apply**.
   Jeśli budowanie zatrzyma się na `corepack enable`, w ustawieniach usługi (Settings → Build Command) wpisz: `npx pnpm@10.28.0 install --frozen-lockfile && npx pnpm@10.28.0 build` i wdroż ponownie.
4. Po zakończeniu budowania otwórz adres usługi (np. `https://etner-demo.onrender.com`).
5. Otwórz adres usługi. Ekran logowania w wersji demo pokazuje listę „Konta demo” (administratorzy: tomek, anna; pracownicy: bartek, piotr, kamil, marek, adam). Dotknij konta, żeby się zalogować; wspólne hasło wszystkich kont to `demo1234`. Loginy i hasło są też w logu usługi przy starcie.

Darmowa usługa usypia się po kwadransie bez ruchu; pierwsze wejście po przerwie trwa około minuty.

### Powiadomienia push

Serwer wysyła push tylko na urządzenia zapisane w swojej bazie. W wersji demo baza leży w `/tmp/etner`, więc po każdym wdrożeniu lub uśpieniu lista urządzeń jest pusta. Telefon zapisuje się ponownie dopiero, gdy ktoś otworzy na nim aplikację (i zaloguje się, bo sesje też znikają). Kto po uśpieniu usługi nie otworzył aplikacji, ten nie dostanie powiadomienia, np. o naprawie auta.

Bez kluczy `VAPID_PUBLIC` / `VAPID_PRIVATE` serwer losuje nowe klucze przy każdym starcie. Ustaw je raz jako sekrety, żeby subskrypcje w telefonach zostały ważne:

1. Na komputerze z Node.js uruchom `npx web-push generate-vapid-keys`.
2. Na Render w ustawieniach usługi (Environment) wklej „Public Key” jako `VAPID_PUBLIC`, „Private Key” jako `VAPID_PRIVATE` i wdroż ponownie.
3. Na każdym telefonie otwórz aplikację, w Ustawieniach sprawdź „Powiadomienia” i wyślij próbne powiadomienie.

W produkcji (usługa `etner`, „Produkcja na Render”) baza leży na trwałym dysku, więc zapisane urządzenia nie znikają. Nieudane wysyłki widać w Ustawieniach, w logu błędów (miejsce „push”).

## Pumble (kanał przy każdym zleceniu)

Przy nowym zleceniu serwer zakłada prywatny kanał Pumble (np. `z0012-kowalski-zawoja`) i dodaje do niego administratorów, ekipę zlecenia i osoby z harmonogramu. Na karcie zlecenia widać ostatnie wiadomości kanału, można napisać do kanału i przejść do Pumble.

1. W Pumble (konto właściciela) otwórz **Apps**, znajdź i zainstaluj dodatek **„API Keys”**.
2. W dodatku wygeneruj nowy klucz i skopiuj go.
3. Na Render w ustawieniach usługi (Environment) wklej klucz jako sekret `PUMBLE_API_KEY` i wdroż ponownie.

Bez klucza funkcja jest wyłączona, a sekcji „Pumble” na karcie nie ma. Osoby łączymy po adresie e-mail: e-mail konta w ETNER musi być taki sam jak e-mail tej osoby w Pumble. Kogo nie da się dopasować, ten nie zostanie dodany do kanału (lista trafia do dziennika błędów serwera). Wiadomości wysłane z ETNER idą jako bot z imieniem autora („Bartek Gawlik: …”). Nowe wiadomości z Pumble pojawiają się na karcie po około 20 sekundach.

## Pierwszy administrator (baza produkcyjna)

Świeża baza nie ma żadnego konta. Na Render konto zakłada sam serwer: przy starcie, gdy w bazie nie ma żadnego użytkownika, a ustawione są `ADMIN_LOGIN` i `ADMIN_PASSWORD` (min. 8 znaków), tworzy aktywnego administratora z uprawnieniem `finanse` (imię z `ADMIN_NAME`, puste = login). W logu usługi pojawia się „Utworzono administratora „login””, bez hasła. Gdy konta już są, zmienne są pomijane; po pierwszym logowaniu zmień hasło w Ustawieniach i usuń `ADMIN_PASSWORD` z ustawień usługi. Kolejne konta dodaje już administrator w aplikacji.

Na własnym serwerze (z terminalem) można zamiast tego, po `pnpm -r build` i z ustawionym `DATA_DIR`:

```
ADMIN_PASSWORD='<hasło, min. 8 znaków>' pnpm --filter @etner/server create-admin -- --login <login> --name "<imię i nazwisko>"
```

Bez `ADMIN_PASSWORD` skrypt zapyta o hasło w terminalu. Odmówi, gdy login już istnieje.

## Produkcja na Render

Plik `render.yaml` to jeden Blueprint z dwiema usługami:

- **`etner-demo`** – wersja do oglądania nowych zmian, dane przykładowe, darmowa (gałąź `modul-1`).
- **`etner`** – wersja z prawdziwymi danymi firmy (gałąź `produkcja`): plan Starter (7 USD/mies.) i trwały dysk 1 GB na bazę (0,25 USD/mies.). Plan i dysk są wpisane w `render.yaml`, nic nie trzeba wybierać ręcznie.

Zdjęcia i kopie leżą w Cloudflare R2 (darmowe do 10 GB). Razem wychodzi poniżej 10 USD miesięcznie.

### 1. Przygotuj sekrety

Zanim połączysz Blueprint, zbierz wartości z listy niżej (wklejasz je w panelu Render, nigdzie indziej ich nie zapisuj):

| Zmienna | Skąd wziąć |
|---|---|
| `ADMIN_LOGIN`, `ADMIN_NAME`, `ADMIN_PASSWORD` | wymyśl: Twój login (małe litery), imię i nazwisko, hasło (min. 8 znaków) |
| `R2_BUCKET` | Cloudflare → **R2** → **Create bucket**, np. `etner-pliki` (bucket produkcyjny, inny niż testowy wersji demo) |
| `R2_BACKUP_BUCKET` | drugi bucket w R2, np. `etner-backup` – nocna kopia zdjęć i ciągła kopia bazy |
| `R2_ENDPOINT` | Cloudflare → R2 → **Overview**: adres „S3 API”, `https://<numer konta>.r2.cloudflarestorage.com` (bez nazwy bucketu na końcu) |
| `R2_KEY`, `R2_SECRET` | Cloudflare → R2 → **Manage API tokens** → **Create API token**, uprawnienie „Object Read & Write” do obu bucketów; „Access Key ID” i „Secret Access Key” |
| `LITESTREAM_ACCESS_KEY_ID`, `LITESTREAM_SECRET_ACCESS_KEY` | te same dwie wartości co `R2_KEY` i `R2_SECRET` (albo osobny token tylko do `etner-backup`) |
| `VAPID_PUBLIC`, `VAPID_PRIVATE` | na komputerze z Node.js: `npx web-push generate-vapid-keys` („Public Key”, „Private Key”); inne niż w wersji demo |
| `PUMBLE_API_KEY` | Pumble → **Apps** → dodatek **„API Keys”** → nowy klucz (zob. „Pumble” wyżej) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | dane serwera poczty od dostawcy skrzynki (np. home.pl, Gmail z hasłem aplikacji); `MAIL_FROM` = adres nadawcy. Puste = bez e-maili |
| `BASE_URL` | własna domena aplikacji, np. `https://app.etner-instalacje.pl` (krok 6); puste = adres `onrender.com` |
| `SHEETS_ID`, `GOOGLE_SA_JSON` | opcjonalnie, nocny eksport tabel do arkusza Google (`deploy/README-odtworzenie.md`) |

`APP_SECRET` Render losuje sam. Brakujące wartości można dopisać później: usługa `etner` → **Environment** → **Add Environment Variable**, potem **Save Changes** (Render wdraża ponownie).

### 2. Jeden Blueprint

Blueprint zakłada się **tylko raz**. Później każda zmiana `render.yaml` przychodzi do Render sama.

- **Nie masz jeszcze Blueprintu:** [dashboard.render.com](https://dashboard.render.com) → **New → Blueprint** → repozytorium ETNER, gałąź `modul-1` → Render pokaże usługi `etner-demo` i `etner` i zapyta o sekrety → wklej je → **Apply**.
- **Masz już Blueprint (z wersji demo):** nie zakładaj nowego. Render po zmianie `render.yaml` sam doda usługę `etner`. Sprawdź w **Blueprints** → Twój Blueprint: jeśli widać przycisk **Manual Sync**, kliknij go. Jeśli Render nie zapytał o sekrety, wpisz je w usłudze `etner` → **Environment** (krok 1).
- **Sprzątanie:** jeśli wcześniej powstało kilka Blueprintów, w **Blueprints** zostaw jeden, a w liście usług usuń zdublowane stare usługi (np. drugą `etner-demo-xxxx`): usługa → **Settings** → **Delete Web Service**. Nigdy nie usuwaj usługi `etner` z prawdziwymi danymi.

Pierwsze budowanie trwa kilka minut. Gałąź `produkcja` przygotowuje Claude, zanim połączysz Blueprint.

### 3. Pierwsze logowanie

Otwórz adres usługi `etner` (np. `https://etner.onrender.com`) i zaloguj się loginem i hasłem z `ADMIN_LOGIN` / `ADMIN_PASSWORD`. W Ustawieniach zmień hasło, potem w Render usuń zmienną `ADMIN_PASSWORD` (konto już jest, zmienna nie jest potrzebna).

### 4. Przeniesienie danych ze starego arkusza

1. W aplikacji: **Ustawienia** → **Przeniesienie z arkusza** → **Wybierz plik i sprawdź** → wskaż plik arkusza firmy (.xlsx).
2. Aplikacja robi próbę i pokazuje raport: ile wierszy jest w arkuszu, ile w bazie, ile pominięto. Kolumna „Różnica” musi mieć same zera albo kreski; inaczej nie przenoś i daj znać Claude.
3. **Przenieś naprawdę.** Na ekranie pojawią się loginy i hasła startowe pracowników – **tylko ten jeden raz**. Skopiuj je („Kopiuj wszystkie”) albo przepisz i przekaż każdemu osobiście.
4. Pod spodem, w „Do przejrzenia po przeniesieniu”, są wpisy do sprawdzenia ręcznie; odhaczaj je po kolei.

Przeniesienie działa tylko na nowej bazie (bez zleceń, leadów, klientów itd.); drugi raz aplikacja odmówi. Plik nie jest zapisywany na serwerze ani w R2.

### 5. Telefony

Na każdym telefonie otwórz adres produkcji, zaloguj się, dodaj aplikację do ekranu głównego i w Ustawieniach włącz „Powiadomienia” (próbne powiadomienie).

### 6. Własna domena (opcjonalnie)

1. Render → usługa `etner` → **Settings** → **Custom Domains** → **Add Custom Domain**, np. `app.etner-instalacje.pl`.
2. U dostawcy domeny dodaj rekord DNS **CNAME**: nazwa `app`, wartość `etner.onrender.com` (dokładny adres pokazuje Render).
3. Poczekaj, aż Render pokaże „Verified” i wystawi certyfikat (zwykle kilkanaście minut).
4. W **Environment** ustaw `BASE_URL` na `https://app.etner-instalacje.pl` (linki w e-mailach i powiadomieniach). Na telefonach otwórz nowy adres i zaloguj się ponownie.

### Jak przychodzą nowe wersje

- **Demo** (`etner-demo`) aktualizuje się samo po każdej zmianie na gałęzi `modul-1` – tam oglądasz nowości.
- **Produkcja** (`etner`) zmienia się tylko wtedy, gdy powiesz Claude „wydaj na produkcję”: Claude wypycha sprawdzoną wersję na gałąź `produkcja`, a Render sam ją wdraża. W trakcie wdrożenia aplikacja jest niedostępna przez około minutę (usługa z dyskiem); zapisy z telefonów czekają w kolejce i wysyłają się same.

Nowych Blueprintów nie zakładasz.

### Kopie

- **Baza na bieżąco:** Litestream (uruchamiany razem z aplikacją, gdy ustawione są `LITESTREAM_*`) kopiuje każdą zmianę bazy do bucketu `R2_BACKUP_BUCKET`, ścieżka `db`, przez 30 dni. Bez kluczy w logu przy starcie jest „Ciągła kopia bazy wyłączona”. Dodatkowo Render robi codzienną migawkę dysku.
- **Zdjęcia co noc** do `R2_BACKUP_BUCKET` (prefiks `files/`), **tabele co noc** do arkusza Google (jeśli ustawiony). Stan widać w Ustawieniach („Stan kopii”).
- Odtworzenie: `deploy/README-odtworzenie.md` (z pomocą Claude, przez **Shell** usługi `etner` w Render).
