# ETNER – moduł 1: fundament + dzisiejsze funkcje

Data: 2026-10-20 · Status: do przejrzenia przez właściciela
Projekt całości (ustalenia, fundament danych, usługi wspólne, technika, wygląd): `2026-10-20-etner-aplikacja-design.md`.

## 1. Zakres

**Fundament** (`server/core`, `web/src/core`, `shared`) – w całości, jak w projekcie całości:
- logowanie linkiem i sesje, uprawnienia (z miejscem na `finanse` i linki publiczne),
- baza i migracje, dziennik zmian, synchronizacja (zmiany + SSE),
- kolejka zapisów `opId`, pliki w R2, `notify` (push),
- zadania w tle, kopie i eksport do arkusza, format kwot i dat.

**Moduły:**

| Moduł | Co robi |
|---|---|
| `uzytkownicy` | osoby, role, ekipy, kolumny harmonogramu, nowy link, wyłączenie |
| `slowniki` | statusy z grupą, kategorie, ekipy, źródła, kody nieobecności (z polem „płatne”), grupy zadań, rodzaje zleceń |
| `klienci` | karta klienta i obiekty (adresy); wybór albo utworzenie w locie z leada i zlecenia; lista z wyszukiwaniem |
| `leady` | lead (klient, opcjonalnie obiekt), kontakty z klientem, przypomnienie o następnym kontakcie, zamiana w zlecenie |
| `zlecenia` | zlecenie (klient, obiekt, rodzaj, status, ekipa, termin, zakres, uwagi admina); listy wg grup statusów; dni z harmonogramu; znacznik „brak w harmonogramie” |
| `dziennik` | wpisy przy zleceniu lub leadzie, załączniki (zdjęcia, pliki), przełączka „pokaż klientowi” (użyje jej moduł 2), liczniki „nowe” |
| `harmonogram` | siatka osoba × dzień: zlecenie / kod / tekst, pełny / pół; uwagi dnia; święta; szkice → zatwierdź / odrzuć → push; „Gdzie jedziesz”; wyróżnienie ekip |
| `na-jutro` | lista rzeczy do zabrania dla ekipy na dzień, odhaczanie, przypomnienie rano |
| `zakupy` | do kupienia → zamówione → kupione, push do admina i do autora |
| `zadania` | zadania i notatki admina: priorytet, grupa, status, termin, cykliczne |

## 2. Tabele modułu 1

Wspólne pola wszystkich tabel:
- `id`, `created_at`, `created_by`, `updated_at`, `deleted_at`,
- `firma_id` tam, gdzie dotyczy firmy (klienci, leady, zlecenia).

| Tabela | Najważniejsze pola |
|---|---|
| `firmy` | nazwa, skrót, prefiksy numeracji |
| `users`, `sessions`, `push_subscriptions` | imię, rola, skrót tokenu, aktywny, ekipa, kolumna harmonogramu; sesje na urządzenia; subskrypcje push |
| `dict` | rodzaj, wartość, kolejność, grupa (aktualne / na później / zamknięte), `platne` (kody) |
| `clients` | typ (osoba/firma), nazwa, telefony, e-maile, NIP, notatki |
| `sites` | klient, nazwa obiektu, adres, miejscowość, mapa (link / współrzędne), opis |
| `leads`, `lead_contacts` | numer L…, klient, obiekt, status, kategoria, temat, źródło, opis, wartość (grosze), następny / ostatni kontakt, uwagi; kontakty: data, plan, notatka, następny, status, kto |
| `jobs` | numer Z…, klient, obiekt, lead, rodzaj, status, kategoria, termin (miesiąc), ekipa, zakres, uwagi admina, zamknięto |
| `diary_entries` | zlecenie albo lead, autor, treść, `dla_klienta` |
| `attachments` | właściciel (wpis dziennika; w przyszłości urządzenie / wpis serwisowy), rodzaj (zdjęcie / plik), klucze R2 (oryginał, podgląd, miniatura), nazwa, rozmiar, `dla_klienta`, autor |
| `schedule_people` | kolejność, nazwa kolumny, użytkownik |
| `schedule_entries` | dzień, osoba, rodzaj (zlecenie / kod / tekst), zlecenie, kod, tekst, `pol_dnia` |
| `schedule_notes`, `schedule_drafts` | uwagi dnia; szkice (dzień, osoba, było, będzie, kto, kiedy) |
| `checklists`, `shopping`, `tasks` | „na jutro”, zakupy, zadania |
| `changes`, `op_ids` | dziennik zmian (źródło SSE); zapisy z telefonu bez dubli |

Wyliczane, nie zapisywane:
- **sekcje list:** ze statusu przez `dict.grupa`,
- **dni zlecenia, od i do:** z `schedule_entries` (pełny = 1, pół = 0,5),
- **święta:** algorytm + dodatkowe dni wolne ze słownika.

## 3. Działanie

