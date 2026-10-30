# ETNER – moduł 2: cyfrowy paszport instalacji

Data: 2026-10-29 · Status: do przejrzenia przez właściciela
Projekt całości: `2026-10-20-etner-aplikacja-design.md`. Moduł 1: `2026-10-20-etner-modul-1-design.md` (działa na produkcji).
Makiety koncepcji (zaakceptowane 2026-10-29): 1 klient → paszport, 2 teczka, 3 wpis serwisowy, 4 naklejka QR, 5 strona klienta, 6 komputer.

## 1. Cel i ustalenia właściciela

**Cel:**
- **A.** Więcej zleceń serwisowych dzięki przypomnieniom o przeglądach.
- **B.** Porządna dokumentacja instalacji dla klienta pod jednym kodem QR.

**Ustalenia (2026-10-29):**
- Paszport jest na **obiekt** (adres klienta), z jednym kodem QR. Klient z dwoma adresami ma dwa paszporty. Można też założyć dwóch osobnych klientów – efekt ten sam.
- W paszporcie są **teczki według kategorii zlecenia** (Elektryka, Fotowoltaika, Rekuperacja, Klimatyzacja …).
- Montaż i późniejsze serwisy tej samej kategorii są w **jednej teczce** i tylko się ją uzupełnia.
- Zdjęcia i pliki ze zleceń trafiają do teczki swojej kategorii, rozdzielone między teczki.
- **W teczce:**
  - urządzenia,
  - karta serwisowa (edytowalna w aplikacji),
  - dokumenty (PDF-y, projekty, oferty, faktury, notatka z rozliczeniem),
  - zdjęcia,
  - następny serwis.
- **Ekipa pracuje u klienta na telefonie:**
  - dopisuje serwis i to, co zrobiono,
  - generuje kod QR i drukuje naklejkę z logo, nazwą firmy i kontaktem.
- **Wejście do paszportu:** z klienta, ze zlecenia (od razu właściwa teczka) i z wyszukiwarki.
- **Projekty i oferty** dodane w dzienniku zlecenia trafiają do teczki – z dziennika ustawia się, czy klient je widzi.
- **Drukarka:**
  - docelowo Niimbot M2 (termotransfer, etykiety do 50 mm, PET), naklejka 50×30 mm;
  - druk przez aplikację drukarki (obraz z ETNER) albo PDF na A4;
  - właściciel jeszcze jej nie ma – przycisk „Udostępnij obraz” dopracowujemy po teście z drukarką.
- Stary paszport „PSZ-2026-002” to test – nie przenosimy go.
- Czynności serwisowe na start robocze, do ustandaryzowania później (edytowalne w Ustawieniach).

## 2. Rozstrzygnięcia projektowe

