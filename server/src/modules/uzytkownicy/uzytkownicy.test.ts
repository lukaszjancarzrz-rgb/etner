import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { addUser, loginCookie, testDeps } from '../../test-utils.js';
import { modules } from '../index.js';
import { admins, byScheduleCol, crewMembers } from './service.js';

async function setup() {
  const deps = testDeps();
  const app = createApp(deps, modules);
  const a = addUser(deps, { role: 'admin', name: 'Szef' });
  const w = addUser(deps, { name: 'Jan', ekipa: 'ekipa Bartek', scheduleCol: 'J' });
  return { deps, app, a, w, admin: await loginCookie(app, a.login), worker: await loginCookie(app, w.login) };
}
const send = (app: any, method: string, url: string, cookie: string, body?: unknown) =>
  app.request(url, { method, headers: { cookie, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
const get = (app: any, url: string, cookie: string) => app.request(url, { headers: { cookie } });

describe('użytkownicy', () => {
  it('pracownik nie ma dostępu do tras admina', async () => {
    const { app, worker, w } = await setup();
    expect((await get(app, '/api/users', worker)).status).toBe(403);
    expect((await send(app, 'POST', '/api/users', worker, { name: 'X' })).status).toBe(403);
    expect((await send(app, 'POST', `/api/users/${w.user.id}/haslo`, worker, { haslo: 'nowe-haslo-1' })).status).toBe(403);
  });

  it('POST tworzy użytkownika z loginem i hasłem; loguje się, hash nie wychodzi', async () => {
    const { deps, app, admin } = await setup();
    const res = await send(app, 'POST', '/api/users', admin, { name: 'Nowy', login: ' Nowy.Jan ', haslo: 'tajne-haslo-1', ekipa: 'ekipa Marek', opId: 'op-1' });
    expect(res.status).toBe(200);
    const { user } = (await res.json()) as any;
    expect(user.login).toBe('nowy.jan');
    expect(JSON.stringify(user)).not.toMatch(/password|hash|tajne/i);
    const l = await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login: 'NOWY.jan', haslo: 'tajne-haslo-1' }) });
    expect(l.status).toBe(200);
    expect(JSON.stringify(deps.db.$client.prepare('select * from op_ids').all())).not.toContain('tajne');
    expect(JSON.stringify(deps.db.$client.prepare('select * from changes').all())).not.toMatch(/tajne|scrypt/);
    expect(((await (await send(app, 'POST', '/api/users', admin, { name: 'Nowy', login: 'nowy.jan', haslo: 'tajne-haslo-1', opId: 'op-1' })).json()) as any).user.id).toBe(user.id);
    expect(JSON.stringify(await (await get(app, '/api/users', admin)).json())).not.toMatch(/password_?hash|scrypt/i);
  });

  it('walidacja: login i hasło wymagane, hasło min. 8, login 2–32 znaków dozwolonych', async () => {
    const { app, admin } = await setup();
    for (const b of [{ name: 'X' }, { name: 'X', login: 'xx' }, { name: 'X', login: 'xx', haslo: 'krotkie' }, { name: 'X', login: 'x', haslo: 'dlugie-haslo' }, { name: 'X', login: 'z spacją', haslo: 'dlugie-haslo' }])
      expect((await send(app, 'POST', '/api/users', admin, b)).status).toBe(400);
    expect((await send(app, 'POST', '/api/users', admin, { name: 'Łukasz', login: 'Łukasz', haslo: 'dlugie-haslo' })).status).toBe(200);
  });

  it('login unikalny (bez wielkości liter): 409 LOGIN_ZAJETY przy tworzeniu i zmianie; zmiana loginu działa', async () => {
    const { app, a, w, admin } = await setup();
    const dup = await send(app, 'POST', '/api/users', admin, { name: 'X', login: w.login.toUpperCase(), haslo: 'dlugie-haslo' });
    expect(dup.status).toBe(409);
    expect(await dup.json()).toEqual({ error: 'LOGIN_ZAJETY' });
    const put = await send(app, 'PUT', `/api/users/${w.user.id}`, admin, { login: a.login });
    expect(put.status).toBe(409);
    expect(await put.json()).toEqual({ error: 'LOGIN_ZAJETY' });
    expect((await send(app, 'PUT', `/api/users/${w.user.id}`, admin, { login: w.login })).status).toBe(200);
    const ok = await send(app, 'PUT', `/api/users/${w.user.id}`, admin, { login: 'Jan.K' });
    expect(((await ok.json()) as any).login).toBe('jan.k');
    expect(await loginCookie(app, 'jan.k')).toMatch(/etner_s=/);
  });

  it('reset hasła przez admina: nowe hasło działa, stare i wszystkie sesje nie', async () => {
    const { app, w, admin, worker } = await setup();
    expect((await get(app, '/api/me', worker)).status).toBe(200);
    expect((await send(app, 'POST', `/api/users/${w.user.id}/haslo`, admin, { haslo: 'krotkie' })).status).toBe(400);
    expect((await send(app, 'POST', '/api/users/nie-ma/haslo', admin, { haslo: 'nowe-haslo-1' })).status).toBe(404);
    const r = await send(app, 'POST', `/api/users/${w.user.id}/haslo`, admin, { haslo: 'nowe-haslo-1', opId: 'op-2' });
    expect(r.status).toBe(200);
    expect(JSON.stringify(await r.json())).not.toMatch(/password|scrypt/i);
    expect((await get(app, '/api/me', worker)).status).toBe(401);
    expect(await loginCookie(app, w.login)).toBe('');
    expect(await loginCookie(app, w.login, 'nowe-haslo-1')).toMatch(/etner_s=/);
    expect((await get(app, '/api/me', admin)).status).toBe(200);
  });

  it('trasy linków nie istnieją', async () => {
    const { app, w, admin } = await setup();
    expect((await send(app, 'POST', `/api/users/${w.user.id}/new-link`, admin)).status).toBe(404);
  });

  it('admin nie odbierze sobie roli ani się nie wyłączy; może edytować innych', async () => {
    const { app, a, w, admin, deps } = await setup();
    for (const body of [{ role: 'pracownik' }, { active: false }]) {
      const r = await send(app, 'PUT', `/api/users/${a.user.id}`, admin, body);
      expect(r.status).toBe(400);
      expect(((await r.json()) as any).error).toMatch(/siebie|sobie|własn/i);
    }
    expect((await send(app, 'PUT', `/api/users/${a.user.id}`, admin, { name: 'Szef 2' })).status).toBe(200);
    expect((await send(app, 'PUT', `/api/users/${w.user.id}`, admin, { active: false })).status).toBe(200);
    expect(admins(deps.db)).toEqual([a.user.id]);
  });

  it('service: byScheduleCol, crewMembers', async () => {
    const { deps, w } = await setup();
    expect(byScheduleCol(deps.db).J!.id).toBe(w.user.id);
    expect(crewMembers(deps.db, 'ekipa Bartek')).toEqual([w.user.id]);
  });

  it('zmiany użytkowników widzi tylko admin, pracownik tylko własny rekord; password_hash nigdzie nie wychodzi', async () => {
    const { app, a, w, admin } = await setup();
    await send(app, 'PUT', `/api/users/${w.user.id}`, admin, { name: 'Jan K.' });
    await send(app, 'PUT', `/api/users/${a.user.id}`, admin, { name: 'Szef 2' });
    await send(app, 'POST', `/api/users/${w.user.id}/haslo`, admin, { haslo: 'nowe-haslo-1' });
    const worker2 = await loginCookie(app, w.login, 'nowe-haslo-1');
    for (const [cookie, who] of [[admin, 'admin'], [worker2, 'worker']] as const) {
      const ch = (await (await get(app, '/api/changes?since=0', cookie)).json()) as any;
      const snap = (await (await get(app, '/api/snapshot', cookie)).json()) as any;
      expect(JSON.stringify([ch, snap])).not.toMatch(/password_?hash|passwordHash|scrypt/i);
      const ids = new Set([...ch.changes, ...snap.records].filter((c: any) => c.entity === 'users').map((c: any) => c.id));
      expect([...ids].sort()).toEqual(who === 'admin' ? [a.user.id, w.user.id].sort() : [w.user.id]);
    }
  });

  it('schedule_people: pracownik czyta, admin zapisuje', async () => {
    const { app, admin, worker } = await setup();
    expect((await send(app, 'POST', '/api/schedule-people', worker, { nazwa: 'X' })).status).toBe(403);
    expect((await send(app, 'POST', '/api/schedule-people', admin, { nazwa: 'Y', userId: 'nie-ma' })).status).toBe(400);
    const r = await send(app, 'POST', '/api/schedule-people', admin, { nazwa: 'Bartek', kolejnosc: 1 });
    const p = (await r.json()) as any;
    expect(p.nazwa).toBe('Bartek');
    expect((await send(app, 'PUT', `/api/schedule-people/${p.id}`, admin, { nazwa: 'Bartek K.' })).status).toBe(200);
    const list = (await (await get(app, '/api/schedule-people', worker)).json()) as any[];
    expect(list.map((x) => x.nazwa)).toEqual(['Bartek K.']);
    expect((await send(app, 'DELETE', `/api/schedule-people/${p.id}`, admin)).status).toBe(200);
    expect(((await (await get(app, '/api/schedule-people', worker)).json()) as any[])).toHaveLength(0);
    const ch = (await (await get(app, '/api/changes?since=0', worker)).json()) as any;
    expect(ch.changes.filter((c: any) => c.entity === 'schedule_people')).toHaveLength(3);
  });
});
