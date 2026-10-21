import { gt, asc } from 'drizzle-orm';
import { changeBus, deferEmit, type Db } from './db.js';
import { changes } from './schema-base.js';

export { changeBus };

export type ChangeRow = {
  seq: number;
  at: string;
  userId: string | null;
  entity: string;
  entityId: string;
  action: 'create' | 'update' | 'delete';
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

export function recordChange(
  t: Db,
  userId: string | null,
  entity: string,
  id: string,
  action: ChangeRow['action'],
  before: unknown,
  after: unknown,
): number {
  const row = t
    .insert(changes)
    .values({ at: new Date().toISOString(), userId, entity, entityId: id, action, before: before ?? null, after: after ?? null })
    .returning({ seq: changes.seq })
    .get();
  if (!deferEmit(t, row.seq)) changeBus.emit('change', row.seq);
  return row.seq;
}

export function changesSince(db: Db, seq: number, limit: number): ChangeRow[] {
  return db.select().from(changes).where(gt(changes.seq, seq)).orderBy(asc(changes.seq)).limit(limit).all() as ChangeRow[];
}
