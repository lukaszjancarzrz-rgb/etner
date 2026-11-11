---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: []
---

# Powłoka aplikacji ETNER (wszystkie ekrany)

Scope: cała aplikacja web (PWA) – powłoka, wszystkie ekrany biura i ekip. Tryb: Operate.
Audience/job: biuro na komputerze przegląda, sortuje i porównuje (tabele); ekipy na telefonie wykonują jedną czynność naraz (karty).
Constraints (właściciel): zostaje kratka w tle; wszystko „nowe” czerwone; menu bez grupowania, obecna kolejność; hasło „INTELIGENTNY WYBÓR” czytelne; tabele z sortowaniem na komputerze (Klienci, Paszporty, Zadania, Zakupy, Do serwisu, Zlecenia), karty na telefonie.

## Direction contract
THESIS: ERP firmy instalacyjnej czytany jak katalog techniczny hurtowni: gęste, równe tabele z numerami i indeksem branż; odrzuca „przyjazny SaaS” z pływających zaokrąglonych kart, pigułek i poszerzonych nagłówków.
OWN-WORLD: granatowa szyna menu (#0a2240) z białym blokiem logo; papier biały na chłodnym tle z kratką 32 px; czarne linie 1 px, nagłówek tabeli z grubą kreską granatu; Sofia Sans (tekst, liczby tabelaryczne) + Sofia Sans Condensed (nagłówki kolumn, zakładki); promienie 3–4 px; cień tylko w okienkach; kolory: niebieski = akcja/zaznaczenie, czerwony = „nowe”/zaległe/błąd, kolory branż wyłącznie w zakładkach-indeksach.
STORY: admin od razu widzi wszystkie zlecenia z numerem, klientem, statusem, ekipą i terminem, filtruje branżą i otwiera kartę obok; ekipa na telefonie widzi czytelne karty z dużą akcją.
FIRST VIEWPORT: szyna 224 px z logo i licznikami; tytuł ekranu z liczbą pozycji; pasek: szukaj, zakres (Aktualne/Na później/Zamknięte), filtr branż jako zakładki, „+ Nowe …” po prawej; tabela z zakładkami branż przy lewej krawędzi wierszy; panel szczegółów po prawej (akcja główna Nawiguj).
FORM: katalog techniczny hurtowni elektrycznej, pozycja 6 na liście; seed:983977481a45ad83. Raises: „nowe” czerwone trzyma się do zobaczenia (tablica odlotów); każdy kolor ma jedno zadanie (oznakowanie lotnisk); układ wyrównany do kratki 8/32 px (siatka Crouwela).
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
