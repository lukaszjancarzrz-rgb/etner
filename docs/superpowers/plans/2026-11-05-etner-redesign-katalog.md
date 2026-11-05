# ETNER – przeprojektowanie „Katalog techniczny” (cała aplikacja)

Owner decisions 2026-11-05: full redesign in direction A „Katalog techniczny” (surface brief `web/.impeccable/surfaces/src-app-tsx.md` – direction contract), keep the faint 32 px grid background, everything „nowe” stays red, menu NOT grouped (current order), tagline „INTELIGENTNY WYBÓR” legible (bigger), desktop lists as sortable tables, phone keeps cards. Product truth: `web/PRODUCT.md`. Reference sketch: `web/.impeccable/mocks/decision/assigned.html`.

## Global Constraints
- Behaviour, data, routes, offline outbox, roles and copy stay as they are (redesign changes look, layout and list presentation only). All existing unit tests and e2e tests keep passing; e2e selectors may be updated only where a list became a table (keep accessible names/roles meaningful).
- Fonts: Sofia Sans (400/500/600/700/800) for all UI text and numbers (tabular), Sofia Sans Condensed (600/700/800) for table column headers, category index tabs and compact labels. Loaded from Google Fonts in `index.html` (CSP already allows fonts.googleapis.com / fonts.gstatic.com). No wide/expanded type anywhere (`font-wide`, `font-narrow` removed from UI); no monospace.
- Colour jobs: navy #0a2240 = shell rail + ink; action blue (existing `--action`) = primary buttons, selection, focus, links; red (`--new`/danger) = „nowe”, overdue, errors, nav counts (owner: „nowe” red); category colours ONLY in index tabs/markers (Harmonogram cells may keep their category tint). Teal/ok for success.
- Shapes: radius 3–4 px for controls, panels and tabs (`rounded-full` only for avatars and status dots); shadows only on overlays (sheets, dialogs, popovers, toasts); no coloured `border-left/right` > 1 px anywhere (detector rule side-tab); lists grouped in one bordered panel with 1 px dividers, not one floating card per item.
- Keep the faint 32 px grid on `body` (owner).
- Light and dark theme both keep working (tokens in `web/src/theme.css`). Client passport page `/p/` (server) is out of scope.
- Phone: targets ≥ 44 px, base 16 px; desktop density switch in theme.css stays.
- Polish UI; no new runtime dependencies.
- Commit trailer as usual; never push.

## Task R1: Foundation – tokens, type, UI kit, shell
Files: `web/index.html`, `web/src/theme.css`, `web/src/core/ui/*`, `web/src/core/layout/*` (SideNav, TopBar, BottomNav, Shell, Logo), `web/src/screens/Login.tsx`, `web/src/screens/More.tsx`.
- Fonts + type scale (desktop ~14 px base via existing density, phone 16 px): page title 24–26/800, section title 17–18/700 (plain, no stripe, optional count), table header Condensed 12.5/600 sentence case.
- SideNav: navy rail (#0a2240, dark theme: deeper navy), white logo block at top with the company logo (`/logo.png`) large enough that „INTELIGENTNY WYBÓR” reads (≥ 10 px rendered cap height of the tagline – scale the image up, e.g. 176–190 px wide); items white/70 → white, active = lighter navy fill (no side stripe), counts as small red squares-ish (radius 3). Dark theme: logo block stays white.
- TopBar (phone + desktop), BottomNav (no condensed squeeze: labels Sofia Sans 12 px, max 4–5 items unchanged), Sheet/Dialog (radius 6, shadow ok), Button (radius 4, variants unchanged), Input/Textarea/Select/Combobox (radius 4, placeholder visibly lighter than values: e.g. ink-2 at ~55% opacity, keep ≥ legible), Badge, SectionTitle (no `border-l-4`), Empty (no dashed big boxes on desktop – compact), toast (no border-left stripe – tone via icon + 1 px border), Segmented (radius 4, navy selected).
- Generic container: add a `Panel` (bordered white panel, radius 4, no shadow) and `Rows`/divided list helper if useful; replace `shadow-card` usage by borders.
- Login and Więcej restyled in the same language.
Tests: unit + build + size; e2e a11y + login + nav-related specs.

## Task R2: Desktop tables
Files: new `web/src/core/ui/table.tsx` (sortable header: click toggles asc/desc, `aria-sort`, sticky header, 36–40 px rows, row hover, selected row, right-aligned numerals where numeric) + screens: Zlecenia (table + detail panel at desk; phone list unchanged), Klienci, Paszporty, Zadania, Zakupy, Do serwisu (and Leady if natural). Columns per screen from existing data (e.g. Zlecenia: tab branży, Nr, Klient, Miejscowość, Status, Ekipa, Termin, Uwagi(„N nowe” red, „brak w harmonogramie”); Klienci: Nazwa, Miejscowość, Telefon, E-mail, Aktywne zlecenia; Paszporty: Klient, Adres, Teczki (tabs), Nr paszportu, Następny serwis; Zadania: Tytuł, Lista/grupa, Priorytet, Termin, Status; Zakupy: Pozycja, Ilość, Kto, Kiedy, Kupione; Do serwisu: Klient, Obiekt, Kategoria, Termin, akcje). Desktop only (`useDesk`); phone keeps cards. Sorting state per screen kept in component state.
- Signature: category index tab component (`CatTab`: Condensed 800 white text on category colour, abbreviations fixed by the owner (2026-11-05): Elektryka → EL, Rekuperacja → RW, Klimatyzacja → KL, Fotowoltaika → PV, Alarmy i monitoring → AM (one category); any other category: first two letters of its name uppercased (or first letters of two words), unique per dictionary, radius 0 3px 3px 0, flush to row's left edge) used in tables and as category filter chips above the Zlecenia table.

## Task R3: Screens polish (phone + desktop)
- Harmonogram: no pencil in every cell (edit on cell click/focus, pencil only on hover/focus at desk), no stray „·” in empty weekend cells, cells use CatTab abbreviation + client + town (no ellipsis on town at desk where space allows).
- Job card / teczka / paszport / samochody / na jutro / zakupy / magazyn / narzędzia / ustawienia / użytkownicy / leady: apply panel + divider language; phone action rows: labelled primary action, destructive (trash) never adjacent to complete/check (move into overflow or separate end with gap ≥ 16 px and confirm kept).
- Fix phone horizontal overflow on Zlecenia list.
- Remove remaining `font-wide`, `shadow-card`, `rounded-2xl`, side stripes – named: Paszport teczka 6 px, Samochody header 4 px, Harmonogram cells 4 px (category stays visible via CatTab/tint, not a side border).
- From R1 review (deferred minors): remove the theme-wide radius override in theme.css (replace rounded-xl/2xl/3xl usages with the real small radius classes); rail logo crops must not depend on hard-coded pixel offsets of logo.png (derive from the image or use a dedicated asset); dark theme: remove duplicate `--ink-3`, set dark `theme-color` meta so the phone status bar matches the navy top bar; input outline contrast ≥ 3:1 against its background.

## Task R4: Finish
- `impeccable detect --json src` clean of slop rules (or justified), screenshots desktop + phone for all screens, finish reviewer, DESIGN.md via documenter, release.
