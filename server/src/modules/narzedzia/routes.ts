import { toolCreateSchema, toolUpdateSchema } from '@etner/shared';
import type { Context, Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppDeps } from '../../app.js';
import { requireAdmin, requireUser } from '../../core/auth.js';
import { body } from '../../core/body.js';
import { runOp } from '../../core/ops.js';
import * as svc from './service.js';

const notFound = () => new HTTPException(404, { message: 'Nie znaleziono' });

/** Czyta każdy; dodaje, edytuje, przenosi i usuwa tylko admin (R43). */
export function routes(app: Hono, { db }: AppDeps): void {
  const auth = requireUser(db);
  const admin = requireAdmin(db);
  const me = (c: Context) => c.get('user');

  app.get('/api/tools', auth, (c) => c.json(svc.list(db)));
  app.post('/api/tools', admin, async (c) => {
    const { opId, ...d } = await body(c, toolCreateSchema);
    return c.json(runOp(db, opId, me(c).id, () => svc.create(db, me(c).id, d)).result);
  });
  app.put('/api/tools/:id', admin, async (c) => {
    const { opId, ...d } = await body(c, toolUpdateSchema);
    const { result } = runOp(db, opId, me(c).id, () => svc.update(db, me(c).id, c.req.param('id'), d));
    if (!result) throw notFound();
    return c.json(result);
  });
  app.delete('/api/tools/:id', admin, (c) => {
    const r = svc.get(db, c.req.param('id'));
    if (!r && svc.removed(db, c.req.param('id'))) return c.json({ ok: true }); // powtórka z kolejki
    if (!r) throw notFound();
    svc.remove(db, me(c).id, r.id);
    return c.json({ ok: true });
  });
}
