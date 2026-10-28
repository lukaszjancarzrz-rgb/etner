import { and, asc, eq, isNull } from 'drizzle-orm';
import { newId, type DictGrupa, type DictPut, type DictRodzaj } from '@etner/shared';
import { HTTPException } from 'hono/http-exception';
import { recordChange } from '../../core/changes.js';
import type { DictRefs } from '../../core/dict-refs.js';
import type { Db } from '../../core/db.js';
import { dict } from './schema.js';

export type DictRow = typeof dict.$inferSelect;

export const list = (db: Db, rodzaj: DictRodzaj): DictRow[] =>
  db.select().from(dict).where(and(eq(dict.rodzaj, rodzaj), isNull(dict.deletedAt))).orderBy(asc(dict.kolejnosc)).all();

export const listAll = (db: Db): DictRow[] =>
  db.select().from(dict).where(isNull(dict.deletedAt)).orderBy(asc(dict.rodzaj), asc(dict.kolejnosc)).all();

export const groupOf = (db: Db, rodzaj: DictRodzaj, wartosc: string): DictGrupa | null =>
  list(db, rodzaj).find((r) => r.wartosc === wartosc)?.grupa ?? null;

export class ValueInUseError extends Error {
  constructor(public value: string, public count: number) { super('WARTOSC_W_UZYCIU'); }
}

/**
 * Podmienia pełną listę rodzaju (wywołuj w transakcji). Element z `id` to istniejący wiersz: zmiana `wartosc` = zmiana nazwy,
 * także we wszystkich rekordach (`refs`). Bez `id`: dopasowanie po tekście (wróciłe się wskrzeszają), inaczej nowy wiersz.
 * Usunięcie wartości używanej w rekordach → ValueInUseError, chyba że `zamien[stara]` wskazuje wartość z `items`: wtedy jej rekordy
 * dostają tę wartość (jak przy zmianie nazwy), a stara jest usuwana.
 */
export function replace(db: Db, userId: string, rodzaj: DictRodzaj, items: DictPut['items'], refs: DictRefs[] = [], zamien: Record<string, string> = {}): DictRow[] {
  const now = new Date().toISOString();
  const all = db.select().from(dict).where(eq(dict.rodzaj, rodzaj)).all();
  const live = all.filter((r) => !r.deletedAt);
  const matched = items.map((it) => (it.id ? live.find((r) => r.id === it.id) : undefined) ?? all.find((r) => r.wartosc === it.wartosc && !items.some((o) => o.id === r.id)));
  const kept = new Set(matched.filter(Boolean).map((r) => r!.id));
  const uses = (v: string) => refs.reduce((n, r) => n + r.count(db, rodzaj, v), 0);

  const swaps: [string, string][] = [];
  for (const old of live) {
    if (kept.has(old.id)) continue;
    const n = uses(old.wartosc);
    if (!n) continue;
    const to = zamien[old.wartosc];
    if (to === undefined) throw new ValueInUseError(old.wartosc, n);
    if (to === old.wartosc || !items.some((it) => it.wartosc === to)) throw new HTTPException(400, { message: `Wartości „${to}” nie ma w słowniku` });
    swaps.push([old.wartosc, to]);
  }
  items.forEach((it, i) => {
    const old = matched[i];
    if (old && old.wartosc !== it.wartosc) {
      // nowa nazwa nie może być bieżącą wartością innego wiersza (zamiana A↔B scaliłaby rekordy)
      if (live.some((r) => r.id !== old.id && r.wartosc === it.wartosc)) throw new HTTPException(400, { message: `Wartość „${it.wartosc}” już jest w słowniku` });
      for (const r of refs) r.rename(db, userId, rodzaj, old.wartosc, it.wartosc);
    }
  });
  // po zmianach nazw: `to` to już nazwa docelowa
  for (const [from, to] of swaps) for (const r of refs) r.rename(db, userId, rodzaj, from, to);

  items.forEach((it, kolejnosc) => {
    const vals = { wartosc: it.wartosc, kolejnosc, grupa: it.grupa ?? null, platne: it.platne ?? null, kolor: it.kolor ?? null };
    const old = matched[kolejnosc];
    if (!old) {
      const row = db.insert(dict).values({ id: newId(), rodzaj, ...vals, createdAt: now, createdBy: userId, updatedAt: now }).returning().get();
      recordChange(db, userId, 'dict', row.id, 'create', null, row);
      return;
    }
    const same = !old.deletedAt && (Object.keys(vals) as (keyof typeof vals)[]).every((k) => old[k] === vals[k]);
    if (same) return;
    const row = db.update(dict).set({ ...vals, deletedAt: null, updatedAt: now }).where(eq(dict.id, old.id)).returning().get();
    recordChange(db, userId, 'dict', old.id, 'update', old, row);
  });
  for (const old of live) {
    if (kept.has(old.id)) continue;
    const row = db.update(dict).set({ deletedAt: now, updatedAt: now }).where(eq(dict.id, old.id)).returning().get();
    recordChange(db, userId, 'dict', old.id, 'delete', old, row);
  }
  return list(db, rodzaj);
}
