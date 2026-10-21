import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createApp } from '../app.js';
import { addUser, loginCookie, testDeps } from '../test-utils.js';
import { hashToken, requireAdmin, revokeUser } from './auth.js';
import { logError } from './errors.js';
import { can } from './permissions.js';
import { sessions, users } from './schema-base.js';

const post = (app: ReturnType<typeof createApp>, path: string, body: unknown, cookie?: string) =>
  app.request(path, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
const get = (app: ReturnType<typeof createApp>, path: string, cookie?: string) =>
  app.request(path, { headers: cookie ? { cookie } : {} });

function setup() {
  const deps = testDeps();
  const app = createApp(deps);
  app.get('/api/test-admin', requireAdmin(deps.db), (c) => c.json({ ok: true }));
  return { deps, app };
}

describe('logowanie linkiem', () => {
  it('dobry token: cookie i /api/me', async () => {
    const { deps, app } = setup();
    const { user, token } = addUser(deps, { name: 'Adam', role: 'admin' });
    const res = await post(app, '/api/login', { token });
    expect(res.status).toBe(200);
    const sc = res.headers.get('set-cookie')!;
    expect(sc).toMatch(/etner_s=/);
    expect(sc).toMatch(/HttpOnly/i);
    expect(sc).toMatch(/SameSite=Lax/i);
    expect(sc).toMatch(/Max-Age=15552000/);
    expect(sc).not.toMatch(/Secure/i);
    expect((await res.json()).id).toBe(user.id);
    const me = await get(app, '/api/me', sc.split(';')[0]);
    expect(me.status).toBe(200);
    expect(await me.json()).toEqual({ id: user.id, name: 'Adam', role: 'admin', perms: [], ekipa: null, scheduleCol: null });
  });

  it('w bazie tylko skróty tokenów', async () => {
    const { deps, app } = setup();
    const { token } = addUser(deps);
    const cookie = await loginCookie(app, token);
    const s = deps.db.select().from(sessions).get()!;
    expect(s.tokenHash).toBe(hashToken(cookie.split('=')[1]!));
    expect(s.tokenHash).not.toBe(cookie.split('=')[1]);
    expect(deps.db.select().from(users).get()!.tokenHash).toBe(hashToken(token));
  });

  it('Secure gdy secureCookie', async () => {
    const deps = testDeps({ secureCookie: true });
    const app = createApp(deps);
    const { token } = addUser(deps);
    const res = await post(app, '/api/login', { token });
    expect(res.headers.get('set-cookie')).toMatch(/Secure/i);
  });

  it('zły token i brak tokenu: 401 ZLY_LINK', async () => {
    const { app } = setup();
    for (const body of [{ token: 'zly' }, {}]) {
      const res = await post(app, '/api/login', body);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'ZLY_LINK' });
    }
  });

  it('użytkownik nieaktywny: 401 przy logowaniu i przy starej sesji', async () => {
    const { deps, app } = setup();
    const { user, token } = addUser(deps);
    const cookie = await loginCookie(app, token);
    deps.db.update(users).set({ active: false }).where(eq(users.id, user.id)).run();
    expect((await post(app, '/api/login', { token })).status).toBe(401);
    const me = await get(app, '/api/me', cookie);
    expect(me.status).toBe(401);
    expect(await me.json()).toEqual({ error: 'SESJA' });
  });

  it('usunięty użytkownik: 401', async () => {
    const { deps, app } = setup();
    const { user, token } = addUser(deps);
    const cookie = await loginCookie(app, token);
    deps.db.update(users).set({ deletedAt: new Date().toISOString() }).where(eq(users.id, user.id)).run();
    expect((await get(app, '/api/me', cookie)).status).toBe(401);
  });

  it('brak sesji i wygasła sesja: 401 SESJA', async () => {
    const { deps, app } = setup();
    expect(await (await get(app, '/api/me')).json()).toEqual({ error: 'SESJA' });
    const { token } = addUser(deps);
    const cookie = await loginCookie(app, token);
    deps.db.update(sessions).set({ expiresAt: '2000-01-01T00:00:00.000Z' }).run();
    expect((await get(app, '/api/me', cookie)).status).toBe(401);
  });

  it('revokeUser kasuje sesje', async () => {
    const { deps, app } = setup();
    const { user, token } = addUser(deps);
    const cookie = await loginCookie(app, token);
    expect((await get(app, '/api/me', cookie)).status).toBe(200);
    revokeUser(deps.db, user.id);
    const res = await get(app, '/api/me', cookie);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'SESJA' });
  });

  it('logout kasuje sesję i czyści cookie', async () => {
    const { deps, app } = setup();
    const { token } = addUser(deps);
    const cookie = await loginCookie(app, token);
    const res = await post(app, '/api/logout', {}, cookie);
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toMatch(/etner_s=;/);
    expect((await get(app, '/api/me', cookie)).status).toBe(401);
  });
});

describe('uprawnienia', () => {
  it('requireAdmin: pracownik 403, admin 200, bez sesji 401', async () => {
    const { deps, app } = setup();
    const w = await loginCookie(app, addUser(deps).token);
    const a = await loginCookie(app, addUser(deps, { role: 'admin' }).token);
    const r = await get(app, '/api/test-admin', w);
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ error: 'BRAK_UPRAWNIEN' });
    expect((await get(app, '/api/test-admin', a)).status).toBe(200);
    expect((await get(app, '/api/test-admin')).status).toBe(401);
  });

  it('can()', () => {
    const w = { role: 'pracownik', perms: ['finanse'] } as const;
    const a = { role: 'admin', perms: [] } as const;
    const af = { role: 'admin', perms: ['finanse'] } as const;
    for (const p of ['admin', 'finanse', 'leady', 'zadania', 'szkice'] as const) expect(can(w, p)).toBe(false);
    for (const p of ['admin', 'leady', 'zadania', 'szkice'] as const) expect(can(a, p)).toBe(true);
    expect(can(a, 'finanse')).toBe(false);
    expect(can(af, 'finanse')).toBe(true);
  });

  it('GET /api/errors tylko dla admina', async () => {
    const { deps, app } = setup();
    logError(deps.db, 'test', new Error('boom'));
    const w = await loginCookie(app, addUser(deps).token);
    const a = await loginCookie(app, addUser(deps, { role: 'admin' }).token);
    expect((await get(app, '/api/errors', w)).status).toBe(403);
    const res = await get(app, '/api/errors', a);
    expect(res.status).toBe(200);
    expect((await res.json())[0].message).toMatch(/boom/);
  });
});
