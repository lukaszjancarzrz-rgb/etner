import { itemCreateSchema, itemReturnSchema, itemTakeSchema } from '@etner/shared';
import type { Context, Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppDeps } from '../../app.js';
import { requireUser } from '../../core/auth.js';
import { body } from '../../core/body.js';
import { runOp } from '../../core/ops.js';
import { can } from '../../core/permissions.js';
import * as svc from './service.js';

const notFound = () => new HTTPException(404, { message: 'Nie znaleziono' });

/** Dodaje, zabiera i zwraca każdy; usuwa admin i autor (R40). */
export function routes(app: Hono, deps: AppDeps): void {
  const { db } = deps;
  const auth = requireUser(db);
  const me = (c: Context) => c.get('user');
  const now = () => (deps.now ?? (() => new Date()))();
  const item = (c: Context) => { const r = svc.get(db, c.req.param('id')!); if (!r) throw notFound(); return r; };

  app.get('/api/warehouse', auth, (c) => c.json(svc.list(db)));
  app.post('/api/warehouse', auth, async (c) => {
    const { opId, ...d } = await body(c, itemCreateSchema);
    return c.json(runOp(db, opId, me(c).id, () => svc.create(db, me(c).id, d)).result);
  });
  app.post('/api/warehouse/:id/take', auth, async (c) => {
    const { opId } = await body(c, itemTakeSchema);
    return c.json(runOp(db, opId, me(c).id, () => svc.take(db, me(c).id, item(c), now())).result);
  });
  app.post('/api/warehouse/:id/return', auth, async (c) => {
    const { opId, ilosc } = await body(c, itemReturnSchema);
    return c.json(runOp(db, opId, me(c).id, () => svc.giveBack(db, me(c).id, item(c), ilosc)).result);
  });
  app.delete('/api/warehouse/:id', auth, (c) => {
    const r = svc.get(db, c.req.param('id'));
    if (!r && svc.removed(db, c.req.param('id'))) return c.json({ ok: true }); // powtórka z kolejki
    if (!r) throw notFound();
    if (r.by !== me(c).id && !can(me(c), 'admin')) throw new HTTPException(403, { message: 'BRAK_UPRAWNIEN' });
    svc.remove(db, me(c).id, r);
    return c.json({ ok: true });
  });
}
