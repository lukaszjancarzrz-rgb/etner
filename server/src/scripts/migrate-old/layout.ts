/**
 * Układ kart arkusza Firma_2026 (wspólny dla odczytu i atrapy). Kolumny szukamy po tekście nagłówka, nie po literze,
 * więc przesunięcie kolumn w arkuszu nie psuje odczytu. Rodzaj pola: 't' tekst, 'd' data, 'n' liczba.
 */
export const SHEETS = {
  zlecenia: 'Zlecenia', wyceny: 'Wyceny i leady', historia: 'Historia kontaktów', harmonogram: 'Harmonogram',
  zadania: 'Zadania i notatki', zakupy: 'Zakupy', parametry: 'Parametry',
} as const;

/** Wiersz nagłówków tabel (sekcje powtarzają ten sam nagłówek wiersz pod swoim znacznikiem). */
export const HEADER_ROW = { zlecenia: 7, wyceny: 7, zadania: 7, zakupy: 7, historia: 4, harmonogram: 5 } as const;

type Kind = 't' | 'd' | 'n';
export type Cols = Record<string, readonly [header: string, kind: Kind]>;

export const COLS = {
  zlecenia: {
    kat: ['Kat.', 't'], status: ['Status', 't'], termin: ['Termin (miesiąc)', 't'], ekipa: ['Ekipa', 't'], lokalizacja: ['Lokalizacja', 't'],
    klient: ['Inwestor / klient', 't'], zakres: ['Zakres prac', 't'], kontakt: ['Kontakt (tel. / e-mail)', 't'], uwagi: ['Uwagi', 't'],
    haslo: ['Hasło w harmonogramie', 't'], zamknieto: ['Zamknięto', 'd'],
  },
  wyceny: {
    dodano: ['Data dodania', 'd'], kat: ['Kat.', 't'], status: ['Status', 't'], temat: ['Temat / lokalizacja', 't'], klient: ['Klient', 't'],
    kontakt: ['Kontakt (tel. / e-mail)', 't'], zrodlo: ['Skąd klient', 't'], opis: ['Opis / info', 't'], wartosc: ['Wartość wyceny netto (zł)', 'n'],
    nastepny: ['Następny kontakt', 'd'], ustalono: ['Co ustalono (przy kontakcie)', 't'], ostatni: ['Ostatni kontakt', 'd'], uwagi: ['Uwagi', 't'],
    zamknieto: ['Zamknięto', 'd'],
  },
  historia: {
    dzien: ['Data kontaktu', 'd'], temat: ['Temat / lead', 't'], klient: ['Klient', 't'], kontakt: ['Kontakt (tel. / e-mail)', 't'],
    plan: ['Zaplanowany termin', 'd'], ustalono: ['Co ustalono', 't'], nastepny: ['Następny kontakt', 'd'], status: ['Status leada', 't'], zapisano: ['Zapisano', 't'],
  },
  zadania: {
    tekst: ['Zadanie / notatka', 't'], priorytet: ['Priorytet', 'n'], grupa: ['Grupa', 't'], status: ['Status', 't'], termin: ['Termin', 'd'],
    uwagi: ['Uwagi / link', 't'], zrobiono: ['Zrobiono', 'd'],
  },
  zakupy: {
    co: ['Co', 't'], sklep: ['Sklep', 't'], grupa: ['Grupa', 't'], status: ['Status', 't'], kwota: ['Kwota (zł)', 'n'], lista: ['Lista (z notatek)', 't'],
    uwagi: ['Uwagi', 't'], kupiono: ['Kupiono', 'd'],
  },
} as const satisfies Record<string, Cols>;

/** Harmonogram: nagłówki kolumn stałych; osoby z listy płac stoją przed kolumną uwag, osoby spoza płac – za nią, do „mies.”. */
export const HARM = { data: 'Data', swieto: 'Święto / miesiąc', uwagi: 'Uwagi', koniec: 'mies.' } as const;
/** Parametry: nagłówki list, pod którymi stoją wartości. */
export const PARAM = { kody: 'Kody w harmonogramie', kategorie: 'Kategoria – kod' } as const;

/** Nazwa sekcji ze znacznika skryptu, np. „@NA PÓŹNIEJ|s|Na później” → „NA PÓŹNIEJ”; „@koniec” → null. */
export const sectionName = (marker: string): string | null => {
  const name = marker.slice(1).split('|')[0]!.trim();
  return name === 'koniec' ? null : name;
};
