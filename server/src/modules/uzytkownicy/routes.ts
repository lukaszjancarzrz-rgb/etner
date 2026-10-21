import { schedulePersonSchema, schedulePersonUpdateSchema, userCreateSchema, userUpdateSchema } from '@etner/shared';
import type { Context, Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppDeps } from '../../app.js';
import { body } from '../../core/body.js';
import { requireAdmin, requireUser } from '../../core/auth.js';
import { runOp } from '../../core/ops.js';
import * as svc from './service.js';

const bad = (message: string) => new HTTPException(400, { message });
const notFound = () => new HTTPException(404, { message: 'Nie znaleziono' });
/** Link logowania: BASE_URL, na Render RENDER_EXTERNAL_URL, a bez nich adres, z którego przyszło zapytanie. */
const linkOf = (c: Context, token: string) => `${process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || new URL(c.req.url).origin}/login#${token}`;

export function routes(app: Hono, { db }: AppDeps): void {
  const admin = requireAdmin(db);
  const me = (c: Context) => c.get('user').id;

  app.get('/api/users', admin, (c) => c.json(svc.list(db)));

  app.post('/api/users', admin, async (c) => {
    const d = await body(c, userCreateSchema);
    let token: string | undefined;
    // Token zostaje poza runOp: op_ids trzyma tylko {user}, powtórka nie dostaje linku.
    const { result } = runOp(db, d.opId, me(c), () => {
      const r = svc.create(db, me(c), d);
      token = r.token;
      return { user: r.user };
    });
    return c.json({ user: result.user, link: token ? linkOf(c, token) : null });
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
    let token: string | undefined;
    const { result } = runOp(db, typeof opId === 'string' ? opId : undefined, me(c), () => {
      const r = svc.newLink(db, me(c), c.req.param('id'));
      token = r?.token;
      return r && { user: r.user };
    });
    if (!result) throw notFound();
    return c.json({ user: result.user, link: token ? linkOf(c, token) : null });
  });

  app.get('/api/schedule-people', requireUser(db), (c) => c.json(svc.listPeople(db)));

  const checkUser = (id?: string | null) => {
    if (id && !svc.get(db, id)) throw bad('Nie ma takiego użytkownika');
  };

  app.post('/api/schedule-people', admin, async (c) => {
    const { opId, ...d } = await body(c, schedulePersonSchema);
    checkUser(d.userId);
    return c.json(runOp(db, opId, me(c), () => svc.createPerson(db, me(c), d)).result);
  });

  app.put('/api/schedule-people/:id', admin, async (c) => {
    const { opId, ...d } = await body(c, schedulePersonUpdateSchema);
    checkUser(d.userId);
    const { result } = runOp(db, opId, me(c), () => svc.updatePerson(db, me(c), c.req.param('id'), d));
    if (!result) throw notFound();
    return c.json(result);
  });

  app.delete('/api/schedule-people/:id', admin, (c) => {
    if (!svc.deletePerson(db, me(c), c.req.param('id'))) throw notFound();
    return c.json({ ok: true });
  });
}
