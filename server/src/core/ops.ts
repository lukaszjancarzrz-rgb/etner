import { eq } from 'drizzle-orm';
import { tx, type Db } from './db.js';
import { opIds } from './schema-base.js';

/** Idempotentny zapis: wynik opId trafia do op_ids w tej samej transakcji co zmiana. */
export function runOp<T>(db: Db, opId: string | undefined, userId: string, fn: () => T): { result: T; dup: boolean } {
  return tx(db, (t) => {
    if (opId) {
      const prev = t.select().from(opIds).where(eq(opIds.opId, opId)).get();
      if (prev && prev.userId !== userId) throw new Error('opId należy do innego użytkownika');
      if (prev) return { result: prev.result as T, dup: true };
    }
    const result = fn();
    if (opId) t.insert(opIds).values({ opId, userId, at: new Date().toISOString(), result: result ?? null }).run();
    return { result, dup: false };
  });
}
