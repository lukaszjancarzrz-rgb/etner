import { parametryMapSchema, payrollEntryCreateSchema, payrollEntryUpdateSchema, payrollMonthSchema, payrollPersonSchema, payrollRateCreateSchema, payrollRateUpdateSchema } from '@etner/shared';
import type { Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { count, isNull } from 'drizzle-orm';
import type { AppDeps } from '../../app.js';
import { requireAdmin } from '../../core/auth.js';
import { body } from '../../core/body.js';
import { tx } from '../../core/db.js';
import { runOp } from '../../core/ops.js';
import { applyPlace, readPlace, type XlsImportResult } from './import-xlsx.js';
import { payrollEntries, payrollMonths, payrollPeople, payrollRates } from './schema.js';
import * as svc from './service.js';

const XLSX_MAX = 10 * 1024 * 1024;
class Rollback { constructor(readonly result: XlsImportResult) {} }

export function routes(app: Hono, deps: AppDeps): void {
  const { db } = deps;
  const admin = requireAdmin(db);
  const me = (c: Context) => c.get('user');

  app.put('/api/payroll/people/:personId', admin, async (c) => {
    const personId = c.req.param('personId');
    if (!svc.personExists(db, personId)) throw svc.notFound();
    const { opId, ...d } = await body(c, payrollPersonSchema);
    return c.json(runOp(db, opId, me(c).id, () => svc.setPerson(db, me(c).id, personId, d)).result);
  });

  app.post('/api/payroll/rates', admin, async (c) => {
    const { opId, ...d } = await body(c, payrollRateCreateSchema);
    return c.json(runOp(db, opId, me(c).id, () => svc.createRate(db, me(c).id, d)).result);
  });
  app.put('/api/payroll/rates/:id', admin, async (c) => {
    const { opId, ...d } = await body(c, payrollRateUpdateSchema);
    const { result } = runOp(db, opId, me(c).id, () => svc.updateRate(db, me(c).id, c.req.param('id'), d));
    if (!result) throw svc.notFound();
    return c.json(result);
  });
  app.delete('/api/payroll/rates/:id', admin, (c) => { svc.removeRate(db, me(c).id, c.req.param('id')); return c.json({ ok: true }); });

  app.put('/api/payroll/months/:personId/:miesiac', admin, async (c) => {
    const { personId, miesiac } = c.req.param();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(miesiac)) throw new HTTPException(400, { message: 'Zły miesiąc (RRRR-MM)' });
    if (!svc.personExists(db, personId)) throw svc.notFound();
    const { opId, ...d } = await body(c, payrollMonthSchema);
    return c.json(runOp(db, opId, me(c).id, () => svc.setMonth(db, me(c).id, personId, miesiac, d)).result);
  });

  app.post('/api/payroll/entries', admin, async (c) => {
    const { opId, ...d } = await body(c, payrollEntryCreateSchema);
    return c.json(runOp(db, opId, me(c).id, () => svc.createEntry(db, me(c).id, d)).result);
  });
  app.put('/api/payroll/entries/:id', admin, async (c) => {
    const { opId, ...d } = await body(c, payrollEntryUpdateSchema);
    const { result } = runOp(db, opId, me(c).id, () => svc.updateEntry(db, me(c).id, c.req.param('id'), d));
    if (!result) throw svc.notFound();
    return c.json(result);
  });
  app.delete('/api/payroll/entries/:id', admin, (c) => { svc.removeEntry(db, me(c).id, c.req.param('id')); return c.json({ ok: true }); });

  app.get('/api/settings/place', admin, (c) => c.json(svc.getParametry(db)));
  // scalanie z zapisanymi latami: jedna karta w Ustawieniach wysyła tylko swój rok
  app.put('/api/settings/place', admin, async (c) => c.json(svc.setParametry(db, { ...svc.getParametry(db), ...(await body(c, parametryMapSchema)) })));

  // Jednorazowe przeniesienie z arkusza (tylko gdy brak nieusuniętych wierszy Płac); bez ?naprawde=1 próba (zapis wycofany w transakcji).
  const limit = bodyLimit({ maxSize: XLSX_MAX + 64 * 1024, onError: (c) => c.json({ error: 'Plik jest za duży (max 10 MB).' }, 413) });
  app.post('/api/payroll/import-xlsx', admin, limit, async (c) => {
    const niepuste = () => [payrollPeople, payrollRates, payrollMonths, payrollEntries].some((t) => db.select({ n: count() }).from(t).where(isNull(t.deletedAt)).get()!.n > 0);
    const zajete = () => new HTTPException(409, { message: 'Płace mają już dane – przeniesienie tylko do pustych tabel' });
    if (niepuste()) throw zajete();
    const f = ((await c.req.parseBody().catch(() => ({}))) as Record<string, unknown>)['plik'];
    if (!(f instanceof File)) throw new HTTPException(400, { message: 'Brak pliku' });
    if (f.size > XLSX_MAX) throw new HTTPException(413, { message: 'Plik jest za duży (max 10 MB).' });
    const buf = Buffer.from(await f.arrayBuffer());
    if (!buf.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) throw new HTTPException(415, { message: 'To nie jest plik .xlsx.' });
    let data;
    try { data = await readPlace(buf); } catch (e) {
      throw new HTTPException(422, { message: `${e instanceof Error && /^(Brak karty|Nie ustalono)/.test(e.message) ? e.message : 'Nie udało się odczytać arkusza'}. Wgraj arkusz firmy (.xlsx).` });
    }
    const naprawde = c.req.query('naprawde') === '1';
    try {
      const result = tx(db, () => {
        if (niepuste()) throw zajete(); // wyścig dwóch importów
        const r = applyPlace(db, me(c).id, data);
        if (!naprawde) throw new Rollback(r);
        return r;
      });
      return c.json(result);
    } catch (e) {
      if (e instanceof Rollback) return c.json(e.result);
      throw e;
    }
  });
}
