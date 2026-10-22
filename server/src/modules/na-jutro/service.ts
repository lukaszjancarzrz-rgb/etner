import { and, asc, eq, isNull } from 'drizzle-orm';
import { newId, type ChecklistCreate } from '@etner/shared';
import { recordChange } from '../../core/changes.js';
import type { Db } from '../../core/db.js';
import { dictRefsFor } from '../../core/dict-refs.js';
import { checklists } from './schema.js';

/** Słowniki: ekipa w listach „na jutro”. */
export const dictRefs = dictRefsFor('checklists', checklists, { ekipa: checklists.ekipa });

export type ChecklistRow = typeof checklists.$inferSelect;

export const get = (db: Db, id: string): ChecklistRow | undefined =>
  db.select().from(checklists).where(and(eq(checklists.id, id), isNull(checklists.deletedAt))).get();
export const list = (db: Db, ekipa?: string): ChecklistRow[] =>
  db.select().from(checklists).where(and(isNull(checklists.deletedAt), ekipa === undefined ? undefined : eq(checklists.ekipa, ekipa)))
    .orderBy(asc(checklists.dzien), asc(checklists.createdAt)).all();
/** Niezabrane rzeczy na dany dzień (wszystkie ekipy). */
export const pending = (db: Db, dzien: string): ChecklistRow[] =>
  list(db).filter((r) => r.dzien === dzien && !r.zabrane);

export function create(db: Db, userId: string, d: Omit<ChecklistCreate, 'opId'>): ChecklistRow {
  const now = new Date().toISOString();
  const row = db.insert(checklists).values({ ...d, id: newId(), createdAt: now, createdBy: userId, updatedAt: now }).returning().get();
  recordChange(db, userId, 'checklists', row.id, 'create', null, row);
  return row;
}

function patch(db: Db, userId: string, id: string, set: Partial<typeof checklists.$inferInsert>, action: 'update' | 'delete' = 'update'): ChecklistRow | undefined {
  const old = get(db, id);
  if (!old) return undefined;
  const row = db.update(checklists).set({ ...set, updatedAt: new Date().toISOString() }).where(eq(checklists.id, id)).returning().get();
  recordChange(db, userId, 'checklists', id, action, old, row);
  return row;
}

export const update = (db: Db, userId: string, id: string, d: Partial<Pick<ChecklistRow, 'tekst' | 'dzien' | 'ekipa'>>) =>
  patch(db, userId, id, Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)));
export const setZabrane = (db: Db, userId: string, id: string, zabrane: boolean) =>
  patch(db, userId, id, zabrane ? { zabrane, zabraneBy: userId, zabraneAt: new Date().toISOString() } : { zabrane, zabraneBy: null, zabraneAt: null });
export const remove = (db: Db, userId: string, id: string) =>
  patch(db, userId, id, { deletedAt: new Date().toISOString() }, 'delete');
