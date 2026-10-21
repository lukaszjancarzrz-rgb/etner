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