| # | Rozstrzygnięcie | Dlaczego |
|---|---|---|
| P1 | Teczka = (obiekt, kategoria). Zlecenie należy do teczki automatycznie z obiektu i kategorii zlecenia – bez osobnego pola. Zmiana kategorii zlecenia przenosi je do innej teczki. | Nic do pamiętania przy zakładaniu zlecenia; zgodne z „rodzaj zlecenia = podfolder”. |
| P2 | Teczka powstaje sama, gdy obiekt ma zlecenie danej kategorii; admin może dodać pustą teczkę ręcznie. Nazwa kategorii zmieniona w słowniku zmienia nazwę teczki (mechanizm zmiany nazw R36). | Bez ręcznego zakładania; zgodność ze słownikiem. |
| P3 | Paszport zakłada się przyciskiem „Załóż paszport” na obiekcie / kliencie / zleceniu (admin i ekipa). Numer `PSZ-RRRR-NNN`, kolejny w roku. Bez paszportu teczki i tak są widoczne w aplikacji (z danych zleceń); paszport dodaje numer, link publiczny i naklejkę. | Paszport „opcjonalny, w dowolnej chwili” (projekt całości). |
| P4 | Zdjęcia i pliki z dziennika zleceń pojawiają się w teczce **same** (dla pracowników). Dla klienta – tylko oznaczone „dla klienta” (istniejące pole `dla_klienta`). W dzienniku przy każdym pliku i zdjęciu przełącznik „W paszporcie dla klienta”. Plik nie jest kopiowany – teczka wskazuje ten sam plik. | Jedno źródło; nic się nie dubluje. |
| P5 | Pliki dodane bezpośrednio w teczce (faktura, projekt, instrukcja) to załączniki z właścicielem `teczka`; urządzenie i wpis serwisowy mają własne załączniki (`device`, `service` – miejsce już przygotowane w module 1). | Wykorzystuje istniejące pliki, R2, podglądy, warianty zdjęć. |
| P6 | **Faktury i notatka z rozliczeniem widzi tylko admin** (uprawnienie `admin`; po module 3 – `finanse`). Pracownik widzi urządzenia, kartę serwisową, projekty/instrukcje i zdjęcia. Klient – tylko „dla klienta”. | Kwoty nie trafiają do telefonów ekip. |
| P7 | **Strona klienta** renderowana przez serwer jako prosty HTML (bez logowania, bez dużego kodu aplikacji), pod adresem `/p/<token>`. Token losowy (128 bitów), w bazie tylko skrót; jeden aktywny na paszport; admin może unieważnić i wygenerować nowy (stara naklejka przestaje działać). Pliki przez krótkie podpisane linki. | Szybko na słabym zasięgu; zero dostępu do API pracowników. |
| P8 | **Naklejka** generowana w telefonie: kod QR (biblioteka ładowana tylko na tym ekranie), obraz PNG 50×30 mm w 300 dpi, „Udostępnij obraz” (Web Share z plikiem) z zapasowym „Pobierz obraz”, „Drukuj” przez druk systemowy, „PDF A4” jako wydruk arkusza (druk przeglądarki → zapis do PDF). Bez bibliotek PDF. | Działa z każdą drukarką mającą aplikację w telefonie; minimum kodu. |
| P9 | **Dane firmy na naklejce i stronie klienta** w Ustawieniach (admin): nazwa, telefon serwisu, e-mail, strona www; logo ETNER z aplikacji. | Jedno miejsce. |
| P10 | **Karta serwisowa:** wpis = data, zlecenie (opcjonalnie), odhaczone czynności (lista ze słownika dla kategorii + „inne” tekstem), uwagi, kto, zdjęcia, „dla klienta” (domyślnie tak). Edycja i usuwanie: admin i autor. | Zgodne z „edytowalny arkusz serwisów”. |
| P11 | **Czynności serwisowe** – nowy słownik `czynnosc_serwisowa` z polem „kategoria”. Start (robocze): Rekuperacja – wymiana filtrów F7, wymiana filtrów G4, czyszczenie wymiennika, kontrola odpływu skroplin, dezynfekcja kanałów; Klimatyzacja – czyszczenie filtrów, odgrzybianie, kontrola ciśnienia i szczelności, kontrola odpływu skroplin; Fotowoltaika – przegląd falownika, kontrola zabezpieczeń DC/AC, odczyt produkcji; Elektryka – pomiary instalacji, kontrola zabezpieczeń. | Do ustandaryzowania przez właściciela. |
| P12 | **Następny serwis** na teczce: data + cykl w miesiącach (domyślnie z kategorii: rekuperacja 6, klimatyzacja 12, fotowoltaika 12, pozostałe brak). Przy wpisie serwisowym przyciski +4 mies. / +6 mies. / +1 rok / data. | Cel A. |
| P13 | **Przypomnienia:** codziennie o 7:00 (Warszawa) e-mail do klienta 30 i 7 dni przed serwisem (jeśli klient ma e-mail i SMTP działa; każdy wysłany tylko raz na termin); w aplikacji lista „Do serwisu” (admin) z licznikiem w menu: najbliższe 30 dni + zaległe; z listy „Zrób zlecenie serwisowe” (klient, obiekt, kategoria, rodzaj „serwis”, termin = miesiąc serwisu). Przypomnienie klienta wyłączalne na teczce. | Cel A bez ręcznego pilnowania. |
| P14 | Zgodność ze strategią offline modułu 1: paszporty, teczki, urządzenia, wpisy serwisowe synchronizowane jak inne dane (widoczność per moduł), zapisy przez kolejkę z `opId`. Strona klienta i naklejka wymagają internetu tylko do pierwszego pobrania linku. | Wpis serwisowy na strychu bez zasięgu. |
| P15 | Koniec przypomnień: usunięcie urządzeń / brak następnego serwisu = brak przypomnień; teczka bez paszportu też dostaje przypomnienia (paszport nie jest warunkiem celu A). | Prosto. |

## 3. Dane (nowe tabele; zmiany wyłącznie dodające)

Wspólne pola jak w module 1 (`id`, `created_at`, `created_by`, `updated_at`, `deleted_at`).

