import { and, asc, eq, isNull } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { newId, toolPlaceOk, type ToolCreate, type ToolUpdate } from '@etner/shared';
import { recordChange } from '../../core/changes.js';
import type { Db } from '../../core/db.js';
import * as samochody from '../samochody/service.js';
import { tools } from './schema.js';

export type ToolRow = typeof tools.$inferSelect;

export const get = (db: Db, id: string): ToolRow | undefined =>
  db.select().from(tools).where(and(eq(tools.id, id), isNull(tools.deletedAt))).get();
export const list = (db: Db): ToolRow[] => db.select().from(tools).where(isNull(tools.deletedAt)).orderBy(asc(tools.nazwa)).all();
/** Wiersz istnieje, ale jest już usunięty (powtórzone usunięcie z kolejki offline). */
export const removed = (db: Db, id: string): boolean => !!db.select({ d: tools.deletedAt }).from(tools).where(eq(tools.id, id)).get()?.d;

const check = (db: Db, t: { carId: string | null; podmiejsce: string | null }) => {
  if (t.carId && !samochody.getCar(db, t.carId)) throw new HTTPException(400, { message: 'Nie znaleziono samochodu' });
  if (!toolPlaceOk(t)) throw new HTTPException(400, { message: t.carId ? 'Wybierz miejsce w samochodzie' : 'Magazyn nie ma miejsc w samochodzie' });
};

export function create(db: Db, userId: string, d: Omit<ToolCreate, 'opId'>): ToolRow {
  check(db, d);
  const now = new Date().toISOString();
  const row = db.insert(tools).values({ ...d, id: newId(), by: userId, createdAt: now, createdBy: userId, updatedAt: now }).returning().get();
  recordChange(db, userId, 'tools', row.id, 'create', null, row);
  return row;
}

/** Edycja i przeniesienie; przeniesienie do Magazynu czyści podmiejsce. */
export function update(db: Db, userId: string, id: string, d: Omit<ToolUpdate, 'opId'>): ToolRow | undefined {
  const old = get(db, id);
  if (!old) return undefined;
  const set = Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)) as Partial<ToolRow>;
  if (set.carId === null) set.podmiejsce = null;
  check(db, { carId: set.carId !== undefined ? set.carId : old.carId, podmiejsce: set.podmiejsce !== undefined ? set.podmiejsce : old.podmiejsce });
  const row = db.update(tools).set({ ...set, updatedAt: new Date().toISOString() }).where(eq(tools.id, id)).returning().get();
  recordChange(db, userId, 'tools', id, 'update', old, row);
  return row;
}

export function remove(db: Db, userId: string, id: string): void {
  const old = get(db, id);
  if (!old) return;
  const now = new Date().toISOString();
  const row = db.update(tools).set({ deletedAt: now, updatedAt: now }).where(eq(tools.id, id)).returning().get();
  recordChange(db, userId, 'tools', id, 'delete', old, row);
}
