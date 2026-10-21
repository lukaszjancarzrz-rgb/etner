import { and, asc, eq, isNull } from 'drizzle-orm';
import { newId, type DictGrupa, type DictPut, type DictRodzaj } from '@etner/shared';
import { recordChange } from '../../core/changes.js';
import type { Db } from '../../core/db.js';
import { dict } from './schema.js';

export type DictRow = typeof dict.$inferSelect;

export const list = (db: Db, rodzaj: DictRodzaj): DictRow[] =>
  db.select().from(dict).where(and(eq(dict.rodzaj, rodzaj), isNull(dict.deletedAt))).orderBy(asc(dict.kolejnosc)).all();

export const listAll = (db: Db): DictRow[] =>
  db.select().from(dict).where(isNull(dict.deletedAt)).orderBy(asc(dict.rodzaj), asc(dict.kolejnosc)).all();

export const groupOf = (db: Db, rodzaj: DictRodzaj, wartosc: string): DictGrupa | null =>
  list(db, rodzaj).find((r) => r.wartosc === wartosc)?.grupa ?? null;

/** Podmienia pełną listę rodzaju: te same wartości zachowują id, brakujące znikają miękko, wróciłe się wskrzeszają. */
export function replace(db: Db, userId: string, rodzaj: DictRodzaj, items: DictPut['items']): DictRow[] {
  const now = new Date().toISOString();
  const all = db.select().from(dict).where(eq(dict.rodzaj, rodzaj)).all();
  const kept = new Set<string>();
  items.forEach((it, kolejnosc) => {
    const vals = { kolejnosc, grupa: it.grupa ?? null, platne: it.platne ?? null, kolor: it.kolor ?? null };
    const old = all.find((r) => r.wartosc === it.wartosc);
    if (!old) {
      const row = db.insert(dict).values({ id: newId(), rodzaj, wartosc: it.wartosc, ...vals, createdAt: now, createdBy: userId, updatedAt: now }).returning().get();
      recordChange(db, userId, 'dict', row.id, 'create', null, row);
      return;
    }
    kept.add(old.id);
    const same = !old.deletedAt && (Object.keys(vals) as (keyof typeof vals)[]).every((k) => old[k] === vals[k]);
    if (same) return;
    const row = db.update(dict).set({ ...vals, deletedAt: null, updatedAt: now }).where(eq(dict.id, old.id)).returning().get();
    recordChange(db, userId, 'dict', old.id, 'update', old, row);
  });
  for (const old of all) {
    if (kept.has(old.id) || old.deletedAt) continue;
    const row = db.update(dict).set({ deletedAt: now, updatedAt: now }).where(eq(dict.id, old.id)).returning().get();
    recordChange(db, userId, 'dict', old.id, 'delete', old, row);
  }
  return list(db, rodzaj);
}
