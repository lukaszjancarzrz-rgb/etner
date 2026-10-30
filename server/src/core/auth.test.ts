import { describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createApp } from '../app.js';
import { addUser, loginCookie, testDeps } from '../test-utils.js';
import { hashToken, requireAdmin, revokeUser } from './auth.js';
import { hashPassword, verifyPassword } from './password.js';
import { logError } from './errors.js';
import { can } from './permissions.js';
import { sessions, settings, users } from './schema-base.js';

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

describe('logowanie hasłem', () => {
  it('dobre dane: cookie i /api/me; login bez rozróżniania wielkości liter', async () => {
    const { deps, app } = setup();
    const { user, login, haslo } = addUser(deps, { name: 'Adam', role: 'admin' });
    const res = await post(app, '/api/login', { login: `  ${login.toUpperCase()} `, haslo });
    expect(res.status).toBe(200);
    const sc = res.headers.get('set-cookie')!;
    expect(sc).toMatch(/etner_s=/);
    expect(sc).toMatch(/HttpOnly/i);
    expect(sc).toMatch(/SameSite=Lax/i);
    expect(sc).toMatch(/Max-Age=15552000/);
    expect(sc).not.toMatch(/Secure/i);
    expect((await res.json()).id).toBe(user.id);
    const me = await get(app, '/api/me', sc.split(';')[0]);
    expect(await me.json()).toEqual({ id: user.id, name: 'Adam', role: 'admin', perms: [], ekipa: null, scheduleCol: null });
  });

  it('w bazie skróty: sesji sha256, hasła scrypt$sól$skrót', async () => {
    const { deps, app } = setup();
    const { login, haslo } = addUser(deps);
    const cookie = await loginCookie(app, login);
    const s = deps.db.select().from(sessions).get()!;
    expect(s.tokenHash).toBe(hashToken(cookie.split('=')[1]!));
    const ph = deps.db.select().from(users).get()!.passwordHash!;
    expect(ph).toMatch(/^scrypt\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(ph).not.toContain(haslo);
    expect(await hashPassword(haslo)).not.toBe(ph); // losowa sól
    expect(await verifyPassword(haslo, ph)).toBe(true);
    expect(await verifyPassword('inne', ph)).toBe(false);
    for (const bad of [null, '', 'scrypt$', 'x$y$z']) expect(await verifyPassword(haslo, bad)).toBe(false);
  });

  it('Secure gdy secureCookie', async () => {
    const deps = testDeps({ secureCookie: true });
    const app = createApp(deps);
    const { login, haslo } = addUser(deps);
    const res = await post(app, '/api/login', { login, haslo });
    expect(res.headers.get('set-cookie')).toMatch(/Secure/i);
  });

  it('zły login, złe hasło, brak danych, brak hasła, nieaktywny, usunięty: to samo 401 ZLE_DANE', async () => {
    const { deps, app } = setup();
    const ok = addUser(deps);
    const off = addUser(deps, { active: false });
    const del = addUser(deps);
    deps.db.update(users).set({ deletedAt: new Date().toISOString() }).where(eq(users.id, del.user.id)).run();
    const none = addUser(deps);
    deps.db.update(users).set({ passwordHash: null }).where(eq(users.id, none.user.id)).run();
    const bodies: unknown[] = [
      { login: 'nie-ma', haslo: 'cokolwiek1' }, { login: ok.login, haslo: 'zle-haslo' }, {}, { login: ok.login },
      { login: off.login, haslo: off.haslo }, { login: del.login, haslo: del.haslo }, { login: none.login, haslo: '' }, { login: none.login, haslo: 'x' },
    ];
    for (const body of bodies) {
      const res = await post(app, '/api/login', body);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'ZLE_DANE' });
      expect(res.headers.get('set-cookie')).toBeNull();
    }
  });

  it('po 5 nieudanych próbach na login: 429 ZA_DUZO_PROB, także z dobrym hasłem; po 15 min znów można', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const { deps, app } = setup();
      const { login, haslo } = addUser(deps);
      const other = addUser(deps);
      for (let i = 0; i < 5; i++) expect((await post(app, '/api/login', { login, haslo: 'zle-haslo' })).status).toBe(401);
      const blocked = await post(app, '/api/login', { login, haslo });
      expect(blocked.status).toBe(429);
      expect(await blocked.json()).toEqual({ error: 'ZA_DUZO_PROB' });
      expect((await post(app, '/api/login', { login: other.login, haslo: other.haslo })).status).toBe(200); // inny login nie jest blokowany
      vi.advanceTimersByTime(15 * 60_000 + 1000);
      expect((await post(app, '/api/login', { login, haslo })).status).toBe(200);
    } finally { vi.useRealTimers(); }
  });

  it('równoległe próby też są ograniczone do 5; wariant wielkości liter i spacji dzieli licznik', async () => {
    const { deps, app } = setup();
    const { login, haslo } = addUser(deps);
    const variants = [login, ` ${login.toUpperCase()} `];
    const res = await Promise.all(Array.from({ length: 12 }, (_, i) => post(app, '/api/login', { login: variants[i % 2], haslo: i === 11 ? haslo : 'zle-haslo' })));
    const codes = res.map((r) => r.status);
    expect(codes.filter((c) => c === 429).length).toBe(7);
    expect(codes.filter((c) => c === 401 || c === 200).length).toBe(5);
    expect((await post(app, '/api/login', { login, haslo })).status).toBe(429);
  });

  it('hasło dłuższe niż 200 znaków: 401 bez scrypt', async () => {
    const { deps, app } = setup();
    const { login } = addUser(deps);
    const res = await post(app, '/api/login', { login, haslo: 'x'.repeat(201) });
    expect(res.status).toBe(401);
    expect((await post(app, '/api/me/haslo', { stare: 'x'.repeat(201), nowe: 'nowe-haslo-1' }, await loginCookie(app, login))).status).toBe(400);
  });

  it('logowanie z istniejącym cookie kasuje starą sesję', async () => {
    const { deps, app } = setup();
    const { login, haslo } = addUser(deps);
    const first = await loginCookie(app, login);
    const res = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json', cookie: first }, body: JSON.stringify({ login, haslo }) });
    const second = res.headers.get('set-cookie')!.split(';')[0]!;
    expect(deps.db.select().from(sessions).all()).toHaveLength(1);
    expect((await get(app, '/api/me', first)).status).toBe(401);
    expect((await get(app, '/api/me', second)).status).toBe(200);
  });

  it('udane logowanie zeruje licznik', async () => {
    const { deps, app } = setup();
    const { login, haslo } = addUser(deps);
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < 4; i++) expect((await post(app, '/api/login', { login, haslo: 'zle-haslo' })).status).toBe(401);
      expect((await post(app, '/api/login', { login, haslo })).status).toBe(200);
    }
  });

  it('użytkownik wyłączony po zalogowaniu: stara sesja 401', async () => {
    const { deps, app } = setup();
    const { user, login } = addUser(deps);
    const cookie = await loginCookie(app, login);
    deps.db.update(users).set({ active: false }).where(eq(users.id, user.id)).run();
    const me = await get(app, '/api/me', cookie);
    expect(me.status).toBe(401);
    expect(await me.json()).toEqual({ error: 'SESJA' });
  });

  it('usunięty użytkownik: 401', async () => {
    const { deps, app } = setup();
    const { user, login } = addUser(deps);
    const cookie = await loginCookie(app, login);
    deps.db.update(users).set({ deletedAt: new Date().toISOString() }).where(eq(users.id, user.id)).run();
    expect((await get(app, '/api/me', cookie)).status).toBe(401);
  });

  it('brak sesji i wygasła sesja: 401 SESJA', async () => {
    const { deps, app } = setup();
    expect(await (await get(app, '/api/me')).json()).toEqual({ error: 'SESJA' });
    const { login } = addUser(deps);
    const cookie = await loginCookie(app, login);
    deps.db.update(sessions).set({ expiresAt: '2000-01-01T00:00:00.000Z' }).run();
    expect((await get(app, '/api/me', cookie)).status).toBe(401);
  });

  it('sesja przesuwa się przy używaniu, najwyżej raz na dobę (nowe ciasteczko z pełnym terminem)', async () => {
    const { deps, app } = setup();
    const cookie = await loginCookie(app, addUser(deps).login);
    const exp = () => Date.parse(deps.db.select().from(sessions).get()!.expiresAt);
    expect((await get(app, '/api/me', cookie)).headers.get('set-cookie')).toBeNull(); // świeża: bez przesuwania
    deps.db.update(sessions).set({ expiresAt: new Date(Date.now() + 100 * 86_400_000).toISOString() }).run();
    const res = await get(app, '/api/me', cookie);
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain(`${cookie}; Max-Age=${180 * 24 * 3600}`);
    expect(exp() - Date.now()).toBeGreaterThan(179.9 * 86_400_000);
    expect((await get(app, '/api/me', cookie)).headers.get('set-cookie')).toBeNull();
  });

  it('revokeUser kasuje sesje', async () => {
    const { deps, app } = setup();
    const { user, login } = addUser(deps);
    const cookie = await loginCookie(app, login);
    expect((await get(app, '/api/me', cookie)).status).toBe(200);
    revokeUser(deps.db, user.id);
    const res = await get(app, '/api/me', cookie);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'SESJA' });
  });

  it('logout kasuje sesję i czyści cookie', async () => {
    const { deps, app } = setup();
    const { login } = addUser(deps);
    const cookie = await loginCookie(app, login);
    const res = await post(app, '/api/logout', {}, cookie);
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toMatch(/etner_s=;/);
    expect((await get(app, '/api/me', cookie)).status).toBe(401);
  });
});

