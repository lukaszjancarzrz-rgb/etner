# ETNER – nowa aplikacja: projekt całości (fundament + moduły)

Data: 2026-10-20 · Status: do przejrzenia przez właściciela
Szczegóły pierwszego modułu: `2026-10-20-etner-modul-1-design.md`. Szczegóły modułów 2–4 powstaną przed ich budową, na tym fundamencie.

## 1. Cel i ustalenia

**Cel:** jedna aplikacja ETNER (telefon + komputer) do całej pracy firmy. Ma być szybka, lekka i łatwa w utrzymaniu. Planujemy ją w całości, a wdrażamy po kawałku: każdy moduł najpierw na TEST, potem sprawdzenie przez właściciela.

**Ustalenia (powiedział właściciel):**
- Budujemy od nowa:
  - jeden mały serwer + baza SQLite,
  - Render za darmo na czas testów, potem Hetzner za kilka €/mies.,
  - aplikacja nie jest teraz używana, więc nie potrzeba ciągłości działania.
- Arkusz Google zostaje tylko jako kopia do odzyskania danych, w dowolnym układzie.
- Bez zasięgu działa jak dziś.
- Bez Pumble: dziennik, zakupy i „na jutro” są w aplikacji.
- Zdjęcia w Cloudflare R2, w pełnej jakości plus lżejsze wersje do podglądu.
- Fundament przemyślany od razu pod paszport, finanse i płace.
- Karta klienta. Klient ma swoje obiekty (adresy).
- Paszport na obiekt, z listą urządzeń: jeden link/QR dla klienta.
- Zdjęcia i notatki są zawsze przy zleceniu. Paszport jest opcjonalny i zakłada się go w dowolnej chwili, np. przy drugim zleceniu rok później.
- Przy każdym zdjęciu i dokumencie z dowolnego zlecenia obiektu jest przełączka „pokaż klientowi”. Domyślnie wyłączona, zmienić ją można zawsze.
- Na razie jedna firma, ale baza gotowa na kolejną (pole „firma”).
- Harmonogram:
  - w komórce wybiera się zlecenie, kod albo wpisuje własny tekst,
  - do tego pełny dzień albo pół,
  - bez haseł.
- Kod w modułach, żeby zmiany robić lokalnie. Gotowe rozwiązania, API i frameworki.
- Wygląd według strony ETNER (Archivo, granat, niebieski, morski). Wariant czarno-biały jako druga propozycja. Projekt ekranów zrobiony skillem taste-skill.

**Założenia (do korekty):**
- ok. 8 użytkowników: 2 admini, reszta pracownicy,
- finanse i płace widzą obaj admini,
- przy konflikcie zapisów wygrywa późniejsza zmiana, zapisana w dzienniku zmian.

## 2. Moduły i kolejność

| # | Moduł | Co daje | Zależy od |
|---|---|---|---|
| 1 | Fundament + dzisiejsze funkcje | klienci i obiekty, zlecenia, leady, harmonogram, na jutro, zakupy, dziennik ze zdjęciami, zadania, użytkownicy, słowniki, push, przeniesienie danych, kopie | – |
| 2 | Cyfrowy paszport | paszport obiektu, urządzenia, wpisy serwisowe, strona klienta z QR, przypomnienia o przeglądach (e-mail 30/7 dni + lista dla admina), przeniesienie PSZ-2026-002 | 1 |
| 3 | Finanse | przychody (ręcznie przy zleceniu albo z importu), koszty, import KPiR z JSON z podglądem duplikatów, kontrola KPiR, pulpit i wykresy, wynik na zleceniu | 1 |
| 4 | Płace i czas pracy | godziny z harmonogramu + poprawki, zamykanie miesiąca, stawki i formy zatrudnienia, zaliczki i dodatki, rozliczenie, urlopy, podsumowania | 1, częściowo 3 |

Każdy moduł ma osobną specyfikację, plan i testy. Wchodzi na TEST, a po akceptacji na produkcję. Moduły 2–4 dopisują tylko nowe tabele, ekrany i uprawnienia. Fundamentu nie przebudowują.

## 3. Fundament: dane wspólne dla wszystkich modułów

```
firma ─┬─ klient ── obiekt (adres, mapa) ─┬─ zlecenie (rodzaj: montaż / serwis / gwarancja / inne)
       │                                  │     ├─ dziennik: wpisy (notatki) + załączniki
       │                                  │     ├─ harmonogram: wpisy osoba × dzień (pełny / pół)
       │                                  │     └─ [3] przychody, koszty   [4] godziny
       │                                  └─ [2] paszport (link/QR) ── urządzenia ── wpisy serwisowe
       └─ lead (klient, opcjonalnie obiekt; kontakty) ──► zlecenie
```

