import { and, count, eq, isNull } from 'drizzle-orm';
import { newId, type DictGrupa, type DictRodzaj } from '@etner/shared';
import { recordChange } from '../../core/changes.js';
import { tx, type Db } from '../../core/db.js';
import { firmy } from '../../core/schema-base.js';
import { dict } from './schema.js';
import { seedTemplates } from '../na-jutro/service.js';
import { seedCars } from '../samochody/service.js';

// Najlepsze przypuszczenie (R15): prawdziwe listy Parametry nie były dostępne. Właściciel poprawia je tu lub w aplikacji.
type Item = string | [wartosc: string, extra: { grupa?: DictGrupa; platne?: boolean; kolor?: string; kategoria?: string; cyklMies?: number }];
const g = (grupa: DictGrupa, ...w: string[]): Item[] => w.map((x) => [x, { grupa }]);
const kod = (w: string, platne: boolean, kolor: string): Item => [w, { platne, kolor }];
const kol = (w: string, kolor: string, cyklMies?: number): Item => [w, { kolor, cyklMies }];
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
  // R30: kolor kategorii = kolor zlecenia w harmonogramie; R67: domyślny cykl serwisu teczki (miesiące)
  kategoria: [kol('Elektryka', '#0070ab'), kol('Fotowoltaika', '#c4501b', 12), kol('Rekuperacja', '#2e7d32', 6), kol('Klimatyzacja', '#7b1fa2', 12),
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

const parse = (it: Item) => (typeof it === 'string' ? [it, {}] : it) as [string, Exclude<Item, string>[1]];

/**
 * Moduł 2 w działającej bazie (jednorazowo: póki nie ma żadnej czynności, usunięte też się liczą), w jednej transakcji, z wpisami w changes:
 * czynności serwisowe (kategoria tylko, gdy taka jest w słowniku) i domyślny cykl serwisu kategorii z SEED, którym go brak (R67).
 */
function seedModul2(db: Db, now: string): void {
  if (db.select({ n: count() }).from(dict).where(eq(dict.rodzaj, 'czynnosc_serwisowa')).get()!.n > 0) return;
  const kat = db.select().from(dict).where(and(eq(dict.rodzaj, 'kategoria'), isNull(dict.deletedAt))).all();
  SEED.czynnosc_serwisowa.map(parse).forEach(([wartosc, extra], kolejnosc) => {
    const kategoria = kat.some((k) => k.wartosc === extra.kategoria) ? extra.kategoria! : null;
    const row = db.insert(dict).values({ id: newId(), rodzaj: 'czynnosc_serwisowa', wartosc, kolejnosc, kategoria, createdAt: now, updatedAt: now }).returning().get();
    recordChange(db, null, 'dict', row.id, 'create', null, row);
  });
  for (const [wartosc, extra] of SEED.kategoria.map(parse)) {
    const old = kat.find((k) => k.wartosc === wartosc);
    if (!extra.cyklMies || !old || old.cyklMies !== null) continue;
    const row = db.update(dict).set({ cyklMies: extra.cyklMies, updatedAt: now }).where(eq(dict.id, old.id)).returning().get();
    recordChange(db, null, 'dict', old.id, 'update', old, row);
  }
}

/** Idempotentne: słowniki wstawiamy tylko do pustej tabeli, firmę tylko gdy nie ma żadnej. Bez wpisów w changes (klient startuje od snapshotu). */
export function seedBase(db: Db): void {
  const now = new Date().toISOString();
  if (db.select({ n: count() }).from(dict).get()!.n === 0) {
    for (const [rodzaj, items] of Object.entries(SEED)) {
      items.map(parse).forEach(([wartosc, extra], kolejnosc) => {
        db.insert(dict).values({ id: newId(), rodzaj, wartosc, kolejnosc, grupa: extra.grupa ?? null, platne: extra.platne ?? null, kolor: extra.kolor ?? null, kategoria: extra.kategoria ?? null, cyklMies: extra.cyklMies ?? null, createdAt: now, updatedAt: now }).run();
      });
    }
  } else tx(db, () => seedModul2(db, now));
  if (db.select({ n: count() }).from(firmy).get()!.n === 0) {
    db.insert(firmy).values({ id: newId(), nazwa: 'ETNER', skrot: 'ETNER', prefiksZ: 'Z', prefiksL: 'L', createdAt: now, updatedAt: now }).run();
  }
  seedTemplates(db);
  seedCars(db);
}