describe('uprawnienia', () => {
  it('requireAdmin: pracownik 403, admin 200, bez sesji 401', async () => {
    const { deps, app } = setup();
    const w = await loginCookie(app, addUser(deps).login);
    const a = await loginCookie(app, addUser(deps, { role: 'admin' }).login);
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
    const w = await loginCookie(app, addUser(deps).login);
    const a = await loginCookie(app, addUser(deps, { role: 'admin' }).login);
    expect((await get(app, '/api/errors', w)).status).toBe(403);
    const res = await get(app, '/api/errors', a);
    expect(res.status).toBe(200);
    expect((await res.json())[0].message).toMatch(/boom/);
  });

  it('ustawienia: godzina rano (GET/PUT, walidacja) i stan kopii, tylko admin', async () => {
    const { deps, app } = setup();
    const w = await loginCookie(app, addUser(deps).login);
    const a = await loginCookie(app, addUser(deps, { role: 'admin' }).login);
    const put = (godzina: string, cookie: string) => app.request('/api/settings/rano', { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ godzina }) });
    for (const p of ['/api/settings/rano', '/api/settings/kopie']) expect((await get(app, p, w)).status).toBe(403);
    expect((await put('06:30', w)).status).toBe(403);
    expect(await (await get(app, '/api/settings/rano', a)).json()).toEqual({ godzina: '07:00' });
    expect((await put('6:30', a)).status).toBe(400);
    expect((await put('24:00', a)).status).toBe(400);
    expect((await put('06:30', a)).status).toBe(200);
    expect(await (await get(app, '/api/settings/rano', a)).json()).toEqual({ godzina: '06:30' });
    expect(await (await get(app, '/api/settings/kopie', a)).json()).toEqual({ eksport: null, zdjecia: null });
    const at = '2026-10-21T01:30:00.000Z';
    deps.db.insert(settings).values({ key: 'kopia_eksport_at', value: at, updatedAt: at }).run();
    expect(await (await get(app, '/api/settings/kopie', a)).json()).toEqual({ eksport: at, zdjecia: null });
  });
});

