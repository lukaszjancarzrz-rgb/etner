import { costCreateSchema, costUpdateSchema, kpirFileSchema, kpirMonthSchema, revenueCreateSchema, revenueUpdateSchema, SPOSOBY } from '@etner/shared';
import type { Context, Hono } from 'hono';
import { z } from 'zod';
import type { AppDeps } from '../../app.js';
import { requireAdmin } from '../../core/auth.js';
import { body } from '../../core/body.js';
import { tx } from '../../core/db.js';
import { runOp } from '../../core/ops.js';
import * as svc from './service.js';

const settingsSchema = z.object({ autoPrzychod: z.boolean(), domyslnySposob: z.enum(SPOSOBY) });
class Rollback { constructor(readonly result: svc.KpirImportResult) {} }

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

  app.get('/api/settings/finanse', admin, (c) => c.json(svc.getSettings(db)));
  app.put('/api/settings/finanse', admin, async (c) => c.json(svc.setSettings(db, await body(c, settingsSchema))));
}
