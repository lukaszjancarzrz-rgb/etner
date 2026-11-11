# Instrukcja: miesięczny import kosztów z KPiR (dla Claude w kolejnych rozmowach)

Właściciel raz w miesiącu wgrywa w czacie PDF z Księgi Przychodów i Rozchodów (KPiR) za miesiąc od księgowej.
Claude przygotowuje z niego **jeden plik JSON** (format niżej) i daje go właścicielowi.
Właściciel wgrywa plik w aplikacji: **Finanse → Koszty → „Importuj miesiąc z KPiR”**. Aplikacja najpierw pokazuje próbę (ile pozycji, duplikaty, sumy wg kolumn KPiR), potem „Zapisz”.

Zasady:
- Prawdziwe dane (kontrahenci, kwoty) **nigdy nie trafiają do repozytorium** – plik JSON zapisuj w katalogu roboczym sesji (scratchpad) i wysyłaj właścicielowi, nie commituj.
- Każda pozycja rozchodu z KPiR = jeden obiekt w `koszty`. Kwoty **netto**, tak jak w księdze.
- Pozycje przychodu (kol. 7–9) **nie** idą do kosztów; ich suma trafia tylko do `kpir.przychod` (kontrola – przychody w aplikacji pochodzą ze zleceń).
- Po zrobieniu pliku policz sumy kolumn 12/13/14/15 z pliku i porównaj z linią „Razem” w PDF. Jeśli się różnią – powiedz właścicielowi o różnicy (np. pominięta pozycja) przed wysłaniem pliku.
- Gdy pozycji nie da się przypisać do kategorii: `"kategoria": "Inne"` i krótka uwaga w `uwagi`. Błędy w samej KPiR (np. zdublowany wpis): `"kategoria": "Do wyjaśnienia – błąd w KPiR (nie liczone)"`, `"doWyniku": false`.

## Format pliku

UTF-8, rozszerzenie `.json`, nazwa `kpir-RRRR-MM.json`.

```json
{
  "format": "etner-kpir-1",
  "miesiac": "2026-10",
  "kpir": {
    "przychod": 41250.00,
    "towary": 18420.10,
    "uboczne": 412.30,
    "wynagrodzenia": 0,
    "pozostale": 2140.55
  },
  "koszty": [
    {
      "data": "2026-10-03",
      "nrDokumentu": "FV/123/10/2026",
      "kontrahent": "Hurtownia Przykład Sp. z o.o.",
      "nip": "1234567890",
      "opis": "Materiały elektryczne",
      "kategoria": "Materiały i towary",
      "netto": 1234.56,
      "kolumnaKpir": 12,
      "doWyniku": true,
      "uwagi": ""
    }
  ]
}
```

Pola:
- `miesiac` – miesiąc księgi (RRRR-MM). Każdy koszt liczy się do tego miesiąca.
- `kpir` – sumy z linii „Razem” w PDF: przychód (kol. 9), towary i materiały (kol. 12), koszty uboczne zakupu (kol. 13), wynagrodzenia (kol. 14), pozostałe wydatki (kol. 15). Wypełniają „Kontrolę KPiR”.
- `data` – data zdarzenia z KPiR (RRRR-MM-DD).
- `netto` – liczba z kropką, 2 miejsca po przecinku (bez „zł” i spacji).
- `kolumnaKpir` – 12, 13, 14 albo 15 (kolumna, w której kwota stoi w księdze).
- `kategoria` – jedna z kategorii kosztów w aplikacji (Ustawienia → Słowniki → Kategoria kosztu). Start (z arkusza właściciela):
  - Materiały i towary (zwykle kol. 12)
  - Narzędzia i wyposażenie
  - Paliwo
  - Samochody (części, serwis, opłaty)
  - Księgowość i biuro
  - Telefon i internet
  - Szkolenia
  - Badania i BHP pracowników
  - Amortyzacja
  - Płace z listy płac (w arkuszach pracowników) → **`doWyniku: false`** (płace liczą się z modułu Płace / kwoty miesięcznej, nie drugi raz)
  - Inne
  - Do wyjaśnienia – błąd w KPiR (nie liczone) → `doWyniku: false`
- `doWyniku` – czy koszt liczy się do wyniku firmy (domyślnie `true`).
- Kosztów **nie** przypisujemy do zleceń (materiały zlecenia admin wpisuje szacunkowo na karcie zlecenia).

Duplikaty: aplikacja pomija pozycję o tym samym miesiącu, numerze dokumentu, dacie i kwocie netto (ponowne wgranie tego samego pliku nic nie dubluje).
