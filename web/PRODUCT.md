# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
- **Właściciel i administratorzy (biuro):** głównie komputer (1440 px), czasem telefon. Planują pracę ekip w harmonogramie, prowadzą zlecenia, leady, zakupy, zadania biura, klientów, paszporty instalacji i serwisy. Pracują w aplikacji przez cały dzień, wiele krótkich operacji.
- **Pracownicy ekip (teren):** telefony Android i iPhone, w busie, na budowie, u klienta, często w rękawicach i w słońcu; pracują online (aplikacja umie działać bez zasięgu, ale to wyjątek). Sprawdzają „gdzie jadę jutro”, dodają wpisy i zdjęcia do dziennika zlecenia, zgłaszają usterki aut, szukają narzędzi, robią wpisy serwisowe w paszporcie.
- **Klienci firmy (strona paszportu `/p/…`):** właściciele domów, otwierają stronę ze skanu kodu QR na urządzeniu; bez logowania, zwykle telefon.

## Product Purpose
Wewnętrzny system ERP małej firmy instalacyjnej ETNER (elektryka, klimatyzacja, rekuperacja, fotowoltaika, alarmy i monitoring, pompy ciepła). Zastępuje arkusz Excel i komunikację na czacie: jeden harmonogram ekip, zlecenia z dziennikiem i zdjęciami, leady sprzedażowe, zakupy, flota aut, narzędzia, magazyn, zadania biura, klienci z obiektami oraz cyfrowe paszporty instalacji z przypomnieniami serwisowymi. Sukces: biuro i ekipy pracują tylko w aplikacji, nic nie ginie, klient dostaje profesjonalną dokumentację instalacji.

## Positioning
Szyty na miarę dla jednej firmy instalacyjnej: łączy planowanie ekip, dokumentację z terenu (zdjęcia, wpisy) i serwis posprzedażowy (paszport z QR, przypomnienia) w jednym narzędziu na telefonach ekip i komputerach biura.

## Operating Context
- PWA instalowana na telefonach; ekipy pracują online, synchronizacja na żywo; kolejka zapisów chroni dane przy chwilowym braku zasięgu.
- Powiadomienia push, integracja z Pumble (kanały zleceń), e-mail (leady, przypomnienia serwisowe).
- Naklejki QR drukowane na drukarce termicznej Niimbot B4 (rolki 50×30 i 100×50 mm).
- Hosting Render, pliki w Cloudflare R2.

## Capabilities and Constraints
- Interfejs wyłącznie po polsku (polskie znaki diakrytyczne w każdej czcionce).
- Dwie role: admin i pracownik; część ekranów tylko dla admina.
- Jasny i ciemny motyw w aplikacji; strona paszportu dla klienta zawsze jasna.
- Produkcja z prawdziwymi danymi; zmiany bazy tylko dodające.
- Moduły Finanse i Płace (tylko admini); Płace liczą wypłaty, urlopy i pełny koszt pracowników do Wyniku firmy i robocizny zleceń.

## Brand Commitments
- Nazwa: ETNER, hasło „Inteligentny wybór”. Logo firmy: `web/public/logo.png` (znak: okrąg turkus→błękit z kropkami u góry i dołu, dach błękitny, granatowy „impuls”; napis „ET” błękitny, „NER” granatowy), znak wektorowo w `web/public/icon.svg`.
- Właściciel chce wyglądu profesjonalnego systemu ERP, nie „oczywiście wygenerowanego przez AI”.
- Decyzje właściciela (2026-11-05): zostaje delikatna kratka w tle; wszystko „nowe” oznaczone na czerwono; menu bez grupowania (obecna kolejność); hasło „INTELIGENTNY WYBÓR” w logo czytelne (większe); na komputerze listy jako tabele z sortowaniem, na telefonie karty.

## Evidence on Hand
- Dane demo w aplikacji (tryb DEMO); prawdziwe dane tylko na produkcji, nigdy w repozytorium.
- Brak zdjęć marketingowych i referencji klientów — niczego takiego nie wymyślać.

## Product Principles
- Teren najpierw: każda czynność ekipy wykonalna jedną ręką na telefonie.
- Biuro ma widzieć dużo naraz: gęstość informacji ponad dekorację.
- Nic nie ginie: każdy zapis potwierdzony, zmiany innych widoczne („nowe”).
- Klient widzi tylko to, co oznaczono „dla klienta”.

## Accessibility & Inclusion
- Cele dotykowe min. 44 px, czytelność w słońcu (wysoki kontrast), obsługa klawiaturą na komputerze, polskie etykiety dla czytników ekranu.
