import { and, desc, eq, isNull } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { newId, type ShoppingCreate, type ShoppingUpdate } from '@etner/shared';
import { recordChange } from '../../core/changes.js';
import type { Db } from '../../core/db.js';
import * as slowniki from '../slowniki/service.js';
import { shopping } from './schema.js';

export type ShoppingRow = typeof shopping.$inferSelect;

export const get = (db: Db, id: string): ShoppingRow | undefined =>
  db.select().from(shopping).where(and(eq(shopping.id, id), isNull(shopping.deletedAt))).get();
export const list = (db: Db): ShoppingRow[] =>
  db.select().from(shopping).where(isNull(shopping.deletedAt)).orderBy(desc(shopping.createdAt)).all();

export function create(db: Db, userId: string, d: Omit<ShoppingCreate, 'opId'>): ShoppingRow {
  const status = slowniki.list(db, 'status_zakupu')[0]?.wartosc;
  if (!status) throw new HTTPException(400, { message: 'Brak statusów zakupów w słowniku' });
  const now = new Date().toISOString();
  const row = db.insert(shopping).values({ ...d, id: newId(), status, by: userId, createdAt: now, createdBy: userId, updatedAt: now }).returning().get();
  recordChange(db, userId, 'shopping', row.id, 'create', null, row);
  return row;
}

/** Kupione ustawia kupione_at/by przy wejściu w ten status i czyści je przy wyjściu. */
export function update(db: Db, userId: string, id: string, d: Omit<ShoppingUpdate, 'opId'>): ShoppingRow | undefined {
  const old = get(db, id);
  if (!old) return undefined;
  const set: Partial<typeof shopping.$inferInsert> = Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined));
  if (d.status !== undefined) {
    if (!slowniki.list(db, 'status_zakupu').some((s) => s.wartosc === d.status)) throw new HTTPException(400, { message: 'Nieznany status zakupu' });
    if (d.status === 'Kupione' && old.status !== 'Kupione') Object.assign(set, { kupioneAt: new Date().toISOString(), kupioneBy: userId });
    if (d.status !== 'Kupione') Object.assign(set, { kupioneAt: null, kupioneBy: null });
  }
  const row = db.update(shopping).set({ ...set, updatedAt: new Date().toISOString() }).where(eq(shopping.id, id)).returning().get();
  recordChange(db, userId, 'shopping', id, 'update', old, row);
  return row;
}

/** Wiersz istnieje, ale jest już usunięty (powtórzone usunięcie z kolejki offline). */
export const removed = (db: Db, id: string): boolean => !!db.select({ d: shopping.deletedAt }).from(shopping).where(eq(shopping.id, id)).get()?.d;

export function remove(db: Db, userId: string, id: string): void {
  const old = get(db, id);
  if (!old) return;
  const now = new Date().toISOString();
  const row = db.update(shopping).set({ deletedAt: now, updatedAt: now }).where(eq(shopping.id, id)).returning().get();
  recordChange(db, userId, 'shopping', id, 'delete', old, row);
}
