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
3. Render pokaże usługę `etner-demo` i zapyta o zmienne oznaczone jako sekrety. `BASE_URL` i `R2_*` można zostawić puste (zdjęcia zapiszą się wtedy na dysku usługi). Kliknij **Apply**.
4. Po zakończeniu budowania otwórz adres usługi (np. `https://etner-demo.onrender.com`).
5. Linki logowania dla osób przykładowych są pod adresem `<adres usługi>/api/demo/links`. Otwórz link administratora albo pracownika na telefonie lub komputerze.

Darmowa usługa usypia się po kwadransie bez ruchu; pierwsze wejście po przerwie trwa około minuty.