- **Firma:** dziś tylko ETNER. Ma ją zlecenie, lead i (w module 3) każdy przychód i koszt. Każda firma ma własną numerację Z/L.
- **Klient:**
  - imię i nazwisko albo nazwa firmy, telefony, e-maile, NIP, notatki,
  - lead i zlecenie wybierają klienta z listy z podpowiedzią albo tworzą nowego w locie,
  - karta klienta pokazuje jego obiekty, leady, zlecenia, a później paszporty i finanse.
- **Obiekt:** adres, miejscowość, link do mapy albo pinezka, opis (np. „dom, poddasze użytkowe”). Zlecenie dotyczy jednego obiektu klienta.
- **Zlecenie:**
  - numer (Z0001…), rodzaj, status (grupa: aktualne / na później / zamknięte), kategoria, termin (miesiąc), ekipa, zakres,
  - uwagi tylko dla admina, lead źródłowy, daty: utworzenia, zamknięcia,
  - dni pracy wyliczane z harmonogramu.
- **Załącznik:**
  - plik w R2: oryginał, podgląd, miniatura (zdjęcie, PDF, inny plik),
  - przypięty do wpisu w dzienniku zlecenia; w module 2 także do urządzenia albo wpisu serwisowego,
  - pole **`dla_klienta`** (tak/nie), domyślnie „nie”, zmiana w każdej chwili, każda trafia do dziennika zmian,
  - paszport obiektu pokazuje załączniki z `dla_klienta = tak` ze wszystkich zleceń tego obiektu, także sprzed założenia paszportu,
  - wpisy (notatki) dziennika nigdy nie są pokazywane klientowi; „pokaż klientowi” jest tylko przy załącznikach (zmiana 2026-10-21).
- **Ludzie i czas:**
  - użytkownicy, ekipy, osoby w harmonogramie (kolumny),
  - wpis harmonogramu = osoba × dzień × (zlecenie albo kod nieobecności albo tekst) × pełny / pół,
  - to jest jedyne źródło „kto, gdzie, ile” dla dni zlecenia, a w module 4 dla godzin,
  - poprawki godzin (moduł 4) to osobna warstwa i nie zmieniają harmonogramu.
- **Pieniądze:**
  - jeden format: kwota netto w groszach (liczba całkowita), stawka VAT, brutto wyliczane, waluta PLN,
  - zawsze z firmą, opcjonalnie z klientem i zleceniem,
  - moduł 1 ma tylko „wartość wyceny” w leadzie (ten sam format).
- **Słowniki** (edytuje admin w aplikacji):
  - statusy z grupą, kategorie, ekipy, źródła leadów,
  - kody nieobecności (z informacją, czy płatne – pod moduł 4),
  - grupy zadań, rodzaje zleceń, a w module 2 rodzaje urządzeń.

## 4. Fundament: usługi wspólne

- **Dostęp:**
  - role: `pracownik`, `admin`, plus uprawnienie `finanse` (moduły 3–4, na start obaj admini),
  - osobiste konta dla ludzi z firmy: login (imię lub krótka nazwa) i hasło, potem sesja na urządzeniu; hasło startowe nadaje admin, pracownik może je zmienić (zmiana 2026-10-21, zamiast osobistych linków),
  - **linki publiczne** (moduł 2): osobny rodzaj dostępu, token tylko do jednego paszportu, tylko odczyt, tylko elementy `dla_klienta`, można go unieważnić i wygenerować nowy, bez dostępu do API pracowników,
  - uprawnienia sprawdza wyłącznie serwer, w jednym miejscu (`core/permissions`).
- **Synchronizacja:**
  - każda zmiana zapisuje się w `changes` z kolejnym numerem,
  - telefon pobiera zmiany od ostatniego numeru i słucha strumienia SSE,
  - serwer filtruje zmiany wg uprawnień,
  - kolejka zapisów bez zasięgu z numerami `opId`, bez dubli.
- **Dziennik zmian:** kto, co, kiedy, przed i po. Usuwanie zawsze „miękkie”: rekord oznaczony i do przywrócenia.
- **Powiadomienia:** jedna usługa `notify(odbiorcy, treść, adres)` wysyła push, a w module 2 e-mail do klienta. Moduły tylko wywołują ją z odbiorcami.
- **Harmonogram zadań w tle:**
  - poranne przypomnienie, przypomnienia o kontakcie z leadem,
  - w module 2 przeglądy 30/7 dni przed terminem,
  - eksport nocny, kopie.
- **Kopie:**
  - Litestream (baza na bieżąco),
  - co noc kopia zdjęć do drugiego koszyka,
  - co noc eksport wszystkich tabel do arkusza Google: osobna karta na tabelę, do odzyskania danych.

