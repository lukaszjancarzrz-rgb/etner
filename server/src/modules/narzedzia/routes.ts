import { toolCreateSchema, toolUpdateSchema } from '@etner/shared';
import type { Context, Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppDeps } from '../../app.js';
import { requireUser } from '../../core/auth.js';
import { body } from '../../core/body.js';
import { runOp } from '../../core/ops.js';
import { can } from '../../core/permissions.js';
import * as svc from './service.js';

const notFound = () => new HTTPException(404, { message: 'Nie znaleziono' });

/** Dodaje, edytuje i przenosi każdy; usuwa admin i autor (R40). */
export function routes(app: Hono, { db }: AppDeps): void {
  const auth = requireUser(db);
  const me = (c: Context) => c.get('user');

  app.get('/api/tools', auth, (c) => c.json(svc.list(db)));
  app.post('/api/tools', auth, async (c) => {
    const { opId, ...d } = await body(c, toolCreateSchema);
    return c.json(runOp(db, opId, me(c).id, () => svc.create(db, me(c).id, d)).result);
  });
  app.put('/api/tools/:id', auth, async (c) => {
    const { opId, ...d } = await body(c, toolUpdateSchema);
    const { result } = runOp(db, opId, me(c).id, () => svc.update(db, me(c).id, c.req.param('id'), d));
    if (!result) throw notFound();
    return c.json(result);
  });
  app.delete('/api/tools/:id', auth, (c) => {
    const r = svc.get(db, c.req.param('id'));
    if (!r && svc.removed(db, c.req.param('id'))) return c.json({ ok: true }); // powtórka z kolejki
    if (!r) throw notFound();
    if (r.by !== me(c).id && !can(me(c), 'admin')) throw new HTTPException(403, { message: 'BRAK_UPRAWNIEN' });
    svc.remove(db, me(c).id, r.id);
    return c.json({ ok: true });
  });
}
