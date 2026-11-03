import { eq } from 'drizzle-orm';
import { settings } from '../core/schema-base.js';
import { tx, type Db } from '../core/db.js';
import type { DictRefs } from '../core/dict-refs.js';
import { internalInvoices } from '../modules/dziennik/service.js';
import { mergeDuplicateSites } from '../modules/klienci/service.js';

const KEY = 'site_merge_r70';

/**
 * Jednorazowo przy starcie (znacznik `site_merge_r70` w settings): zdublowane obiekty z przeniesienia arkusza (R70)
 * i faktury oznaczone „dla klienta” → wewnętrzne. Później duplikaty łapią addSite i łączenie klientów. Zwraca liczby albo null (już było).
 */
export function runOnceR70(db: Db, siteRefs: DictRefs[]): { sites: number; invoices: number } | null {
  if (db.select().from(settings).where(eq(settings.key, KEY)).get()) return null;
  const sites = mergeDuplicateSites(db, siteRefs);
  const invoices = tx(db, () => internalInvoices(db));
  const now = new Date().toISOString();
  db.insert(settings).values({ key: KEY, value: now, updatedAt: now }).onConflictDoUpdate({ target: settings.key, set: { value: now, updatedAt: now } }).run();
  return { sites, invoices };
}
