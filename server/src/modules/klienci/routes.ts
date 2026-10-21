import { clientCreateSchema, clientUpdateSchema, siteCreateSchema, siteUpdateSchema } from '@etner/shared';
import type { Context, Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ZodType } from 'zod';
import type { AppDeps } from '../../app.js';
import { requireAdmin, requireUser } from '../../core/auth.js';
import { runOp } from '../../core/ops.js';
import { can } from '../../core/permissions.js';
import * as svc from './service.js';

const notFound = () => new HTTPException(404, { message: 'Nie znaleziono' });
async function body<T>(c: Context, schema: ZodType<T>): Promise<T> {
  const r = schema.safeParse(await c.req.json().catch(() => null));
  if (!r.success) throw new HTTPException(400, { message: r.error.issues[0]?.message ?? 'Błędne dane' });
  return r.data;
}

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
    const { result } = runOp(db, opId, me(c), () => svc.update(db, me(c), c.req.param('id'), d));
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
