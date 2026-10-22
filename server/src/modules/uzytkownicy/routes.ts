import { schedulePersonSchema, schedulePersonUpdateSchema, userCreateSchema, userPasswordSchema, userUpdateSchema } from '@etner/shared';
import type { Context, Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { bodyLimit } from 'hono/body-limit';
import sharp from 'sharp';
import { newId } from '@etner/shared';
import type { AppDeps } from '../../app.js';
import { body } from '../../core/body.js';
import { requireAdmin, requireUser } from '../../core/auth.js';
import { hashPassword } from '../../core/password.js';
import { runOp } from '../../core/ops.js';
import { can } from '../../core/permissions.js';
import * as svc from './service.js';

const bad = (message: string) => new HTTPException(400, { message });
const notFound = () => new HTTPException(404, { message: 'Nie znaleziono' });
const taken = (e: unknown) => { throw e instanceof svc.LoginTakenError ? new HTTPException(409, { message: 'LOGIN_ZAJETY' }) : e; };

export function routes(app: Hono, { db, files }: AppDeps): void {
  const admin = requireAdmin(db);
  const me = (c: Context) => c.get('user').id;

  app.get('/api/users', admin, (c) => c.json(svc.list(db)));

  app.post('/api/users', admin, async (c) => {
    const { opId, haslo, ...d } = await body(c, userCreateSchema);
    const passwordHash = await hashPassword(haslo);
    try {
      return c.json({ user: runOp(db, opId, me(c), () => svc.create(db, me(c), { ...d, passwordHash })).result });
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
    const passwordHash = await hashPassword(haslo);
    const { result } = runOp(db, opId, me(c), () => svc.setPassword(db, me(c), c.req.param('id'), passwordHash));
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

  // Zdjęcie użytkownika: zmienia on sam albo admin; widzi każdy zalogowany (link podpisany, krótki TTL).
  const AVATAR_MAX = 10 * 1024 * 1024;
  const selfOrAdmin = (c: Context) => {
    const id = c.req.param('id')!;
    if (id !== me(c) && !can(c.get('user'), 'admin')) throw new HTTPException(403, { message: 'BRAK_UPRAWNIEN' });
    if (!svc.get(db, id) || svc.get(db, id)!.deletedAt) throw notFound();
    return id;
  };
  const limit = bodyLimit({ maxSize: AVATAR_MAX + 64 * 1024, onError: (c) => c.json({ error: 'Zdjęcie jest za duże (max 10 MB).' }, 413) });
  app.post('/api/users/:id/avatar', requireUser(db), limit, async (c) => {
    const id = selfOrAdmin(c);
    const f = ((await c.req.parseBody().catch(() => ({}))) as Record<string, unknown>)['file'];
    if (!(f instanceof File)) throw bad('Brak pliku');
    if (f.size > AVATAR_MAX) throw new HTTPException(413, { message: 'Zdjęcie jest za duże (max 10 MB).' });
    const buf = Buffer.from(await f.arrayBuffer());
    const fmt = await sharp(buf).metadata().then((m) => m.format, () => undefined);
    if (!fmt || !['jpeg', 'png', 'webp'].includes(fmt)) throw new HTTPException(415, { message: 'Dozwolone są zdjęcia JPEG, PNG i WebP.' });
    const out = await sharp(buf).rotate().resize(256, 256, { fit: 'cover' }).webp({ quality: 80 }).toBuffer();
    const key = `avatar/${id}/${newId()}.webp`; // nowy klucz = nowy adres, przeglądarka nie pokaże starego z pamięci
    await files.put(key, out, 'image/webp');
    return c.json(svc.setAvatar(db, me(c), id, key));
  });
  app.delete('/api/users/:id/avatar', requireUser(db), (c) => c.json(svc.setAvatar(db, me(c), selfOrAdmin(c), null)));
  app.get('/api/users/:id/avatar', requireUser(db), async (c) => {
    const key = svc.get(db, c.req.param('id'))?.avatarKey;
    if (!key) throw notFound();
    c.header('cache-control', 'private, max-age=300');
    return c.redirect(await files.url(key, 3600), 302);
  });
}