| Tabela | Pola |
|---|---|
| `passports` | `site_id` (unikalny wśród nieusuniętych), `numer` (PSZ-RRRR-NNN), `token_hash` (null = brak linku), `token_at` |
| `passport_folders` | `site_id`, `kategoria` (wartość słownika), `nastepny_serwis` (data), `cykl_mies`, `przypomnienia` (bool, domyślnie tak), `wyslano_30_dla`, `wyslano_7_dla` (data serwisu, dla której wysłano), `notatka_rozliczenie` (tekst, admin) |
| `devices` | `folder_id`, `nazwa` (np. „Rekuperator”), `producent`, `model`, `nr_seryjny`, `montaz` (data), `job_id`, `gwarancja_do`, `uwagi`, `dla_klienta` |
| `service_entries` | `folder_id`, `dzien`, `job_id`, `czynnosci` (lista tekstów), `uwagi`, `author_id`, `dla_klienta` |
| `attachments` (istniejąca) | nowa wartość `owner_type = 'teczka'` (+ istniejące `device`, `service`); pole `typ_dok` (null / `faktura` / `projekt` / `oferta` / `instrukcja` / `inne`) – migracja dodaje kolumnę |
| `settings` (istniejąca) | `firma_nazwa`, `firma_telefon`, `firma_email`, `firma_www` |
| `dict` (istniejąca) | nowy rodzaj `czynnosc_serwisowa` z polem `kategoria` |

Teczka jest identyfikowana przez (obiekt, kategoria); wiersz `passport_folders` powstaje przy pierwszym potrzebnym zapisie (ustawienie serwisu, urządzenie, wpis, plik, ręczne „Dodaj teczkę”). Do wyświetlenia teczki listuje się też kategorie zleceń obiektu bez wiersza.

## 4. Ekrany w aplikacji

- **Klient** i **obiekt**: sekcja „Paszport instalacji” z kafelkami teczek (licznik zleceń / zdjęć / dokumentów, znacznik „serwis za N dni” / „serwis zaległy”), przyciski „Kod QR i naklejka”, „Podgląd klienta”, „Załóż paszport” (gdy brak). Klient z wieloma obiektami: sekcja na każdy obiekt.
- **Paszport** (`#psz/<siteId>/<kategoria>`): zakładki teczek; w teczce:
  - pasek „Następny serwis” z edycją,
  - Urządzenia (+ dodaj, edycja, plik instrukcji),
  - Karta serwisowa (tabela; + Wpis),
  - Dokumenty (pliki teczki i pliki z dzienników zleceń; ikona typu; „dla klienta” / „wewn.”; faktury i rozliczenie tylko admin),
  - Zdjęcia (ze zleceń teczki i wpisów serwisowych, z numerem zlecenia; podgląd jak w dzienniku),
  - Zlecenia w teczce (lista z linkami).
- **Wpis serwisowy** (pełny ekran na telefonie): zlecenie (podpowiedź: dzisiejsze zlecenie tej osoby na tym obiekcie), data, czynności do odhaczenia, „inne”, uwagi, zdjęcia, następny serwis (+4 / +6 mies. / +1 rok / data), „widoczne dla klienta”.
- **Kod QR i naklejka**: podgląd naklejki 50×30 mm (QR, logo, „ETNER”, „Paszport instalacji”, numer, nazwisko, telefon serwisu, www), rozmiar (50×30 mm; A4 – arkusz kilku naklejek), co ma być na naklejce, przyciski „Udostępnij obraz”, „Pobierz obraz”, „Drukuj”; link do skopiowania; „Unieważnij link i utwórz nowy” (admin, z potwierdzeniem).
- **Zlecenie**: przycisk „Paszport → <kategoria>”; podpowiedź na zleceniu serwisowym w toku / po zakończeniu: „Dodaj wpis do karty serwisowej”.
- **Dziennik zlecenia**: przy każdym zdjęciu i pliku przełącznik „W paszporcie dla klienta” oraz typ dokumentu dla plików (projekt / oferta / instrukcja / faktura / inne).
- **Do serwisu** (admin, menu boczne / Więcej, z licznikiem): teczki z serwisem w 30 dni i zaległe, sortowane po dacie; akcje „Zrób zlecenie serwisowe”, „Przesuń termin”, „Zadzwoń”.
- **Ustawienia**: dane firmy (P9), słownik czynności serwisowych (z kategorią), domyślny cykl serwisu dla kategorii.
- **Wyszukiwarka paszportów**: w Klientach (numer PSZ, nazwisko, miejscowość).

## 5. Strona klienta (`/p/<token>`)

