import { byOther } from '../../core/badges.js';
import type { Rec } from '../../core/store.js';

/** Pola karty zlecenia ze znacznikiem „nowe” (R62). E-maile i NIP klienta nie są na karcie, więc ich nie porównujemy. */
export const JOB_FIELDS = ['status', 'termin', 'kategoria', 'rodzaj', 'ekipa', 'uwagiAdmin'] as const;
export const CLIENT_FIELDS = ['nazwa', 'telefony'] as const;
export const SITE_FIELDS = ['nazwa', 'adres', 'miejscowosc', 'mapa'] as const;

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Pola zmienione przez inną osobę od wersji widzianej (ostatnia z `_hist` z `updatedAt` ≤ `since`); bez historii (snapshot) nic.
 * Kopia optymistyczna ma `updatedAt` poprzedniej wersji i jest pomijana: to własna zmiana, a jej `_by` jest jeszcze stary.
 * Pole, które po cudzej zmianie poprawiłem sam albo wróciło do widzianej wartości, nie jest nowe.
 */
export function changedFields(r: Rec | undefined, since: string, meId: string | undefined, fields: readonly string[]): Set<string> {
  const out = new Set<string>();
  if (!r?._hist?.length) return out;
  const vs: Rec[] = [];
  for (const v of [...(r._hist as Rec[]), r]) if (!vs.length || v.updatedAt !== vs.at(-1)!.updatedAt) vs.push(v);
  // wszystkie wersje nowsze od wizyty: widziana nieznana, porównujemy od najstarszej zapamiętanej
  let base = 0;
  vs.forEach((v, i) => { if (v.updatedAt <= since) base = i; });
  for (const f of fields) {
    let other = false;
    for (let i = base + 1; i < vs.length; i++) if (!same(vs[i]![f], vs[i - 1]![f])) other = byOther(vs[i]!, meId);
    if (other && !same(vs.at(-1)![f], vs[base]![f])) out.add(f);
  }
  return out;
}
