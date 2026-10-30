import { randomBytes } from 'node:crypto';
import { tx, type Db } from '../../core/db.js';
import { hashPassword } from '../../core/password.js';
import * as slowniki from '../../modules/slowniki/service.js';
import * as uzytkownicy from '../../modules/uzytkownicy/service.js';
import * as zlecenia from '../../modules/zlecenia/service.js';
import { apply, author } from './apply.js';
import type { OldData } from './old-data.js';
import { report, type Report } from './report.js';
import { transform } from './transform.js';

class DryRun extends Error {
  constructor(public out: { report: Report; logins: string[] }) { super('dry-run'); }
}

export type Konto = { nazwa: string; login: string; haslo: string };

/**
 * Przekształca dane arkusza i zapisuje je w jednej transakcji (autor = pierwszy administrator bazy). `dryRun`: pełny zapis z raportem, potem wycofanie (baza bez zmian).
 * Hasła startowe zwracane tylko przy prawdziwym zapisie – do pokazania w konsoli, nigdzie nie są zapisywane.
 */
export async function migrate(db: Db, old: OldData, o: { dryRun: boolean; now?: Date }): Promise<{ report: Report; konta: Konto[] }> {
  const plan = transform(old, slowniki.listAll(db));
  const hasla = plan.osoby.map(() => randomBytes(9).toString('base64url'));
  // próba: bez kosztownego scrypt (konta i tak wycofane)
  const hashes = o.dryRun ? hasla.map(() => '!') : await Promise.all(hasla.map(hashPassword));
  let out: { report: Report; logins: string[] };
  // zlecenia z arkusza to stare zlecenia: bez automatycznego kanału Pumble (zostaje przycisk admina)
  const waiting = zlecenia.awaitingChannel(db);
  const before = new Set(waiting);
  try {
    out = tx(db, () => {
      // próba bez administratora (np. na pustej kopii bazy): tymczasowy admin, wycofany razem z resztą
      if (o.dryRun && !author(db)) uzytkownicy.create(db, 'cli', { login: 'proba-przeniesienia', name: 'Próba przeniesienia', role: 'admin', perms: [], passwordHash: '!' });
      const { logins } = apply(db, plan, { hashes, now: o.now ?? new Date() });
      const r = { report: report(plan, db), logins };
      if (o.dryRun) throw new DryRun(r);
      return r;
    });
  } catch (e) {
    if (!(e instanceof DryRun)) throw e;
    out = e.out;
  } finally {
    for (const id of [...waiting]) if (!before.has(id)) waiting.delete(id);
  }
  return { report: out.report, konta: plan.osoby.map((p, i) => ({ nazwa: p.nazwa, login: out.logins[i]!, haslo: o.dryRun ? '' : hasla[i]! })) };
}
