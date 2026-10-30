import { scheduleApproveSchema, scheduleDiscardSchema, scheduleDraftSchema, scheduleRangeQuerySchema } from '@etner/shared';
import type { Context, Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppDeps } from '../../app.js';
import { requireUser } from '../../core/auth.js';
import { body } from '../../core/body.js';
import { logError } from '../../core/errors.js';
import { notify } from '../../core/notify.js';
import { runOp } from '../../core/ops.js';
import { can } from '../../core/permissions.js';
import { pumbleAddPeople, type Outbox } from '../zlecenia/service.js';
import * as svc from './service.js';

export function routes(app: Hono, deps: AppDeps): void {
  const { db } = deps;
  deps.schedule ??= { peopleForJob: (id) => svc.peopleForJob(db, id) };
  const auth = requireUser(db);
  const now = () => (deps.now ?? (() => new Date()))();
  const me = (c: Context) => c.get('user');
  const szkice = (c: Context) => { if (!can(me(c), 'szkice')) throw new HTTPException(403, { message: 'BRAK_UPRAWNIEN' }); };

  app.get('/api/schedule', auth, (c) => {
    const q = scheduleRangeQuerySchema.safeParse(c.req.query());
    if (!q.success) throw new HTTPException(400, { message: q.error.issues[0]?.message ?? 'Błędne dane' });
    return c.json(svc.range(db, q.data.from, q.data.to, can(me(c), 'szkice')));
  });
  app.get('/api/schedule/my-next', auth, (c) => c.json(svc.myNext(db, me(c).id, now())));
  app.get('/api/schedule/job/:id/days', auth, (c) => c.json(svc.jobDays(db, c.req.param('id'))));

  app.post('/api/schedule/drafts', auth, async (c) => {
    szkice(c);
    const { opId, ...d } = await body(c, scheduleDraftSchema);
    return c.json(runOp(db, opId, me(c).id, () => svc.setDraft(db, me(c).id, d)).result);
  });
  app.post('/api/schedule/approve', auth, async (c) => {
    szkice(c);
    const b = await body(c, scheduleApproveSchema);
    const out: Outbox = [];
    const touched = new Set<string>();
    const { result, dup } = runOp(db, b.opId, me(c).id, () => svc.approve(db, me(c).id, b.items, now(), out, touched));
    // Po commit; błąd wysyłki nie cofa zatwierdzenia.
    if (!dup) for (const o of out) void notify(deps, o.userIds, o.n).catch((e) => logError(db, 'push', e, me(c).id));
    // nowe osoby zlecenia → jego kanał Pumble, po odpowiedzi (już dodane są pomijane)
    if (!dup) for (const j of touched) pumbleAddPeople(deps, j, svc.peopleForJob(db, j));
    return c.json(result);
  });
  app.post('/api/schedule/discard', auth, async (c) => {
    szkice(c);
    const b = await body(c, scheduleDiscardSchema);
    return c.json({ removed: runOp(db, b.opId, me(c).id, () => svc.discard(db, me(c).id, b.keys)).result });
  });
}
