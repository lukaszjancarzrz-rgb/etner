import { describe, expect, it, vi } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import { newId } from '@etner/shared';
import { createApp } from '../app.js';
import { addUser, loginCookie, testDeps } from '../test-utils.js';
import { rankoGodzina, rankoTick, registerCron, rankoTeraz } from './cron.js';
import { notify, type PushSender } from './notify.js';
import { errors, pushSubscriptions, settings } from './schema-base.js';

const n = { title: 'T', body: 'B', url: '/x', tag: 't' };
function sub(deps: ReturnType<typeof testDeps>, userId: string, endpoint: string) {
  const now = new Date().toISOString();
  deps.db.insert(pushSubscriptions).values({ id: newId(), userId, endpoint, p256dh: 'p', auth: 'a', createdAt: now, updatedAt: now }).run();
}
const alive = (deps: ReturnType<typeof testDeps>) =>
  deps.db.select().from(pushSubscriptions).where(isNull(pushSubscriptions.deletedAt)).all().map((r) => r.endpoint);

describe('notify', () => {
  it('wysyła do subskrypcji podanych osób (bez duplikatów) i nikomu więcej', async () => {
    const push = vi.fn<PushSender>(async () => ({ statusCode: 201 }));
    const deps = testDeps({ push });
    const a = addUser(deps).user, b = addUser(deps).user, c = addUser(deps).user;
    sub(deps, a.id, 'ea1'); sub(deps, a.id, 'ea2'); sub(deps, b.id, 'eb'); sub(deps, c.id, 'ec');
    expect(await notify(deps, [a.id, b.id, a.id], n)).toBe(3);
    expect(push.mock.calls.map((x) => x[0].endpoint).sort()).toEqual(['ea1', 'ea2', 'eb']);
    expect(push.mock.calls[0]![1]).toBe(JSON.stringify(n));
    expect(push.mock.calls[0]![2]).toEqual({ TTL: 86400 });
  });
  it.each([404, 410])('odpowiedź %i usuwa subskrypcję', async (code) => {
    const push: PushSender = async (s) => ({ statusCode: s.endpoint === 'bad' ? code : 201 });
    const deps = testDeps({ push });
    const a = addUser(deps).user;
    sub(deps, a.id, 'bad'); sub(deps, a.id, 'ok');
    expect(await notify(deps, [a.id], n)).toBe(1);
    expect(alive(deps)).toEqual(['ok']);
  });
  it('błąd wysyłki nie przerywa pozostałych', async () => {
    const push: PushSender = async (s) => { if (s.endpoint === 'e1') throw new Error('sieć'); return { statusCode: 201 }; };
    const deps = testDeps({ push });
    const a = addUser(deps).user;
    sub(deps, a.id, 'e1'); sub(deps, a.id, 'e2');
    expect(await notify(deps, [a.id], n)).toBe(1);
    expect(alive(deps)).toEqual(['e1', 'e2']);
  });
  it('nieudana wysyłka zapisuje wiersz w errors', async () => {
    const deps = testDeps({ push: async () => { throw new Error('sieć'); } });
    const a = addUser(deps).user; sub(deps, a.id, 'e1');
    await notify(deps, [a.id], n);
    expect(deps.db.select().from(errors).all()).toHaveLength(1);
  });
  it('wyłączony push (brak nadawcy) → 0 i brak błędów', async () => {
    const deps = testDeps({ push: undefined });
    const a = addUser(deps).user; sub(deps, a.id, 'e1');
    expect(await notify(deps, [a.id], n)).toBe(0);
    expect(deps.db.select().from(errors).all()).toHaveLength(0);
  });
  it('pusta lista → 0 bez wywołań', async () => {
    const push = vi.fn<PushSender>();
    expect(await notify(testDeps({ push }), [], n)).toBe(0);
    expect(push).not.toHaveBeenCalled();
  });
});

