import { jobCreateSchema, jobUpdateSchema, pumbleSendSchema, scopeCreateSchema, scopeOrderSchema, scopeUpdateSchema } from '@etner/shared';
import type { Context, Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppDeps } from '../../app.js';
import { body } from '../../core/body.js';
import { requireAdmin, requireUser } from '../../core/auth.js';
import { logError } from '../../core/errors.js';
import { notify } from '../../core/notify.js';
import { runOp } from '../../core/ops.js';
import { can } from '../../core/permissions.js';
import { PumbleError } from '../../core/pumble.js';
import * as pumble from './pumble.js';
import * as scope from './scope.js';
import * as users from '../uzytkownicy/service.js';
import * as svc from './service.js';

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
    const prev = id ? svc.get(db, id) : undefined;
    const { result, dup } = runOp(db, opId, uid, () => svc.save(db, uid, { ...d, id }, out));
    if (!result) throw new HTTPException(404, { message: 'Nie znaleziono' });
    // Po commit; błąd wysyłki nie może zamienić zapisanego zlecenia w 500.
    if (!dup) for (const o of out) await notify(deps, o.userIds, o.n).catch((e) => logError(db, 'push', e, uid));
    // Pumble po odpowiedzi (zapis nie czeka); id kanału dociera zmianą zlecenia
    if (!dup && !id) pumble.later(deps, 'pumble:kanal', () => pumble.ensureChannel(deps, result.id));
    else if (!dup && prev && prev.ekipa !== result.ekipa && result.ekipa && result.ekipa !== 'mieszane') pumble.addPeopleLater(deps, result.id, users.crewMembers(db, result.ekipa));
    return c.json(result);
  };
  app.post('/api/jobs', admin, async (c) => write(c, await body(c, jobCreateSchema)));
  app.put('/api/jobs/:id', admin, async (c) => write(c, await body(c, jobUpdateSchema), c.req.param('id')));

  // Zakres prac: zapisuje tylko admin, widzą wszyscy (przez synchronizację).
  const nf = <T>(r: T | undefined): T => { if (!r) throw new HTTPException(404, { message: 'Nie znaleziono' }); return r; };
  const op = <T>(c: Context, opId: string | undefined, fn: () => T) => runOp(db, opId, c.get('user').id, fn).result;
  app.post('/api/jobs/:id/scope', admin, async (c) => {
    const { opId, ...d } = await body(c, scopeCreateSchema);
    return c.json(nf(op(c, opId, () => scope.create(db, c.get('user').id, c.req.param('id'), d))));
  });
  app.post('/api/jobs/:id/scope/order', admin, async (c) => {
    const { opId, ids } = await body(c, scopeOrderSchema);
    return c.json(nf(op(c, opId, () => scope.reorder(db, c.get('user').id, c.req.param('id'), ids))));
  });
  app.put('/api/scope/:id', admin, async (c) => {
    const { opId, ...d } = await body(c, scopeUpdateSchema);
    return c.json(nf(op(c, opId, () => scope.update(db, c.get('user').id, c.req.param('id'), d))));
  });
  app.delete('/api/scope/:id', admin, (c) => {
    const id = c.req.param('id');
    if (!scope.remove(db, c.get('user').id, id) && !scope.removed(db, id)) nf(undefined); // już usunięty: 200 (powtórka z kolejki)
    return c.json({ ok: true });
  });

  // Pumble (zadanie 18g): bez klucza tylko status, reszta tras nie istnieje.
  app.get('/api/pumble/status', requireUser(db), (c) => c.json({ enabled: !!deps.pumble }));
  if (!deps.pumble) return;
  const pumbleFail = (e: unknown, c: Context) => {
    if (!(e instanceof PumbleError)) throw e;
    logError(db, `${c.req.method} ${c.req.path}`, e, c.get('user').id);
    return c.json({ error: 'PUMBLE' }, 502);
  };
  app.post('/api/jobs/:id/pumble', requireUser(db), async (c) => {
    const { opId, text } = await body(c, pumbleSendSchema);
    try {
      return c.json(await pumble.send(deps, c.get('user'), c.req.param('id'), text, opId));
    } catch (e) { return pumbleFail(e, c); }
  });
  app.post('/api/jobs/:id/pumble/watch', requireUser(db), (c) => {
    const id = c.req.param('id');
    if (!svc.get(db, id)) throw new HTTPException(404, { message: 'Nie znaleziono' });
    pumble.watch(deps, id);
    return c.json({ ok: true });
  });
  app.post('/api/jobs/:id/pumble/channel', admin, async (c) => {
    try {
      return c.json(view(c, nf(await pumble.ensureChannel(deps, c.req.param('id'), true))));
    } catch (e) { return pumbleFail(e, c); }
  });
  app.get('/api/pumble/link/:jobId', requireUser(db), async (c) => c.json({ url: await pumble.link(deps, c.req.param('jobId')) }));
}
