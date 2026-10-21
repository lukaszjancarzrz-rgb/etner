import { schedulePersonSchema, schedulePersonUpdateSchema, userCreateSchema, userPasswordSchema, userUpdateSchema } from '@etner/shared';
import type { Context, Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppDeps } from '../../app.js';
import { body } from '../../core/body.js';
import { requireAdmin, requireUser } from '../../core/auth.js';
import { runOp } from '../../core/ops.js';
import * as svc from './service.js';

const bad = (message: string) => new HTTPException(400, { message });
const notFound = () => new HTTPException(404, { message: 'Nie znaleziono' });
const taken = (e: unknown) => { throw e instanceof svc.LoginTakenError ? new HTTPException(409, { message: 'LOGIN_ZAJETY' }) : e; };

export function routes(app: Hono, { db }: AppDeps): void {
  const admin = requireAdmin(db);
  const me = (c: Context) => c.get('user').id;

  app.get('/api/users', admin, (c) => c.json(svc.list(db)));

  app.post('/api/users', admin, async (c) => {
    const { opId, ...d } = await body(c, userCreateSchema);
    try {
      return c.json({ user: runOp(db, opId, me(c), () => svc.create(db, me(c), d)).result });
    } catch (e) { return taken(e); }
  });

  app.put('/api/users/:id', admin, async (c) => {
    const id = c.req.param('id');
    const d = await body(c, userUpdateSchema);
    if (id === me(c) && d.role && d.role !== 'admin') throw bad('Nie możesz odebrać sobie roli administratora.');
    if (id === me(c) && d.active === false) throw bad('Nie możesz wyłączyć własnego konta.');
    const { opId, ...rest } = d;
    let result;
    try {
      result = runOp(db, opId, me(c), () => svc.update(db, me(c), id, rest)).result;
    } catch (e) { return taken(e); }
    if (!result) throw notFound();
    return c.json(result);
  });

  app.post('/api/users/:id/haslo', admin, async (c) => {
    const { opId, haslo } = await body(c, userPasswordSchema);
    const { result } = runOp(db, opId, me(c), () => svc.setPassword(db, me(c), c.req.param('id'), haslo));
    if (!result) throw notFound();
    return c.json({ user: result });
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