describe('trasy push', () => {
  const body = { endpoint: 'https://p/1', keys: { p256dh: 'k1', auth: 'a1' }, device: 'iPhone' };
  const post = (app: ReturnType<typeof createApp>, path: string, cookie: string, b: unknown) =>
    app.request(path, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(b) });

  it('subscribe wymaga logowania i waliduje', async () => {
    const deps = testDeps(); const app = createApp(deps);
    expect((await post(app, '/api/push/subscribe', '', body)).status).toBe(401);
    const { login } = addUser(deps); const cookie = await loginCookie(app, login);
    expect((await post(app, '/api/push/subscribe', cookie, { endpoint: 'x' })).status).toBe(400);
    expect((await post(app, '/api/push/unsubscribe', cookie, {})).status).toBe(400);
  });
  it('subscribe robi upsert po endpoint i przepisuje na bieżącego użytkownika; unsubscribe usuwa miękko', async () => {
    const deps = testDeps(); const app = createApp(deps);
    const u1 = addUser(deps), u2 = addUser(deps);
    const c1 = await loginCookie(app, u1.login), c2 = await loginCookie(app, u2.login);
    expect((await post(app, '/api/push/subscribe', c1, body)).status).toBe(200);
    expect((await post(app, '/api/push/subscribe', c2, { ...body, keys: { p256dh: 'k2', auth: 'a2' } })).status).toBe(200);
    const rows = deps.db.select().from(pushSubscriptions).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: u2.user.id, p256dh: 'k2', auth: 'a2', device: 'iPhone' });
    // cudzy unsubscribe nic nie robi
    await post(app, '/api/push/unsubscribe', c1, { endpoint: body.endpoint });
    expect(alive(deps)).toEqual([body.endpoint]);
    expect((await post(app, '/api/push/unsubscribe', c2, { endpoint: body.endpoint })).status).toBe(200);
    expect(alive(deps)).toEqual([]);
    // ponowny subscribe wskrzesza wiersz
    await post(app, '/api/push/subscribe', c1, body);
    expect(deps.db.select().from(pushSubscriptions).where(and(eq(pushSubscriptions.userId, u1.user.id), isNull(pushSubscriptions.deletedAt))).all()).toHaveLength(1);
  });
  it('POST /api/push/test: tylko do własnych urządzeń, wymaga logowania', async () => {
    const push = vi.fn<PushSender>(async () => ({ statusCode: 201 }));
    const deps = testDeps({ push }); const app = createApp(deps);
    const u1 = addUser(deps), u2 = addUser(deps);
    sub(deps, u1.user.id, 'e1'); sub(deps, u2.user.id, 'e2');
    expect((await post(app, '/api/push/test', '', {})).status).toBe(401);
    const r = await post(app, '/api/push/test', await loginCookie(app, u1.login), {});
    expect(await r.json()).toEqual({ sent: 1 });
    expect(push.mock.calls.map((x) => x[0].endpoint)).toEqual(['e1']);
    expect(JSON.parse(push.mock.calls[0]![1] as string)).toMatchObject({ url: '#wiecej', tag: 'test' });
  });
  it('POST /api/push/test: najwyżej raz na 10 s na osobę (429)', async () => {
    let now = new Date('2026-10-21T10:00:00Z');
    const deps = testDeps({ push: async () => ({ statusCode: 201 }), now: () => now }); const app = createApp(deps);
    const u1 = addUser(deps), u2 = addUser(deps);
    const c1 = await loginCookie(app, u1.login), c2 = await loginCookie(app, u2.login);
    expect((await post(app, '/api/push/test', c1, {})).status).toBe(200);
    expect((await post(app, '/api/push/test', c1, {})).status).toBe(429);
    expect((await post(app, '/api/push/test', c2, {})).status).toBe(200);
    now = new Date('2026-10-21T10:00:10Z');
    expect((await post(app, '/api/push/test', c1, {})).status).toBe(200);
  });
  it('to samo urządzenie zapisane przez drugą osobę: powiadomienia pierwszej już tam nie trafiają', async () => {
    const push = vi.fn<PushSender>(async () => ({ statusCode: 201 }));
    const deps = testDeps({ push }); const app = createApp(deps);
    const u1 = addUser(deps), u2 = addUser(deps);
    await post(app, '/api/push/subscribe', await loginCookie(app, u1.login), body);
    await post(app, '/api/push/subscribe', await loginCookie(app, u2.login), body);
    expect(await notify(deps, [u1.user.id], n)).toBe(0);
    expect(await notify(deps, [u2.user.id], n)).toBe(1);
  });
  it('GET /api/push/key', async () => {
    const off = await createApp(testDeps()).request('/api/push/key');
    expect(await off.json()).toEqual({ key: null });
    const on = await createApp(testDeps({ vapidPublic: 'PUB' })).request('/api/push/key');
    expect(await on.json()).toEqual({ key: 'PUB' });
  });
});

