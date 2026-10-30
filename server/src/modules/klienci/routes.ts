import { clientCreateSchema, clientMergeSchema, clientUpdateSchema, siteCreateSchema, siteUpdateSchema } from '@etner/shared';
import type { Context, Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppDeps } from '../../app.js';
import { body } from '../../core/body.js';
import { requireAdmin, requireUser } from '../../core/auth.js';
import { runOp } from '../../core/ops.js';
import { can } from '../../core/permissions.js';
import { clientRefs as leady } from '../leady/service.js';
import { clientRefs as zadania } from '../zadania/service.js';
import { clientRefs as zlecenia } from '../zlecenia/service.js';
import * as svc from './service.js';

const notFound = () => new HTTPException(404, { message: 'Nie znaleziono' });
export function routes(app: Hono, deps: AppDeps): void {
  const { db } = deps;
  const admin = requireAdmin(db);
  const me = (c: Context) => c.get('user').id;

  app.get('/api/clients', admin, (c) => c.json(svc.search(db, c.req.query('q') ?? '')));

  app.get('/api/clients/:id', requireUser(db), (c) => {
    const id = c.req.param('id');
    if (!can(c.get('user'), 'admin')) {
      const w = deps.clientHasJobs?.(id) ? svc.forWorker(db, id) : undefined;
      if (!w) throw notFound();
      return c.json(w);
    }
    const client = svc.get(db, id);
    if (!client) throw notFound();
    return c.json({ client, sites: svc.listSites(db, id) });
  });

  app.post('/api/clients', admin, async (c) => {
    const { opId, ...d } = await body(c, clientCreateSchema);
    return c.json(runOp(db, opId, me(c), () => svc.create(db, me(c), d)).result);
  });

  app.put('/api/clients/:id', admin, async (c) => {
    const { opId, ...d } = await body(c, clientUpdateSchema);
    const old = svc.get(db, c.req.param('id'));
    const { result } = runOp(db, opId, me(c), () => svc.update(db, me(c), c.req.param('id'), d));
    if (!result) throw notFound();
    // ostrzeżenie (nie blokada), jak przy zakładaniu; tylko gdy telefony lub e-maile naprawdę się zmieniły
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    const contact = !old || !same(old.telefony, result.telefony) || !same(old.emaile, result.emaile);
    return c.json({ ...result, duplicates: contact ? svc.findDuplicates(db, result, result.id) : [] });
  });

  // R58: tylko admin; wszystkie tabele z client_id (zlecenia, leady z kontaktami, zadania; obiekty w samym klienci.merge)
  app.post('/api/clients/:id/merge', admin, async (c) => {
    const { opId, from } = await body(c, clientMergeSchema);
    const { result } = runOp(db, opId, me(c), () => svc.merge(db, me(c), c.req.param('id'), from, [zlecenia, leady, zadania]));
    if (!result) throw notFound();
    return c.json(result);
  });

  app.post('/api/clients/:id/sites', admin, async (c) => {
    const { opId, ...d } = await body(c, siteCreateSchema);
    const { result } = runOp(db, opId, me(c), () => svc.addSite(db, me(c), c.req.param('id'), d));
    if (!result) throw notFound();
    return c.json(result);
  });

  app.put('/api/sites/:id', admin, async (c) => {
    const { opId, ...d } = await body(c, siteUpdateSchema);
    const { result } = runOp(db, opId, me(c), () => svc.updateSite(db, me(c), c.req.param('id'), d));
    if (!result) throw notFound();
    return c.json(result);
  });
}