describe('zmiana własnego hasła', () => {
  it('błędne stare hasło liczy się do tego samego limitu co logowanie: 429 po 5', async () => {
    const { deps, app } = setup();
    const { login, haslo } = addUser(deps);
    const cookie = await loginCookie(app, login); // udane, licznik zerowy
    for (let i = 0; i < 5; i++) expect((await post(app, '/api/me/haslo', { stare: 'zle-haslo', nowe: 'nowe-haslo-1' }, cookie)).status).toBe(400);
    const r = await post(app, '/api/me/haslo', { stare: haslo, nowe: 'nowe-haslo-1' }, cookie);
    expect(r.status).toBe(429);
    expect(await r.json()).toEqual({ error: 'ZA_DUZO_PROB' });
    expect((await post(app, '/api/login', { login, haslo })).status).toBe(429);
  });

  it('sprawdza stare, ustawia nowe, wylogowuje inne urządzenia, zostawia bieżące', async () => {
    const { deps, app } = setup();
    const { login, haslo } = addUser(deps);
    const here = await loginCookie(app, login);
    const other = await loginCookie(app, login);
    expect((await post(app, '/api/me/haslo', { stare: 'zle-haslo', nowe: 'nowe-haslo-1' }, here)).status).toBe(400);
    expect((await post(app, '/api/me/haslo', { stare: haslo, nowe: 'krotkie' }, here)).status).toBe(400);
    expect((await post(app, '/api/me/haslo', { stare: haslo, nowe: 'nowe-haslo-1' })).status).toBe(401);
    expect((await post(app, '/api/me/haslo', { stare: haslo, nowe: 'nowe-haslo-1' }, here)).status).toBe(200);
    expect((await get(app, '/api/me', here)).status).toBe(200);
    expect((await get(app, '/api/me', other)).status).toBe(401);
    expect((await post(app, '/api/login', { login, haslo })).status).toBe(401);
    expect((await post(app, '/api/login', { login, haslo: 'nowe-haslo-1' })).status).toBe(200);
  });
});
