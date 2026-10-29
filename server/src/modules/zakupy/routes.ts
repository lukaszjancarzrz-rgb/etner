import { shoppingCreateSchema, shoppingUpdateSchema } from '@etner/shared';
import type { Context, Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppDeps } from '../../app.js';
import { requireUser } from '../../core/auth.js';
import { body } from '../../core/body.js';
import { logError } from '../../core/errors.js';
import { notify } from '../../core/notify.js';
import { runOp } from '../../core/ops.js';
import { can } from '../../core/permissions.js';
import * as users from '../uzytkownicy/service.js';
import * as svc from './service.js';

const forbidden = () => new HTTPException(403, { message: 'BRAK_UPRAWNIEN' });
const notFound = () => new HTTPException(404, { message: 'Nie znaleziono' });

export function routes(app: Hono, deps: AppDeps): void {
  const { db } = deps;
  const auth = requireUser(db);
  const me = (c: Context) => c.get('user');
  const push = (c: Context, ids: string[], n: Parameters<typeof notify>[2]) =>
    notify(deps, ids, n).catch((e) => logError(db, 'push', e, me(c).id));

  app.get('/api/shopping', auth, (c) => c.json(svc.list(db)));

  app.post('/api/shopping', auth, async (c) => {
    const { opId, ...d } = await body(c, shoppingCreateSchema);
    const { result, dup } = runOp(db, opId, me(c).id, () => svc.create(db, me(c).id, d));
    if (!dup) void push(c, users.admins(db).filter((id) => id !== me(c).id), { title: `🛒 Do kupienia: ${d.co}`, body: d.uwagi, url: `#zakupy~${result.id}`, tag: `zakupy-${result.id}` });
    return c.json(result);
  });

  app.put('/api/shopping/:id', auth, async (c) => {
    const { opId, ...d } = await body(c, shoppingUpdateSchema);
    const old = svc.get(db, c.req.param('id'));
    if (!old) throw notFound();
    const admin = can(me(c), 'admin');
    if (!admin && (d.status !== undefined || old.by !== me(c).id)) throw forbidden();
    const { result, dup } = runOp(db, opId, me(c).id, () => svc.update(db, me(c).id, old.id, d));
    if (!result) throw notFound();
    if (!dup && result.status === 'Kupione' && old.status !== 'Kupione' && old.by !== me(c).id) {
      void push(c, [old.by], { title: `🛒 Kupione: ${result.co}`, body: '', url: `#zakupy~${result.id}`, tag: `zakupy-${result.id}` });
    }
    return c.json(result);
  });

  app.delete('/api/shopping/:id', auth, (c) => {
    const r = svc.get(db, c.req.param('id'));
    if (!r && svc.removed(db, c.req.param('id'))) return c.json({ ok: true }); // już usunięte: powtórka po przekroczeniu czasu
    if (!r) throw notFound();
    if (r.by !== me(c).id && !can(me(c), 'admin')) throw forbidden();
    svc.remove(db, me(c).id, r.id);
    return c.json({ ok: true });
  });
}
