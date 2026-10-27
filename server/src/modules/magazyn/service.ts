import { and, eq, isNull, lt } from 'drizzle-orm';
import { newId, ZABRANE_DNI } from '@etner/shared';
import { recordChange } from '../../core/changes.js';
import { tx, type Db } from '../../core/db.js';
import { warehouseItems } from './schema.js';

export type ItemRow = typeof warehouseItems.$inferSelect;

export const get = (db: Db, id: string): ItemRow | undefined =>
  db.select().from(warehouseItems).where(and(eq(warehouseItems.id, id), isNull(warehouseItems.deletedAt))).get();
export const list = (db: Db): ItemRow[] => db.select().from(warehouseItems).where(isNull(warehouseItems.deletedAt)).all();
/** Wiersz istnieje, ale jest już usunięty (powtórka z kolejki offline albo sprzątanie). */
export const removed = (db: Db, id: string): boolean => !!db.select({ d: warehouseItems.deletedAt }).from(warehouseItems).where(eq(warehouseItems.id, id)).get()?.d;

export function create(db: Db, userId: string, d: { nazwa: string; ilosc: string }): ItemRow {
  const now = new Date().toISOString();
  const row = db.insert(warehouseItems).values({ ...d, id: newId(), by: userId, createdAt: now, createdBy: userId, updatedAt: now }).returning().get();
  recordChange(db, userId, 'warehouse_items', row.id, 'create', null, row);
  return row;
}

function set(db: Db, userId: string | null, old: ItemRow, patch: Partial<ItemRow>): ItemRow {
  const row = db.update(warehouseItems).set({ ...patch, updatedAt: new Date().toISOString() }).where(eq(warehouseItems.id, old.id)).returning().get();
  recordChange(db, userId, 'warehouse_items', old.id, patch.deletedAt ? 'delete' : 'update', old, row);
  return row;
}

/** Zabieram: już zabrana zostaje bez zmian (kto pierwszy, ten zabrał). */
export const take = (db: Db, userId: string, old: ItemRow, now: Date): ItemRow =>
  old.zabraneAt ? old : set(db, userId, old, { zabraneAt: now.toISOString(), zabraneBy: userId });
/** Zwracam: wraca na listę z nową ilością. */
export const giveBack = (db: Db, userId: string, old: ItemRow, ilosc: string): ItemRow => set(db, userId, old, { ilosc, zabraneAt: null, zabraneBy: null });
export const remove = (db: Db, userId: string | null, old: ItemRow): void => { set(db, userId, old, { deletedAt: new Date().toISOString() }); };

/** Sprzątanie: rzeczy zabrane dawniej niż ZABRANE_DNI dni temu (miękko, z wpisem w changes). Zwraca liczbę. */
export function purgeTaken(db: Db, now: Date): number {
  const cut = new Date(now.getTime() - ZABRANE_DNI * 86_400_000).toISOString();
  return tx(db, () => {
    const rows = db.select().from(warehouseItems).where(and(isNull(warehouseItems.deletedAt), lt(warehouseItems.zabraneAt, cut))).all();
    for (const r of rows) remove(db, null, r);
    return rows.length;
  });
}
