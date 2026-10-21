import { and, asc, eq, isNull, max } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { newId, type ScopeCreate, type ScopeUpdate } from '@etner/shared';
import { recordChange } from '../../core/changes.js';
import type { Db } from '../../core/db.js';
import * as dziennik from '../dziennik/service.js';
import { jobScopeItems } from './schema.js';
import { get as getJob } from './service.js';

export type ScopeRow = typeof jobScopeItems.$inferSelect;
const NOW = () => new Date().toISOString();

export const getItem = (db: Db, id: string): ScopeRow | undefined =>
  db.select().from(jobScopeItems).where(and(eq(jobScopeItems.id, id), isNull(jobScopeItems.deletedAt))).get();
export const itemsOf = (db: Db, jobId: string): ScopeRow[] =>
  db.select().from(jobScopeItems).where(and(eq(jobScopeItems.jobId, jobId), isNull(jobScopeItems.deletedAt))).orderBy(asc(jobScopeItems.kolejnosc), asc(jobScopeItems.createdAt)).all();

/** Wywołuj w runOp. Nowy punkt na końcu listy; zdjęcia z POST /api/uploads. */
export function create(db: Db, userId: string, jobId: string, d: Omit<ScopeCreate, 'opId'>): ScopeRow | undefined {
  if (!getJob(db, jobId)) return undefined;
  const ups = dziennik.checkUploads(db, userId, d.uploads);
  const last = db.select({ m: max(jobScopeItems.kolejnosc) }).from(jobScopeItems).where(and(eq(jobScopeItems.jobId, jobId), isNull(jobScopeItems.deletedAt))).get()?.m ?? 0;
  const now = NOW();
  const row = db.insert(jobScopeItems).values({ id: newId(), jobId, kolejnosc: last + 1, tekst: d.tekst, createdAt: now, createdBy: userId, updatedAt: now }).returning().get();
  recordChange(db, userId, 'job_scope_items', row.id, 'create', null, row);
  dziennik.attach(db, userId, ups, 'scope', row.id);
  return row;
}

export function update(db: Db, userId: string, id: string, d: Omit<ScopeUpdate, 'opId'>): ScopeRow | undefined {
  const old = getItem(db, id);
  if (!old) return undefined;
  const ups = dziennik.checkUploads(db, userId, d.uploads ?? []);
  let row = old;
  if (d.removePhotos?.length) dziennik.removeAttachmentsOf(db, userId, 'scope', id, d.removePhotos);
  if (d.tekst !== undefined && d.tekst !== old.tekst) {
    row = db.update(jobScopeItems).set({ tekst: d.tekst, updatedAt: NOW() }).where(eq(jobScopeItems.id, id)).returning().get();
    recordChange(db, userId, 'job_scope_items', id, 'update', old, row);
  }
  dziennik.attach(db, userId, ups, 'scope', id);
  return row;
}

/** Miękko, razem ze zdjęciami punktu. */
export function remove(db: Db, userId: string, id: string): boolean {
  const old = getItem(db, id);
  if (!old) return false;
  dziennik.removeAttachmentsOf(db, userId, 'scope', id);
  const now = NOW();
  const row = db.update(jobScopeItems).set({ deletedAt: now, updatedAt: now }).where(eq(jobScopeItems.id, id)).returning().get();
  recordChange(db, userId, 'job_scope_items', id, 'delete', old, row);
  return true;
}

/** Nowa kolejność: `ids` to dokładnie wszystkie punkty zlecenia. */
export function reorder(db: Db, userId: string, jobId: string, ids: string[]): ScopeRow[] | undefined {
  if (!getJob(db, jobId)) return undefined;
  const items = itemsOf(db, jobId);
  const have = new Set(items.map((i) => i.id));
  if (ids.length !== items.length || new Set(ids).size !== ids.length || ids.some((i) => !have.has(i))) throw new HTTPException(400, { message: 'Lista punktów jest nieaktualna, odśwież zlecenie' });
  const now = NOW();
  for (const [i, id] of ids.entries()) {
    const old = items.find((x) => x.id === id)!;
    if (old.kolejnosc === i + 1) continue;
    const row = db.update(jobScopeItems).set({ kolejnosc: i + 1, updatedAt: now }).where(eq(jobScopeItems.id, id)).returning().get();
    recordChange(db, userId, 'job_scope_items', id, 'update', old, row);
  }
  return itemsOf(db, jobId);
}
