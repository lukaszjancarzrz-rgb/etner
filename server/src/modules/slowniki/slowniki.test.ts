import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { addUser, loginCookie, testDeps } from '../../test-utils.js';
import { firmy } from '../../core/schema-base.js';
import { modules } from '../index.js';
import { seedBase } from './seed.js';
import { groupOf, list } from './service.js';

async function setup() {
  const deps = testDeps();
  seedBase(deps.db);
  const app = createApp(deps, modules);
  const a = addUser(deps, { role: 'admin' });
  const w = addUser(deps);
  return { deps, app, admin: await loginCookie(app, a.login), worker: await loginCookie(app, w.login) };
}
const put = (app: any, rodzaj: string, cookie: string, items: unknown[]) =>
  app.request(`/api/dict/${rodzaj}`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ items }) });

describe('seed', () => {
  it('jest idempotentny i tworzy firmę ETNER', async () => {
    const { deps } = await setup();
    const n = list(deps.db, 'status_zlecenia').length;
    seedBase(deps.db);
    expect(list(deps.db, 'status_zlecenia')).toHaveLength(n);
    const f = deps.db.select().from(firmy).all();
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ skrot: 'ETNER', prefiksZ: 'Z', prefiksL: 'L' });
    expect(list(deps.db, 'status_leada')[3]!.wartosc).toBe('Przyjęta');
  });
});

describe('słowniki', () => {
  it('groupOf zwraca grupę statusu', async () => {
    const { deps } = await setup();
    expect(groupOf(deps.db, 'status_zlecenia', 'Rozliczone')).toBe('zamkniete');
    expect(groupOf(deps.db, 'status_zlecenia', 'Na później')).toBe('pozniej');
    expect(groupOf(deps.db, 'status_zlecenia', 'Nowe')).toBe('aktualne');
    expect(groupOf(deps.db, 'status_zlecenia', 'Nie ma')).toBeNull();
  });

  it('pracownik czyta, ale nie zapisuje (403)', async () => {
    const { app, worker } = await setup();
    expect((await app.request('/api/dict', { headers: { cookie: worker } })).status).toBe(200);
    expect((await put(app, 'ekipa', worker, [{ wartosc: 'x' }])).status).toBe(403);
    expect((await app.request('/api/dict')).status).toBe(401);
  });

  it('PUT podmienia listę: zachowuje id, usuwa miękko, zmienia kolejność, pracownik widzi zmiany', async () => {
    const { deps, app, admin, worker } = await setup();
    const before = list(deps.db, 'ekipa');
    const marek = before.find((r) => r.wartosc === 'ekipa Marek')!;
    const res = await put(app, 'ekipa', admin, [{ wartosc: 'ekipa Marek' }, { wartosc: 'ekipa Nowa' }]);
    expect(res.status).toBe(200);
    const after = list(deps.db, 'ekipa');
    expect(after.map((r) => r.wartosc)).toEqual(['ekipa Marek', 'ekipa Nowa']);
    expect(after[0]!.id).toBe(marek.id);
    const ch = (await (await app.request('/api/changes?since=0', { headers: { cookie: worker } })).json()) as any;
    expect(ch.changes.filter((c: any) => c.entity === 'dict').map((c: any) => c.action).sort()).toEqual(['create', 'delete', 'delete', 'update']);
    expect((await put(app, 'ekipa', admin, [{ wartosc: 'a' }, { wartosc: 'a' }])).status).toBe(400);
    expect((await put(app, 'nieznany', admin, [])).status).toBe(400);
  });
});
