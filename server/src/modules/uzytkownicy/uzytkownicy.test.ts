import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { addUser, loginCookie, testDeps } from '../../test-utils.js';
import { hashToken } from '../../core/auth.js';
import { modules } from '../index.js';
import { admins, byScheduleCol, crewMembers } from './service.js';

async function setup() {
  const deps = testDeps();
  const app = createApp(deps, modules);
  const a = addUser(deps, { role: 'admin', name: 'Szef' });
  const w = addUser(deps, { name: 'Jan', ekipa: 'ekipa Bartek', scheduleCol: 'J' });
  return { deps, app, a, w, admin: await loginCookie(app, a.token), worker: await loginCookie(app, w.token) };
}
const send = (app: any, method: string, url: string, cookie: string, body?: unknown) =>
  app.request(url, { method, headers: { cookie, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
const get = (app: any, url: string, cookie: string) => app.request(url, { headers: { cookie } });

describe('użytkownicy', () => {
  it('pracownik nie ma dostępu do tras admina', async () => {
    const { app, worker, w } = await setup();
    expect((await get(app, '/api/users', worker)).status).toBe(403);
    expect((await send(app, 'POST', '/api/users', worker, { name: 'X' })).status).toBe(403);
    expect((await send(app, 'POST', `/api/users/${w.user.id}/new-link`, worker)).status).toBe(403);
  });

  it('POST tworzy użytkownika i zwraca link raz; token działa, w bazie tylko hash', async () => {
    const { deps, app, admin } = await setup();
    process.env.BASE_URL = 'https://etner.test';
    let res: Response;
    try {
      res = await send(app, 'POST', '/api/users', admin, { name: 'Nowy', ekipa: 'ekipa Marek', opId: 'op-1' });
    } finally {
      delete process.env.BASE_URL;
    }
    expect(res.status).toBe(200);
    const { user, link } = (await res.json()) as any;
    expect(JSON.stringify(user)).not.toMatch(/token/i);
    const m = /^https:\/\/etner\.test\/login#(.+)$/.exec(link)!;
    expect(m).toBeTruthy();
    expect((await app.request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: m[1] }) })).status).toBe(200);
    expect(JSON.stringify(deps.db.$client.prepare('select * from op_ids').all())).not.toContain('/login#');
    const replay = (await (await send(app, 'POST', '/api/users', admin, { name: 'Nowy', opId: 'op-1' })).json()) as any;
    expect(replay.link).toBeNull();
    const row = deps.db.$client.prepare('select token_hash h from users where id = ?').get(user.id) as any;
    expect(row.h).toBe(hashToken(m[1]!));
    const list = (await (await get(app, '/api/users', admin)).json()) as any[];
    expect(JSON.stringify(list)).not.toMatch(/token/i);
  });

  it('nowy link unieważnia stare sesje i stary token', async () => {
    const { deps, app, w, admin, worker } = await setup();
    expect((await get(app, '/api/me', worker)).status).toBe(200);
    const { link } = (await (await send(app, 'POST', `/api/users/${w.user.id}/new-link`, admin, { opId: 'op-2' })).json()) as any;
    expect(JSON.stringify(deps.db.$client.prepare('select * from op_ids').all())).not.toContain('/login#');
    expect((await get(app, '/api/me', worker)).status).toBe(401);
    expect(await loginCookie(app, w.token)).toBe('');
    const c = await loginCookie(app, link.split('#')[1]);
    expect((await get(app, '/api/me', c)).status).toBe(200);
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

  it('zmiany użytkowników widzi tylko admin, pracownik tylko własny rekord; token_hash nigdzie nie wychodzi', async () => {
    const { app, a, w, admin } = await setup();
    await send(app, 'PUT', `/api/users/${w.user.id}`, admin, { name: 'Jan K.' });
    await send(app, 'PUT', `/api/users/${a.user.id}`, admin, { name: 'Szef 2' });
    const worker2 = await loginCookie(app, ((await (await send(app, 'POST', `/api/users/${w.user.id}/new-link`, admin)).json()) as any).link.split('#')[1]);
    for (const [cookie, who] of [[admin, 'admin'], [worker2, 'worker']] as const) {
      const ch = (await (await get(app, '/api/changes?since=0', cookie)).json()) as any;
      const snap = (await (await get(app, '/api/snapshot', cookie)).json()) as any;
      expect(JSON.stringify([ch, snap])).not.toMatch(/token_?hash/i);
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
