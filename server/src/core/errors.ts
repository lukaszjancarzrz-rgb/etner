import { desc } from 'drizzle-orm';
import type { Db } from './db.js';
import { errors } from './schema-base.js';

export function logError(db: Db, where: string, err: unknown, userId?: string | null): void {
  const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
  try {
    db.insert(errors).values({ at: new Date().toISOString(), where, message, userId: userId ?? null }).run();
  } catch (e) {
    console.error('logError nie zapisał', e, err);
  }
}

export function recentErrors(db: Db, limit = 200) {
  return db.select().from(errors).orderBy(desc(errors.id)).limit(limit).all();
}