- Nagłówek z logo i nazwą firmy, „Twoja instalacja”, nazwisko i miejscowość, numer paszportu.
- Baner o zbliżającym się / zaległym serwisie z przyciskami „Zadzwoń do serwisu” (`tel:`) i „Umów serwis” (`mailto:` z tematem i numerem paszportu).
- Teczki (zakładki): urządzenia (model, montaż, gwarancja), historia serwisu (data, czynności, uwagi – tylko wpisy „dla klienta”), dokumenty do pobrania, zdjęcia (podgląd i pełny rozmiar).
- Tylko elementy „dla klienta”; bez kwot, faktur (chyba że oznaczone), notatek wewnętrznych, nazwisk pracowników (tylko „technik ETNER”).
- Nieważny lub unieważniony link: strona „Ten kod nie jest już aktywny – zadzwoń: <telefon>”.
- Ochrona: limit zapytań na adres IP, nagłówki bez indeksowania (`noindex`), krótkie podpisane linki do plików, brak listowania paszportów.

## 6. Bezpieczeństwo i uprawnienia

| Kto | Co może |
|---|---|
| admin | wszystko: paszporty, teczki, urządzenia, wpisy, dokumenty, faktury, rozliczenie, link publiczny, dane firmy, czynności |
| pracownik | widzi paszporty i teczki (bez faktur i rozliczenia); zakłada paszport; dodaje urządzenia, wpisy serwisowe, zdjęcia i pliki (bez faktur); edytuje i usuwa swoje wpisy; generuje naklejkę |
| klient (link) | tylko odczyt elementów „dla klienta” jednego paszportu |

Widoczność w synchronizacji jak w module 1 (domyślnie tylko admin, moduł określa reguły). Notatka z rozliczeniem i załączniki `typ_dok = faktura` wycinane dla pracowników.

## 7. Integracje

- Zlecenia (kategoria, obiekt), dziennik (załączniki), klienci (obiekty, e-mail do przypomnień), słowniki (kategorie, czynności), harmonogram (podpowiedź zlecenia przy wpisie), zadania w tle (7:00), e-mail (SMTP z modułu 1), push (opcjonalnie do admina o zaległych serwisach – raz w tygodniu, w liście „Do serwisu” zawsze).
- Moduł 3 (Finanse): faktury z modułu finansów pokażą się w teczce jako dokumenty; do tego czasu – wgrywane ręcznie.
- Licznik „nowe” z modułu 1: nowy wpis serwisowy / plik innej osoby w teczce oznaczony jak w karcie zlecenia.

## 8. Kolejność budowy (do planu)

1. **2a – teczki w aplikacji:** tabele, teczki z danych zleceń, urządzenia, karta serwisowa, dokumenty, zdjęcia, wejście z klienta/obiektu/zlecenia, słownik czynności, „W paszporcie dla klienta” w dzienniku.
2. **2b – paszport dla klienta:** numer, link publiczny, strona klienta, naklejka QR, dane firmy.
3. **2c – serwis:** następny serwis, przypomnienia e-mail 30/7 dni, lista „Do serwisu”, „Zrób zlecenie serwisowe”.

Każda część: testy (jednostkowe, serwer, e2e na telefonie i komputerze, dostępność), recenzja, wydanie na produkcję.

## 9. Testy (najważniejsze)

- Teczka zbiera zlecenia, zdjęcia i pliki z dzienników obiektu i kategorii; zmiana kategorii zlecenia przenosi je; zmiana nazwy kategorii w słowniku zmienia nazwę teczki.
- Pracownik nie dostaje faktur ani notatki z rozliczeniem (synchronizacja, snapshot, SSE).
- Strona klienta pokazuje tylko „dla klienta”; unieważniony token → strona „nieaktywny”; pliki przez podpisane linki; limit zapytań.
- Wpis serwisowy bez internetu wysyła się po powrocie; ustawia następny serwis.
- Przypomnienia: e-mail 30 i 7 dni wysyłany raz na termin; bez e-maila klienta / SMTP – pominięcie z wpisem w dzienniku błędów; lista „Do serwisu” i licznik.
- Naklejka: obraz 591×354 px, czytelny kod QR (odczyt testowy), link poprawny.

## 10. Poza zakresem modułu 2

- Konta klientów i logowanie klientów.
- Bezpośredni druk z aplikacji przez Bluetooth (przeglądarka nie potrafi) – druk przez aplikację drukarki.
- Formularz „Umów serwis” zapisujący zgłoszenie w aplikacji (na start telefon / e-mail).
- Kalendarz serwisów do rezerwacji przez klienta.
- Przeniesienie starego paszportu PSZ-2026-002 (test).
- Edytowalne szablony kart serwisowych z dowolnymi kolumnami (na start lista czynności + uwagi).
