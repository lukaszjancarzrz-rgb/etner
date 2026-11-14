# Moduł 5 „Czasomierz” – projekt

Właściciel 2026-11-14: makiety zaakceptowane („wdrażamy”). Wydanie na produkcję po „tak” (nowy moduł + migracja 0028, tylko dodająca).

## Decyzje właściciela
- C1 Pracownik: Start/Stop; czas przypisany do zlecenia z dzisiejszego harmonogramu (zmiana na inne / „bez zlecenia”); w ciągu dnia zmiana zlecenia (stop + start jednym ruchem).
- C2 Stop pyta o potwierdzenie i pozwala poprawić godziny od–do.
- C3 Zapomniany Stop: przypomnienie (push) 30 min przed, potem auto-stop o 20:00 albo po 11 h od startu (co pierwsze); wpis oznaczony „zatrzymany automatycznie” (do sprawdzenia).
- C4 Pracownik poprawia/dodaje własne wpisy tylko z bieżącego i poprzedniego tygodnia; starsze – admin.
- C5 Admin: ekran Czasomierz (Teraz / Wpisy / Sumy); wpisy poprawione pokazują godziny z czasomierza i poprawione od–do, kto i kiedy.
- C6 Płace → Godziny: podpowiedź „Czasomierz: X h” + „Wstaw” (bez automatycznego przepisywania).
- C7 Robocizna zlecenia: gdy osoba ma w miesiącu wpisy czasomierza – koszt godziny = koszt osoby w miesiącu (urlop 1/12) ÷ godziny czasomierza; robocizna = godziny na zleceniu × koszt godziny. Bez wpisów – jak dotąd (dni harmonogramu × koszt dnia).
- Na jutro u pracownika przechodzi do „Więcej” (dolny pasek: Harmonogram, Zlecenia, Czasomierz, Zakupy, Więcej – jak na makiecie).

## Dane: `time_entries`
user_id (właściciel, null = dodany przez admina dla osoby bez konta), person_id (kolumna harmonogramu), job_id (null = bez zlecenia), dzien (dzień startu, Europe/Warsaw), od, do (null = trwa), od_cz, do_cz (czasy z czasomierza; null przy wpisie ręcznym), zrodlo ('czasomierz' | 'reczny'), auto_stop, przypomniano_at, edytowal, edytowal_at, komentarz. Czasy = ISO UTC.

## Serwer
- POST /api/time/start {at, jobId} – zatrzymuje trwający wpis (o `at`) i zaczyna nowy. POST /api/time/stop {at, od?, do?, komentarz?} – zatrzymuje trwający wpis; spóźniony stop (offline) poprawia wpis zatrzymany automatycznie. Bez id → działa z kolejki offline.
- POST /api/time-entries (ręczny), PUT /api/time-entries/:id (poprawka; każda zapisuje kto/kiedy), DELETE (pracownik tylko własne ręczne w oknie edycji; admin każdy).
- Walidacja: od < do, ≤ 16 h, brak nakładania się wpisów tej samej osoby, `at` z zegara telefonu: nie z przyszłości (> 5 min), nie starszy niż 48 h.
- Cron co 5 min: przypomnienie i auto-stop.
- Synchronizacja: admin wszystko, pracownik tylko własne wpisy.

## Klient
- Ekran `czas` („Czasomierz”): pracownik – licznik (Start / Zmień zlecenie / Stop z potwierdzeniem) i „Moje godziny”; admin – zakładki Teraz / Wpisy / Sumy / Mój czas.
- Pasek w Harmonogramie, gdy licznik działa (ze Stop).
- Płace → Godziny: podpowiedź + Wstaw. Karta zlecenia (admin): suma godzin z czasomierza na osoby. Robocizna wg C7.
