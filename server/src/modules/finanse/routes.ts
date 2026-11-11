import { costCreateSchema, costUpdateSchema, kpirFileSchema, kpirMonthSchema, revenueCreateSchema, revenueUpdateSchema, SPOSOBY } from '@etner/shared';
import type { Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { count, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { AppDeps } from '../../app.js';
import { requireAdmin } from '../../core/auth.js';
import { body } from '../../core/body.js';
import { tx } from '../../core/db.js';
import { runOp } from '../../core/ops.js';
import { applyFinanse, readFinanse, znaneKategorieKosztu, type XlsImportResult } from './import-xlsx.js';
import { costs, revenues } from './schema.js';
import * as svc from './service.js';

const XLSX_MAX = 10 * 1024 * 1024;

const settingsSchema = z.object({ autoPrzychod: z.boolean(), domyslnySposob: z.enum(SPOSOBY), stawkaOsobodniaGr: z.number().int().min(0).max(10_000_000).optional() });
class Rollback { constructor(readonly result: svc.KpirImportResult | XlsImportResult) {} }

export function routes(app: Hono, deps: AppDeps): void {
  const { db } = deps;
  const admin = requireAdmin(db);
  const me = (c: Context) => c.get('user');

  app.get('/api/revenues', admin, (c) => c.json(svc.listRevenues(db)));
  app.post('/api/revenues', admin, async (c) => {
    const { opId, ...d } = await body(c, revenueCreateSchema);
    return c.json(runOp(db, opId, me(c).id, () => svc.createRevenue(db, me(c).id, d)).result);
  });
  app.put('/api/revenues/:id', admin, async (c) => {
    const { opId, ...d } = await body(c, revenueUpdateSchema);
    const { result } = runOp(db, opId, me(c).id, () => svc.updateRevenue(db, me(c).id, c.req.param('id'), d));
    if (!result) throw svc.notFound();
    return c.json(result);
  });
  app.delete('/api/revenues/:id', admin, (c) => {
    const id = c.req.param('id');
    if (!svc.getRevenue(db, id)) {
      if (svc.revenueRemoved(db, id)) return c.json({ ok: true });
      throw svc.notFound();
    }
    svc.removeRevenue(db, me(c).id, id);
    return c.json({ ok: true });
  });

  app.get('/api/costs', admin, (c) => c.json(svc.listCosts(db)));
  app.post('/api/costs', admin, async (c) => {
    const { opId, ...d } = await body(c, costCreateSchema);
    return c.json(runOp(db, opId, me(c).id, () => svc.createCost(db, me(c).id, d)).result);
  });
  // Import z KPiR: bez ?naprawde=1 próba (zapis wycofany w transakcji).
  app.post('/api/costs/kpir-import', admin, async (c) => {
    const f = await body(c, kpirFileSchema);
    const naprawde = c.req.query('naprawde') === '1';
    try {
      const result = tx(db, () => {
        const r = svc.importKpir(db, me(c).id, f);
        if (!naprawde) throw new Rollback(r);
        return r;
      });
      return c.json(result);
    } catch (e) {
      if (e instanceof Rollback) return c.json(e.result);
      throw e;
    }
  });
  app.put('/api/costs/:id', admin, async (c) => {
    const { opId, ...d } = await body(c, costUpdateSchema);
    const { result } = runOp(db, opId, me(c).id, () => svc.updateCost(db, me(c).id, c.req.param('id'), d));
    if (!result) throw svc.notFound();
    return c.json(result);
  });
  app.delete('/api/costs/:id', admin, (c) => {
    const id = c.req.param('id');
    if (!svc.getCost(db, id)) {
      if (svc.costRemoved(db, id)) return c.json({ ok: true });
      throw svc.notFound();
    }
    svc.removeCost(db, me(c).id, id);
    return c.json({ ok: true });
  });

  app.get('/api/kpir', admin, (c) => c.json(svc.listKpir(db)));
  app.put('/api/kpir/:miesiac', admin, async (c) => {
    const miesiac = c.req.param('miesiac');
    if (!/^\d{4}-\d{2}$/.test(miesiac)) throw svc.notFound();
    const { opId, ...d } = await body(c, kpirMonthSchema);
    return c.json(runOp(db, opId, me(c).id, () => svc.setKpirMonth(db, me(c).id, miesiac, d)).result);
  });

  // Jednorazowe przeniesienie z arkusza (tylko gdy brak nieusuniętych przychodów i kosztów); bez ?naprawde=1 próba (zapis wycofany w transakcji).
  const limit = bodyLimit({ maxSize: XLSX_MAX + 64 * 1024, onError: (c) => c.json({ error: 'Plik jest za duży (max 10 MB).' }, 413) });
  app.post('/api/finanse/import-xlsx', admin, limit, async (c) => {
    // usunięte wiersze nie blokują: kilka wpisów dodanych za wcześnie wystarczy usunąć
    const niepuste = () => db.select({ n: count() }).from(revenues).where(isNull(revenues.deletedAt)).get()!.n + db.select({ n: count() }).from(costs).where(isNull(costs.deletedAt)).get()!.n > 0;
    const zajete = () => new HTTPException(409, { message: 'Finanse mają już dane – przeniesienie tylko do pustych tabel' });
    if (niepuste()) throw zajete();
    const f = ((await c.req.parseBody().catch(() => ({}))) as Record<string, unknown>)['plik'];
    if (!(f instanceof File)) throw new HTTPException(400, { message: 'Brak pliku' });
    if (f.size > XLSX_MAX) throw new HTTPException(413, { message: 'Plik jest za duży (max 10 MB).' });
    const buf = Buffer.from(await f.arrayBuffer());
    if (!buf.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) throw new HTTPException(415, { message: 'To nie jest plik .xlsx.' });
    let data;
    try { data = await readFinanse(buf, znaneKategorieKosztu(db)); } catch (e) {
      throw new HTTPException(422, { message: `${e instanceof Error && /^(Brak karty|Nie ustalono)/.test(e.message) ? e.message : 'Nie udało się odczytać arkusza'}. Wgraj arkusz firmy (.xlsx).` });
    }
    const naprawde = c.req.query('naprawde') === '1';
    try {
      const result = tx(db, () => {
        if (niepuste()) throw zajete(); // wyścig dwóch importów
        const r = applyFinanse(db, me(c).id, data);
        if (!naprawde) throw new Rollback(r);
        return r;
      });
      return c.json(result);
    } catch (e) {
      if (e instanceof Rollback) return c.json(e.result);
      throw e;
    }
  });

  app.get('/api/finanse/place', admin, (c) => c.json(svc.getPlace(db)));
  app.put('/api/finanse/place/:miesiac', admin, async (c) => {
    const m = c.req.param('miesiac');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) throw new HTTPException(400, { message: 'Zły miesiąc (RRRR-MM)' });
    const { kwotaGr } = await body(c, z.object({ kwotaGr: z.number().int().min(0).nullable() }));
    return c.json(svc.setPlace(db, m, kwotaGr));
  });
  app.get('/api/settings/finanse', admin, (c) => c.json(svc.getSettings(db)));
  app.put('/api/settings/finanse', admin, async (c) => c.json(svc.setSettings(db, await body(c, settingsSchema))));
}