## 5. Budowa techniczna (wspólna)

- **Serwer:** Hono (TypeScript), SQLite + Drizzle (migracje), Zod (walidacja wspólna z ekranami), web-push, sharp, pakiet S3 (R2), googleapis (arkusz), Litestream.
- **Ekrany:** React + Vite, TanStack Query (dane, cache w telefonie, kolejka), shadcn/ui (Radix) + Tailwind, vite-plugin-pwa, ikony Phosphor.
- **Testy:** Vitest (serwer, logika), Playwright (telefon i komputer).
- **Wdrożenie:** GitHub Actions (testy, build, wdrożenie). Render Free na testy, Hetzner na produkcję.

**Struktura kodu:**
```
server/core/             logowanie, sesje, uprawnienia, baza, zmiany + SSE, kolejka opId, powiadomienia, zadania w tle, pliki (R2)
server/modules/<moduł>/  routes · service · schema (tabele) · testy
web/src/core/            sesja, synchronizacja, kolejka offline, układ, nawigacja, wspólne komponenty (lista, formularz, wybór klienta, galeria)
web/src/features/<moduł>/ ekrany i komponenty modułu
shared/                  schematy Zod, typy, format kwot i dat
```

**Zasady współpracy modułów:**
- Moduł korzysta z `core`, `shared` i publicznych funkcji innych modułów. Nigdy z ich tabel bezpośrednio.
- Przykład: finanse pytają `zlecenia.get()` o zlecenie, płace pytają `harmonogram.entries(miesiąc)` o wpisy.
- Nowy moduł rejestruje swoje: trasy, tabele, uprawnienia, pozycje menu, rodzaje powiadomień i zadania w tle.

### Wygląd (wspólny dla wszystkich modułów)

- **System wizualny:**
  - strony ETNER (artefakt „Rekuperacja i klimatyzacja Maków Podhalański | ETNER”, etner2.netlify.app), uproszczony do aplikacji roboczej,
  - ekrany projektowane skillem taste-skill (design-taste-frontend-v2-experimental).
- **Krój:** Archivo (zmienna szerokość):
  - nagłówki i liczby szerokie (wdth 125, 800–900),
  - tekst wdth 100, 400–600,
  - cyfry tabelaryczne.
- **Kolory:**
  - tło `#f2f5f8`, karty `#fff`
  - granat i tekst `#0a2240`, tekst drugi `#3f5368`, linie `#d3dce5`
  - niebieski `#0070ab` dla akcji, morski `#00736b` dla potwierdzeń i „nowe”
  - tryb ciemny na granacie `#0a2240` / `#102e52`
  - wariant czarno-biały jako druga propozycja
- **Motywy ze strony (oszczędnie):**
  - ukośne pasy „oklejenia busa” tylko w nagłówku i przy logowaniu,
  - nagłówki sekcji jako blok koloru z paskiem,
  - delikatna siatka w tle,
  - przyciski-pigułki,
  - ikony Phosphor.
- **Ruch:** tylko funkcjonalny (200–300 ms) i z `prefers-reduced-motion`.
- **Zasady ekranów:**
  - telefon: dolny pasek z 4–5 pozycjami, duże pola dotyku;
  - komputer: boczne menu, lista + szczegóły, harmonogram jako tabela;
  - stany ładowania w kształcie treści, puste z podpowiedzią, błędy przy polach;
  - przegląd dostępności.

## 6. Moduły 2–4 – co fundament już dla nich ma

- **Paszport (2):**
  - klient i obiekt, rodzaje zleceń (serwis), załączniki z `dla_klienta`, linki publiczne, e-mail w `notify`, zadania w tle,
  - do dopisania: tabele urządzeń, wpisów serwisowych i paszportów oraz strona klienta.
- **Finanse (3):**
  - firma, format kwot, klient i zlecenie, uprawnienie `finanse`, dziennik zmian,
  - do dopisania: przychody, koszty, import i pulpit.
- **Płace (4):**
  - wpisy harmonogramu (pół dnia), kody nieobecności z polem „płatne”, użytkownicy, uprawnienie `finanse`,
  - do dopisania: stawki, poprawki, zaliczki, zamknięcia miesiąca i rozliczenia.

## 7. Poza zakresem całości

- Pumble.
- Pełny offline dla edycji admina (scalanie).
- Arkusz Google wracający do aplikacji.
- Fakturowanie. **Założenie do potwierdzenia przy module 3:** faktury nadal wystawia się poza aplikacją (księgowa / program księgowy), a aplikacja je importuje i podpina pod zlecenia.