- **Odczyt:** ze zmian od ostatniego numeru, potem na żywo przez SSE. Pracownik nie dostaje leadów, uwag admina ani danych klienta poza tym, co jest na zleceniu: klient, telefon, adres obiektu.
- **Zapis:** od razu widoczny lokalnie. Bez sieci czeka w kolejce (`opId`, bez dubli). Serwer sprawdza uprawnienia i dane, zapisuje w transakcji i rozsyła zmianę.
- **Klient w formularzu:**
  - wpisujesz literami, aplikacja podpowiada istniejących (po nazwie i telefonie),
  - „nowy klient” zakłada go w locie, razem z obiektem,
  - duplikaty o tym samym telefonie aplikacja pokazuje jako ostrzeżenie.
- **Zdjęcia:**
  - telefon zmniejsza do ok. 2560 px i wysyła w kolejce,
  - serwer robi podgląd ~1600 px i miniaturę ~320 px,
  - linki do plików są krótkotrwałe i podpisane,
  - „pokaż klientowi” w module 1 tylko się zapisuje; widać to dopiero w paszporcie.
- **Harmonogram:**
  - szkice admina widzą tylko admini,
  - „Zatwierdź” wysyła każdemu jego zmiany (push + znacznik „nowe”),
  - wybór zlecenia w komórce podpowiada aktywne zlecenia,
  - kod nieobecności podświetla się kolorem.
- **Push:**
  - zatwierdzony harmonogram: osoby, którym się zmienił,
  - nowy wpis w dzienniku: admini oraz osoby z harmonogramu i ekipy zlecenia, bez autora,
  - nowe zlecenie lub zmiana ekipy: ekipa,
  - „na jutro”: ekipa,
  - zakupy: admin dostaje nowy wpis, autor dostaje „kupione”,
  - rano: co zabrać,
  - lead: przypomnienie o kontakcie dla adminów.

  Powiadomienie prowadzi prosto do zmiany.
- **Błędy:**
  - odrzucony zapis wraca z komunikatem, a treść i zdjęcia zostają w formularzu,
  - log błędów jest widoczny dla admina,
  - znacznik offline i liczba zapisów w kolejce.

## 4. Ekrany

- **Telefon:** dolny pasek Harmonogram · Na jutro · Zlecenia · Zakupy · Więcej (Klienci, Leady, Zadania, Użytkownicy, Ustawienia).
- **Komputer:** boczne menu, lista i szczegóły obok siebie, harmonogram jako pełna tabela.
- **Karta zlecenia:** klient i obiekt (telefon, nawigacja), status i ekipa, dni w harmonogramie, dziennik ze zdjęciami.
- **Karta klienta:** obiekty, leady, zlecenia.
- **Wygląd** według projektu całości (system strony ETNER). Najpierw klikalna wersja z przykładowymi danymi: harmonogram, zlecenie z dziennikiem i zdjęciami, zakupy, karta klienta.

## 5. Przeniesienie danych (jednorazowo, przy starcie produkcji)

**Źródła:**
- Firma_2026: Zlecenia, Wyceny i leady, Historia kontaktów, Harmonogram, Zadania i notatki, Zakupy, Parametry.
- Baza „ETNER Aplikacja – dane”: Użytkownicy, Obiekty, Dziennik, Listy, Push.
- Firestore: checks, buys, diary.
- Zdjęcia z Dysku: kopiowane do R2.

**Przeliczenia:**
- **Klienci:**
  - z pól „klient” i „kontakt” zleceń i leadów, łączeni po telefonie albo e-mailu, a bez nich po nazwie,
  - obiekty z „lokalizacji” i „adresu”,
  - leady powiązane ze zleceniami trafiają do tego samego klienta,
  - lista niepewnych połączeń idzie do przejrzenia.
- **Harmonogram:**
  - wpisy zamieniane na zlecenia po dzisiejszych hasłach,
  - „A / B” daje dwa pół dnia, kody zostają kodami, reszta tekstem,
  - nieprzypisane idą do przejrzenia.
- **Załączniki:** wszystkie ze znacznikiem `dla_klienta = nie`.
- **Raport:** liczba rekordów w źródle i w bazie dla każdej tabeli oraz różnice.
- **Linki:** zostają te same tokeny. Telefony trzeba otworzyć raz pod nowym adresem i włączyć push.

## 6. Testy i odbiór

- **Vitest:** uprawnienia (pracownik, admin), sekcje ze statusów, szkice i zatwierdzanie, idempotencja `opId`, wyliczanie dni zlecenia, łączenie klientów przy przeniesieniu (na danych przykładowych), filtrowanie zmian SSE wg uprawnień.
- **Playwright** (telefon i komputer):
  - logowanie linkiem,
  - nowy klient i zlecenie w locie,
  - wpis ze zdjęciem bez sieci i po powrocie,
  - zatwierdzenie harmonogramu z push,
  - zakupy, na jutro, zadania.
- **Odbiór:** klikalna wersja na Render, potem pełny moduł na Render, potem przeniesienie danych i produkcja (Hetzner).

## 7. Porządki po starej wersji

- Etap 2 starej aplikacji (Firestore jako baza) nie będzie wdrażany.
- Po starcie produkcji wyłączyć wyzwalacze i wdrożenie Apps Script. Firma_2026 i Firestore zostają tylko do odczytu jako archiwum.
- Nowe repozytorium bez prawdziwych danych klientów. Dane do testu przeniesienia trzymamy tylko lokalnie.
