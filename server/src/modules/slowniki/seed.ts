import { count } from 'drizzle-orm';
import { newId, type DictGrupa, type DictRodzaj } from '@etner/shared';
import type { Db } from '../../core/db.js';
import { firmy } from '../../core/schema-base.js';
import { dict } from './schema.js';

// Najlepsze przypuszczenie (R15): prawdziwe listy Parametry nie były dostępne. Właściciel poprawia je tu lub w aplikacji.
type Item = string | [wartosc: string, extra: { grupa?: DictGrupa; platne?: boolean; kolor?: string }];
const g = (grupa: DictGrupa, ...w: string[]): Item[] => w.map((x) => [x, { grupa }]);
const kod = (w: string, platne: boolean, kolor: string): Item => [w, { platne, kolor }];

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
  kategoria: ['Rekuperacja', 'Klimatyzacja', 'Pompa ciepła', 'Serwis', 'Inne'],
  rodzaj_zlecenia: ['montaż', 'serwis', 'gwarancja', 'inne'],
  zrodlo: ['Polecenie', 'Strona www', 'Facebook', 'Telefon', 'Inne'],
  kod_nieobecnosci: [kod('urlop', true, '#00736b'), kod('L4', true, '#c0392b'), kod('szkolenie', true, '#0070ab'), kod('wolne', false, '#8896a5'), kod('UŻ', true, '#b9770e')],
  status_zadania: ['Do zrobienia', 'W toku', 'Zrobione'],
  grupa_zadan: ['Firma', 'Klienci', 'Sprzęt'],
  status_zakupu: ['Do kupienia', 'Zamówione', 'Kupione'],
  grupa_zakupow: ['Materiały', 'Narzędzia'],
  dzien_wolny: [],
};

/** Idempotentne: słowniki wstawiamy tylko do pustej tabeli, firmę tylko gdy nie ma żadnej. Bez wpisów w changes (klient startuje od snapshotu). */
export function seedBase(db: Db): void {
  const now = new Date().toISOString();
  if (db.select({ n: count() }).from(dict).get()!.n === 0) {
    for (const [rodzaj, items] of Object.entries(SEED)) {
      items.forEach((it, kolejnosc) => {
        const [wartosc, extra] = typeof it === 'string' ? [it, {}] : it;
        db.insert(dict).values({ id: newId(), rodzaj, wartosc, kolejnosc, grupa: extra.grupa ?? null, platne: extra.platne ?? null, kolor: extra.kolor ?? null, createdAt: now, updatedAt: now }).run();
      });
    }
  }
  if (db.select({ n: count() }).from(firmy).get()!.n === 0) {
    db.insert(firmy).values({ id: newId(), nazwa: 'ETNER', skrot: 'ETNER', prefiksZ: 'Z', prefiksL: 'L', createdAt: now, updatedAt: now }).run();
  }
}
