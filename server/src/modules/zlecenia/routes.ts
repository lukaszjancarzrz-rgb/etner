import { jobCreateSchema, jobUpdateSchema } from '@etner/shared';
import type { Context, Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ZodType } from 'zod';
import type { AppDeps } from '../../app.js';
import { requireAdmin, requireUser } from '../../core/auth.js';
import { logError } from '../../core/errors.js';
import { notify } from '../../core/notify.js';
import { runOp } from '../../core/ops.js';
import { can } from '../../core/permissions.js';
import * as svc from './service.js';

async function body<T>(c: Context, schema: ZodType<T>): Promise<T> {
  const r = schema.safeParse(await c.req.json().catch(() => null));
  if (!r.success) throw new HTTPException(400, { message: r.error.issues[0]?.message ?? 'Błędne dane' });
  return r.data;
}

export function routes(app: Hono, deps: AppDeps): void {
  const { db } = deps;
  // Jedyne miejsce, gdzie zlecenia podają klientom regułę widoczności (testy mogą ją nadpisać).
  deps.clientHasJobs ??= (clientId) => svc.clientHasJobs(db, clientId);
  const admin = requireAdmin(db);
  const view = (c: Context, j: Record<string, any>) => (can(c.get('user'), 'admin') ? j : svc.forWorker(j));

  app.get('/api/jobs', requireUser(db), (c) => c.json(svc.list(db).map((j) => view(c, j))));
  app.get('/api/jobs/:id', requireUser(db), (c) => {
    const j = svc.get(db, c.req.param('id'));
    if (!j) throw new HTTPException(404, { message: 'Nie znaleziono' });
    return c.json(view(c, j));
  });

  const write = async (c: Context, input: Record<string, any> & { opId?: string }, id?: string) => {
    const { opId, ...d } = input;
    const uid = c.get('user').id;
    const out: svc.Outbox = [];
    const { result, dup } = runOp(db, opId, uid, () => svc.save(db, uid, { ...d, id }, out));
    if (!result) throw new HTTPException(404, { message: 'Nie znaleziono' });
    // Po commit; błąd wysyłki nie może zamienić zapisanego zlecenia w 500.
    if (!dup) for (const o of out) await notify(deps, o.userIds, o.n).catch((e) => logError(db, 'push', e, uid));
    return c.json(result);
  };
  app.post('/api/jobs', admin, async (c) => write(c, await body(c, jobCreateSchema)));
  app.put('/api/jobs/:id', admin, async (c) => write(c, await body(c, jobUpdateSchema), c.req.param('id')));
}
