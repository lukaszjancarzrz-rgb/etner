import { isNull } from 'drizzle-orm';
import type { Db } from './db.js';
import { firmy } from './schema-base.js';

/** Jedyna firma z seeda (moduł 1 obsługuje jedną). */
export function defaultFirmaId(db: Db): string {
  const f = db.select({ id: firmy.id }).from(firmy).where(isNull(firmy.deletedAt)).limit(1).get();
  if (!f) throw new Error('Brak firmy w bazie (seed)');
  return f.id;
}