describe('zadanie rano', () => {
  const at = (iso: string) => new Date(iso);
  it('porównuje godzinę warszawską z ustawieniem', () => {
    expect(rankoTeraz(at('2026-01-15T06:00:00Z'), '07:00')).toBe(true); // zima UTC+1
    expect(rankoTeraz(at('2026-01-15T05:00:00Z'), '07:00')).toBe(false);
    expect(rankoTeraz(at('2026-07-15T05:00:00Z'), '07:00')).toBe(true); // lato UTC+2
    expect(rankoTeraz(at('2026-07-15T06:00:00Z'), '07:00')).toBe(false);
  });
  it('dzień zmiany czasu (25.10.2026, 07:00 CET = 06:00Z)', () => {
    expect(rankoTeraz(at('2026-10-25T06:00:00Z'), '07:00')).toBe(true);
    expect(rankoTeraz(at('2026-10-25T05:00:00Z'), '07:00')).toBe(false);
    expect(rankoTeraz(at('2026-03-29T05:00:00Z'), '07:00')).toBe(true); // 07:00 CEST
  });
  it('tik rano: błąd zadania jest łapany i zapisany; poza godziną nic nie robi', async () => {
    const deps = testDeps(); const run = vi.fn(() => { throw new Error('boom'); });
    const defs = [{ name: 'r', schedule: 'rano', run }];
    await rankoTick(deps, defs, at('2026-01-15T05:00:00Z'));
    expect(run).not.toHaveBeenCalled();
    await rankoTick(deps, defs, at('2026-01-15T06:00:00Z'));
    expect(run).toHaveBeenCalledTimes(1);
    expect(deps.db.select().from(errors).all()[0]!.where).toBe('cron:r');
  });
  it('tik rano najwyżej raz na dzień warszawski, także po przestawieniu godziny', async () => {
    const deps = testDeps(); const run = vi.fn();
    const defs = [{ name: 'r', schedule: 'rano', run }];
    await rankoTick(deps, defs, at('2026-01-15T06:00:00Z'));
    await rankoTick(deps, defs, at('2026-01-15T06:00:30Z'));
    deps.db.insert(settings).values({ key: 'rano_godzina', value: '08:00', updatedAt: 'x' }).run();
    await rankoTick(deps, defs, at('2026-01-15T07:00:00Z'));
    expect(run).toHaveBeenCalledTimes(1);
    await rankoTick(deps, defs, at('2026-01-16T07:00:00Z'));
    expect(run).toHaveBeenCalledTimes(2);
  });
  it('rano_godzina: zły format → 07:00', () => {
    const deps = testDeps();
    expect(rankoGodzina(deps)).toBe('07:00');
    const put = (value: string) => deps.db.insert(settings).values({ key: 'rano_godzina', value, updatedAt: 'x' })
      .onConflictDoUpdate({ target: settings.key, set: { value } }).run();
    put('8:30'); expect(rankoGodzina(deps)).toBe('07:00');
    put('25:00'); expect(rankoGodzina(deps)).toBe('07:00');
    put('06:45'); expect(rankoGodzina(deps)).toBe('06:45');
  });
  it('registerCron zwraca stop() i nie zostawia timerów', () => {
    const stop = registerCron(testDeps(), [
      { name: 'a', schedule: '0 3 * * *', run() {} },
      { name: 'r', schedule: 'rano', run() {} },
    ]);
    stop();
  });
});
