import { describe, expect, it, vi } from 'vitest';
import { newId } from '@etner/shared';
import { createApp } from '../../app.js';
import { pushSubscriptions } from '../../core/schema-base.js';
import { addUser, loginCookie, testDeps } from '../../test-utils.js';
import { modules } from '../index.js';
import { seedBase } from '../slowniki/seed.js';

async function setup() {
  const push = vi.fn(async (_s: unknown, _p: string) => ({ statusCode: 201 }));
  const deps = testDeps({ push, now: () => new Date('2026-03-10T10:00:00Z') });
  seedBase(deps.db);
  const app = createApp(deps, modules);
  const a = addUser(deps, { role: 'admin', name: 'Admin' });
  const w = addUser(deps, { name: 'Pracownik' });
  const w2 = addUser(deps, { name: 'Drugi' });
  const t = new Date().toISOString();
  for (const u of [a, w, w2]) deps.db.insert(pushSubscriptions).values({ id: newId(), userId: u.user.id, endpoint: u.user.name, p256dh: 'p', auth: 'a', createdAt: t, updatedAt: t }).run();
  return { deps, app, push, a, w, admin: await loginCookie(app, a.login), worker: await loginCookie(app, w.login), worker2: await loginCookie(app, w2.login) };
}
const req = (cookie: string, method: string, body?: unknown) =>
  ({ method, headers: { cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const pushed = (push: ReturnType<typeof vi.fn>) => push.mock.calls.map((c) => ({ endpoint: (c[0] as { endpoint: string }).endpoint, ...JSON.parse(c[1] as string) }));

describe('zakupy', () => {
  it('pracownik dodaje, admin dostaje push; wszyscy widzą', async () => {
    const { app, worker, worker2, push } = await setup();
    const row = await (await app.request('/api/shopping', req(worker, 'POST', { co: 'Taśma', uwagi: 'OBI' }))).json();
    expect(row).toMatchObject({ co: 'Taśma', status: 'Do kupienia' });
    expect(pushed(push)).toEqual([expect.objectContaining({ endpoint: 'Admin', title: '🛒 Do kupienia: Taśma', url: `#zakupy~${row.id}` })]);
    expect(await (await app.request('/api/shopping', req(worker2, 'GET'))).json()).toHaveLength(1);
  });

  it('status: pracownik 403; admin Kupione -> push do autora', async () => {
    const { app, worker, admin, push, w } = await setup();
    const row = await (await app.request('/api/shopping', req(worker, 'POST', { co: 'Taśma' }))).json();
    expect((await app.request(`/api/shopping/${row.id}`, req(worker, 'PUT', { status: 'Kupione' }))).status).toBe(403);
    push.mockClear();
    const r = await app.request(`/api/shopping/${row.id}`, req(admin, 'PUT', { status: 'Kupione' }));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ status: 'Kupione' });
    const p = pushed(push);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ endpoint: 'Pracownik', title: '🛒 Kupione: Taśma' });
    expect((await (await app.request('/api/shopping', req(admin, 'GET'))).json())[0].kupioneBy).toBeTruthy();
    expect(w.user.id).toBeTruthy();
  });

  it('usuwa autor lub admin, inny pracownik 403', async () => {
    const { app, worker, worker2, admin } = await setup();
    const mk = async () => (await (await app.request('/api/shopping', req(worker, 'POST', { co: 'X' }))).json()).id;
    const id = await mk();
    expect((await app.request(`/api/shopping/${id}`, req(worker2, 'DELETE'))).status).toBe(403);
    expect((await app.request(`/api/shopping/${id}`, req(worker, 'DELETE'))).status).toBe(200);
    expect((await app.request(`/api/shopping/${id}`, req(worker, 'DELETE'))).status).toBe(200); // powtórka: już usunięte
    expect((await app.request('/api/shopping/nie-ma', req(worker, 'DELETE'))).status).toBe(404);
    const id2 = await mk();
    expect((await app.request(`/api/shopping/${id2}`, req(admin, 'DELETE'))).status).toBe(200);
    expect(await (await app.request('/api/shopping', req(admin, 'GET'))).json()).toEqual([]);
  });

  it('pozycja to co + uwagi; dwa statusy, inne odrzucone', async () => {
    const { app, admin, deps } = await setup();
    const row = await (await app.request('/api/shopping', req(admin, 'POST', { co: 'Kołki', uwagi: '8 mm', sklep: 'OBI', kwotaGr: 5 }))).json();
    for (const k of ['sklep', 'grupa', 'kwotaGr']) expect(row).not.toHaveProperty(k);
    expect(row).toMatchObject({ co: 'Kołki', uwagi: '8 mm' });
    const st = deps.db.$client.prepare("select wartosc from dict where rodzaj = 'status_zakupu' and deleted_at is null order by kolejnosc").all();
    expect(st).toEqual([{ wartosc: 'Do kupienia' }, { wartosc: 'Kupione' }]);
    expect(deps.db.$client.prepare("select count(*) n from dict where rodzaj = 'grupa_zakupow'").get()).toEqual({ n: 0 });
    expect((await app.request(`/api/shopping/${row.id}`, req(admin, 'PUT', { status: 'Zamówione' }))).status).toBe(400);
  });
});
