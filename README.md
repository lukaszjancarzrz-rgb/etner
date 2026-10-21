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

Plik `render.yaml` opisuje usługę z danymi przykładowymi (tryb demo). Dane leżą w `/tmp/etner`, więc po każdym wdrożeniu lub uśpieniu darmowej usługi wracają do stanu początkowego.

1. Na [dashboard.render.com](https://dashboard.render.com) wybierz **New → Blueprint**.
2. Wskaż repozytorium ETNER (gałąź `modul-1`).
3. Render pokaże usługę `etner-demo` i zapyta o zmienne oznaczone jako sekrety. `R2_*` można zostawić puste (zdjęcia zapiszą się wtedy na dysku usługi). Kliknij **Apply**.
   Jeśli budowanie zatrzyma się na `corepack enable`, w ustawieniach usługi (Settings → Build Command) wpisz: `npx pnpm@10.28.0 install --frozen-lockfile && npx pnpm@10.28.0 build` i wdroż ponownie.
4. Po zakończeniu budowania otwórz adres usługi (np. `https://etner-demo.onrender.com`).
5. Otwórz adres usługi. Ekran logowania w wersji demo pokazuje listę „Konta demo” (administratorzy: tomek, anna; pracownicy: bartek, piotr, kamil, marek, adam). Dotknij konta, żeby się zalogować; wspólne hasło wszystkich kont to `demo1234`. Loginy i hasło są też w logu usługi przy starcie.

Darmowa usługa usypia się po kwadransie bez ruchu; pierwsze wejście po przerwie trwa około minuty.

## Pumble (kanał przy każdym zleceniu)

Przy nowym zleceniu serwer zakłada prywatny kanał Pumble (np. `z0012-kowalski-zawoja`) i dodaje do niego administratorów, ekipę zlecenia i osoby z harmonogramu. Na karcie zlecenia widać ostatnie wiadomości kanału, można napisać do kanału i przejść do Pumble.

1. W Pumble (konto właściciela) otwórz **Apps**, znajdź i zainstaluj dodatek **„API Keys”**.
2. W dodatku wygeneruj nowy klucz i skopiuj go.
3. Na Render w ustawieniach usługi (Environment) wklej klucz jako sekret `PUMBLE_API_KEY` i wdroż ponownie.

Bez klucza funkcja jest wyłączona, a sekcji „Pumble” na karcie nie ma. Osoby łączymy po adresie e-mail: e-mail konta w ETNER musi być taki sam jak e-mail tej osoby w Pumble. Kogo nie da się dopasować, ten nie zostanie dodany do kanału (lista trafia do dziennika błędów serwera). Wiadomości wysłane z ETNER idą jako bot z imieniem autora („Bartek Gawlik: …”). Nowe wiadomości z Pumble pojawiają się na karcie po około 20 sekundach.

## Pierwszy administrator (baza produkcyjna)

Świeża baza nie ma żadnego konta. Po zbudowaniu (`pnpm -r build`), na serwerze z ustawionym `DATA_DIR`:

```
ADMIN_PASSWORD='<hasło, min. 8 znaków>' pnpm --filter @etner/server create-admin -- --login <login> --name "<imię i nazwisko>"
```

Bez `ADMIN_PASSWORD` skrypt zapyta o hasło w terminalu. Odmówi, gdy login już istnieje. Konto jest aktywnym administratorem z uprawnieniem `finanse`; kolejne konta dodaje już administrator w aplikacji.
