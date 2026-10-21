import { dayOf, taskCreateSchema, taskUpdateSchema } from '@etner/shared';
import type { Context, Hono, MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppDeps } from '../../app.js';
import { requireUser } from '../../core/auth.js';
import { body } from '../../core/body.js';
import { runOp } from '../../core/ops.js';
import { can } from '../../core/permissions.js';
import * as svc from './service.js';

export function routes(app: Hono, deps: AppDeps): void {
  const { db } = deps;
  const auth = requireUser(db);
  const guard: MiddlewareHandler = (c, next) =>
    auth(c, async () => {
      if (!can(c.get('user'), 'zadania')) { c.res = c.json({ error: 'BRAK_UPRAWNIEN' }, 403); return; }
      await next();
    });
  const uid = (c: Context): string => c.get('user').id;
  const today = () => dayOf((deps.now ?? (() => new Date()))());
  const notFound = () => new HTTPException(404, { message: 'Nie znaleziono' });

  app.get('/api/tasks', guard, (c) => c.json(svc.list(db)));

  const write = async (c: Context, input: { opId?: string } & Record<string, any>, id?: string) => {
    const { opId, ...d } = input;
    const { result } = runOp(db, opId, uid(c), () => svc.save(db, uid(c), { ...d, id }, today()));
    if (!result) throw notFound();
    return c.json(result);
  };
  app.post('/api/tasks', guard, async (c) => write(c, await body(c, taskCreateSchema)));
  app.put('/api/tasks/:id', guard, async (c) => write(c, await body(c, taskUpdateSchema), c.req.param('id')));
  app.delete('/api/tasks/:id', guard, (c) => {
    if (!svc.remove(db, uid(c), c.req.param('id'))) throw notFound();
    return c.json({ ok: true });
  });
}
