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
  return { deps, app, push, a, w, admin: await loginCookie(app, a.token), worker: await loginCookie(app, w.token), worker2: await loginCookie(app, w2.token) };
}
const req = (cookie: string, method: string, body?: unknown) =>
  ({ method, headers: { cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const pushed = (push: ReturnType<typeof vi.fn>) => push.mock.calls.map((c) => ({ endpoint: (c[0] as { endpoint: string }).endpoint, ...JSON.parse(c[1] as string) }));

describe('zakupy', () => {
  it('pracownik dodaje, admin dostaje push; wszyscy widzą', async () => {
    const { app, worker, worker2, push } = await setup();
    const row = await (await app.request('/api/shopping', req(worker, 'POST', { co: 'Taśma', sklep: 'OBI' }))).json();
    expect(row).toMatchObject({ co: 'Taśma', status: 'Do kupienia' });
    expect(pushed(push)).toEqual([expect.objectContaining({ endpoint: 'Admin', title: '🛒 Do kupienia: Taśma', url: `#zakupy~${row.id}` })]);
    expect(await (await app.request('/api/shopping', req(worker2, 'GET'))).json()).toHaveLength(1);
  });

  it('status i kwota: pracownik 403; admin Kupione -> push do autora', async () => {
    const { app, worker, admin, push, w } = await setup();
    const row = await (await app.request('/api/shopping', req(worker, 'POST', { co: 'Taśma' }))).json();
    expect((await app.request(`/api/shopping/${row.id}`, req(worker, 'PUT', { status: 'Kupione' }))).status).toBe(403);
    expect((await app.request(`/api/shopping/${row.id}`, req(worker, 'PUT', { kwotaGr: 100 }))).status).toBe(403);
    push.mockClear();
    const r = await app.request(`/api/shopping/${row.id}`, req(admin, 'PUT', { status: 'Kupione', kwotaGr: 1250 }));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ status: 'Kupione', kwotaGr: 1250 });
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
    const id2 = await mk();
    expect((await app.request(`/api/shopping/${id2}`, req(admin, 'DELETE'))).status).toBe(200);
    expect(await (await app.request('/api/shopping', req(admin, 'GET'))).json()).toEqual([]);
  });
});
