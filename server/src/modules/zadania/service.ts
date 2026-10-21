import { and, asc, eq, isNull } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { newId, type TaskSaveInput } from '@etner/shared';
import { recordChange } from '../../core/changes.js';
import type { Db } from '../../core/db.js';
import * as slowniki from '../slowniki/service.js';
import { tasks } from './schema.js';

export type TaskRow = typeof tasks.$inferSelect;

export const get = (db: Db, id: string): TaskRow | undefined =>
  db.select().from(tasks).where(and(eq(tasks.id, id), isNull(tasks.deletedAt))).get();
export const list = (db: Db): TaskRow[] =>
  db.select().from(tasks).where(isNull(tasks.deletedAt)).orderBy(asc(tasks.termin), asc(tasks.createdAt)).all();

/** Wywołuj w runOp. Zadanie cykliczne ustawione na „Zrobione” wraca do pierwszego statusu, `ostatnio` = today. */
export function save(db: Db, userId: string, input: TaskSaveInput, today: string): TaskRow | undefined {
  const { id, ...rest } = input;
  const old = id ? get(db, id) : undefined;
  if (id && !old) return undefined;
  const patch: Record<string, unknown> = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
  const first = slowniki.list(db, 'status_zadania')[0]?.wartosc;
  const status = (patch.status as string | undefined) ?? old?.status ?? first;
  if (!status) throw new HTTPException(400, { message: 'Brak statusów zadań w słowniku' });
  if (!slowniki.list(db, 'status_zadania').some((s) => s.wartosc === status)) throw new HTTPException(400, { message: 'Nieznany status zadania' });
  patch.status = status;
  // Literał 'Zrobione': seed słownika; wartość „ukończone” nie ma w słowniku osobnego znacznika.
  if (status === 'Zrobione' && (patch.cykliczne ?? old?.cykliczne)) Object.assign(patch, { status: first, ostatnio: today });
  const now = new Date().toISOString();
  if (old) {
    const row = db.update(tasks).set({ ...patch, updatedAt: now }).where(eq(tasks.id, old.id)).returning().get();
    recordChange(db, userId, 'tasks', row.id, 'update', old, row);
    return row;
  }
  const row = db.insert(tasks).values({ ...patch, id: newId(), createdAt: now, createdBy: userId, updatedAt: now } as typeof tasks.$inferInsert).returning().get();
  recordChange(db, userId, 'tasks', row.id, 'create', null, row);
  return row;
}

export function remove(db: Db, userId: string, id: string): boolean {
  const old = get(db, id);
  if (!old) return false;
  const now = new Date().toISOString();
  const row = db.update(tasks).set({ deletedAt: now, updatedAt: now }).where(eq(tasks.id, id)).returning().get();
  recordChange(db, userId, 'tasks', id, 'delete', old, row);
  return true;
}
