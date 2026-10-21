import { schedulePersonSchema, schedulePersonUpdateSchema, userCreateSchema, userUpdateSchema } from '@etner/shared';
import type { Context, Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ZodType } from 'zod';
import type { AppDeps } from '../../app.js';
import { requireAdmin, requireUser } from '../../core/auth.js';
import { runOp } from '../../core/ops.js';
import * as svc from './service.js';

const bad = (message: string) => new HTTPException(400, { message });
const notFound = () => new HTTPException(404, { message: 'Nie znaleziono' });
async function body<T>(c: Context, schema: ZodType<T>): Promise<T> {
  const r = schema.safeParse(await c.req.json().catch(() => null));
  if (!r.success) throw bad(r.error.issues[0]?.message ?? 'Błędne dane');
  return r.data;
}
/** Link logowania: BASE_URL, a bez niego adres, z którego przyszło zapytanie. */
const linkOf = (c: Context, token: string) => `${process.env.BASE_URL || new URL(c.req.url).origin}/login#${token}`;

export function routes(app: Hono, { db }: AppDeps): void {
  const admin = requireAdmin(db);
  const me = (c: Context) => c.get('user').id;

  app.get('/api/users', admin, (c) => c.json(svc.list(db)));

  app.post('/api/users', admin, async (c) => {
    const d = await body(c, userCreateSchema);
    const { result } = runOp(db, d.opId, me(c), () => {
      const r = svc.create(db, me(c), d);
      return { user: r.user, link: linkOf(c, r.token) };
    });
    return c.json(result);
  });

  app.put('/api/users/:id', admin, async (c) => {
    const id = c.req.param('id');
    const d = await body(c, userUpdateSchema);
    if (id === me(c) && d.role && d.role !== 'admin') throw bad('Nie możesz odebrać sobie roli administratora.');
    if (id === me(c) && d.active === false) throw bad('Nie możesz wyłączyć własnego konta.');
    const { opId, ...rest } = d;
    const { result } = runOp(db, opId, me(c), () => svc.update(db, me(c), id, rest));
    if (!result) throw notFound();
    return c.json(result);
  });

  app.post('/api/users/:id/new-link', admin, async (c) => {
    const { opId } = await c.req.json().catch(() => ({}));
    const { result } = runOp(db, typeof opId === 'string' ? opId : undefined, me(c), () => {
      const r = svc.newLink(db, me(c), c.req.param('id'));
      return r && { user: r.user, link: linkOf(c, r.token) };
    });
    if (!result) throw notFound();
    return c.json(result);
  });

  app.get('/api/schedule-people', requireUser(db), (c) => c.json(svc.listPeople(db)));

  app.post('/api/schedule-people', admin, async (c) => {
    const { opId, ...d } = await body(c, schedulePersonSchema);
    return c.json(runOp(db, opId, me(c), () => svc.createPerson(db, me(c), d)).result);
  });

  app.put('/api/schedule-people/:id', admin, async (c) => {
    const { opId, ...d } = await body(c, schedulePersonUpdateSchema);
    const { result } = runOp(db, opId, me(c), () => svc.updatePerson(db, me(c), c.req.param('id'), d));
    if (!result) throw notFound();
    return c.json(result);
  });

  app.delete('/api/schedule-people/:id', admin, (c) => {
    if (!svc.deletePerson(db, me(c), c.req.param('id'))) throw notFound();
    return c.json({ ok: true });
  });
}
