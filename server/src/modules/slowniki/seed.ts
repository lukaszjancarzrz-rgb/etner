import { count, eq } from 'drizzle-orm';
import { newId, type DictGrupa, type DictRodzaj } from '@etner/shared';
import { recordChange } from '../../core/changes.js';
import type { Db } from '../../core/db.js';
import { firmy } from '../../core/schema-base.js';
import { dict } from './schema.js';
import { seedTemplates } from '../na-jutro/service.js';
import { seedCars } from '../samochody/service.js';

// Najlepsze przypuszczenie (R15): prawdziwe listy Parametry nie były dostępne. Właściciel poprawia je tu lub w aplikacji.
type Item = string | [wartosc: string, extra: { grupa?: DictGrupa; platne?: boolean; kolor?: string; kategoria?: string }];
const g = (grupa: DictGrupa, ...w: string[]): Item[] => w.map((x) => [x, { grupa }]);
const kod = (w: string, platne: boolean, kolor: string): Item => [w, { platne, kolor }];
const kol = (w: string, kolor: string): Item => [w, { kolor }];
const cz = (kategoria: string, ...w: string[]): Item[] => w.map((x) => [x, { kategoria }]);

export const SEED: Record<DictRodzaj, Item[]> = {
  status_zlecenia: [
    ...g('aktualne', 'Nowe', 'Do wyceny', 'Zaplanowane', 'W realizacji', 'Do dokończenia'),
    ...g('pozniej', 'Na później'),
    ...g('zamkniete', 'Zakończone', 'Rozliczone', 'Anulowane'),
  ],
  // Kolejność ma znaczenie: 4. wartość to 'Przyjęta'.
  status_leada: [
    ...g('aktualne', 'Nowy', 'W kontakcie', 'Wycena wysłana'),
    ...g('zamkniete', 'Przyjęta', 'Odrzucona'),
    ...g('pozniej', 'Na kiedyś'),
  ],
  ekipa: ['ekipa Bartek', 'ekipa Marek', 'mieszane'],
  // R30: kolor kategorii = kolor zlecenia w harmonogramie
  kategoria: [kol('Elektryka', '#0070ab'), kol('Fotowoltaika', '#c62828'), kol('Rekuperacja', '#2e7d32'), kol('Klimatyzacja', '#7b1fa2'),
    kol('Alarmy i monitoring', '#455a64'), kol('Smart home', '#00838f'), kol('Sprzedaż', '#6d4c41'), kol('Inne', '#f9a825')],
  rodzaj_zlecenia: ['montaż', 'przygotówka', 'serwis', 'inne'],
  zrodlo: ['Polecenie', 'Strona www', 'Facebook', 'Telefon', 'Inne'],
  kod_nieobecnosci: [kod('urlop', true, '#00736b'), kod('L4', true, '#c0392b'), kod('szkolenie', true, '#0070ab'), kod('wolne', false, '#8896a5'), kod('UŻ', true, '#b9770e')],
  status_zadania: ['Do zrobienia', 'W toku', 'Zrobione'],
  grupa_zadan: ['Firma', 'Klienci', 'Sprzęt'],
  status_zakupu: ['Do kupienia', 'Kupione'],
  dzien_wolny: [],
  // P11 (moduł 2): robocze, właściciel ustandaryzuje w Ustawieniach
  czynnosc_serwisowa: [
    ...cz('Rekuperacja', 'Wymiana filtrów F7', 'Wymiana filtrów G4', 'Czyszczenie wymiennika', 'Kontrola odpływu skroplin', 'Dezynfekcja kanałów'),
    ...cz('Klimatyzacja', 'Czyszczenie filtrów', 'Odgrzybianie', 'Kontrola ciśnienia i szczelności', 'Kontrola odpływu skroplin'),
    ...cz('Fotowoltaika', 'Przegląd falownika', 'Kontrola zabezpieczeń DC/AC', 'Odczyt produkcji'),
    ...cz('Elektryka', 'Pomiary instalacji', 'Kontrola zabezpieczeń'),
  ],
};

const LATE = ['czynnosc_serwisowa'];

/**
 * Idempotentne: słowniki wstawiamy do pustej tabeli bez wpisów w changes (klient startuje od snapshotu); firmę tylko gdy nie ma żadnej.
 * Rodzaje dodane po starcie produkcji (LATE) dostają wartości w działającej bazie, gdy nie mają żadnego wiersza (usunięte też się liczą) – z wpisami w changes.
 */
export function seedBase(db: Db): void {
  const now = new Date().toISOString();
  const fresh = db.select({ n: count() }).from(dict).get()!.n === 0;
  for (const [rodzaj, items] of Object.entries(SEED)) {
    if (!fresh && (!LATE.includes(rodzaj) || db.select({ n: count() }).from(dict).where(eq(dict.rodzaj, rodzaj)).get()!.n > 0)) continue;
    items.forEach((it, kolejnosc) => {
      const [wartosc, extra] = typeof it === 'string' ? [it, {}] : it;
      const row = db.insert(dict).values({ id: newId(), rodzaj, wartosc, kolejnosc, grupa: extra.grupa ?? null, platne: extra.platne ?? null, kolor: extra.kolor ?? null, kategoria: extra.kategoria ?? null, createdAt: now, updatedAt: now }).returning().get();
      if (!fresh) recordChange(db, null, 'dict', row.id, 'create', null, row);
    });
  }
  if (db.select({ n: count() }).from(firmy).get()!.n === 0) {
    db.insert(firmy).values({ id: newId(), nazwa: 'ETNER', skrot: 'ETNER', prefiksZ: 'Z', prefiksL: 'L', createdAt: now, updatedAt: now }).run();
  }
  seedTemplates(db);
  seedCars(db);
}
