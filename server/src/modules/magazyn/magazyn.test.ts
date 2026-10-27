import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { addUser, loginCookie, testDeps } from '../../test-utils.js';
import { modules } from '../index.js';
import { seedBase } from '../slowniki/seed.js';
import { magazyn } from './index.js';

async function setup() {
  const clock = { t: new Date('2026-10-20T10:00:00Z') };
  const deps = testDeps({ now: () => clock.t });
  seedBase(deps.db);
  const app = createApp(deps, modules);
  const a = addUser(deps, { role: 'admin', name: 'Admin' });
  const w = addUser(deps, { name: 'Pracownik' });
  const w2 = addUser(deps, { name: 'Drugi' });
  return { deps, app, clock, w, w2, admin: await loginCookie(app, a.login), worker: await loginCookie(app, w.login), worker2: await loginCookie(app, w2.login) };
}
const req = (cookie: string, method: string, body?: unknown) =>
  ({ method, headers: { cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body ?? {}) });

describe('magazyn', () => {
  it('dodaje każdy; Zabieram zapisuje kto i kiedy (idempotentnie), Zwracam z nową ilością', async () => {
    const { app, worker, worker2, w2 } = await setup();
    const it0 = await (await app.request('/api/warehouse', req(worker, 'POST', { opId: 'op-a', nazwa: 'Kołki 8 mm', ilosc: 'opakowanie' }))).json();
    expect(await (await app.request('/api/warehouse', req(worker, 'POST', { opId: 'op-a', nazwa: 'Kołki 8 mm', ilosc: 'opakowanie' }))).json()).toEqual(it0);
    expect((await app.request('/api/warehouse', req(worker, 'POST', { nazwa: ' ' }))).status).toBe(400);
    const taken = await (await app.request(`/api/warehouse/${it0.id}/take`, req(worker2, 'POST', { opId: 'op-t' }))).json();
    expect(taken).toMatchObject({ zabraneBy: w2.user.id, zabraneAt: expect.any(String) });
    expect(await (await app.request(`/api/warehouse/${it0.id}/take`, req(worker2, 'POST', { opId: 'op-t' }))).json()).toEqual(taken);
    expect(await (await app.request(`/api/warehouse/${it0.id}/take`, req(worker, 'POST', {}))).json()).toMatchObject({ zabraneBy: w2.user.id }); // już zabrane
    const back = await (await app.request(`/api/warehouse/${it0.id}/return`, req(worker, 'POST', { ilosc: 'pół opakowania' }))).json();
    expect(back).toMatchObject({ ilosc: 'pół opakowania', zabraneAt: null, zabraneBy: null });
    expect((await app.request('/api/warehouse/nie-ma/take', req(worker, 'POST', {}))).status).toBe(404);
    expect(await (await app.request('/api/warehouse', req(worker2, 'GET'))).json()).toHaveLength(1);
  });

  it('usuwa autor lub admin, inny pracownik 403; powtórka 200', async () => {
    const { app, admin, worker, worker2 } = await setup();
    const mk = async () => (await (await app.request('/api/warehouse', req(worker, 'POST', { nazwa: 'Taśma', ilosc: 'rolka' }))).json()).id;
    const id = await mk();
    expect((await app.request(`/api/warehouse/${id}`, req(worker2, 'DELETE'))).status).toBe(403);
    expect((await app.request(`/api/warehouse/${id}`, req(worker, 'DELETE'))).status).toBe(200);
    expect((await app.request(`/api/warehouse/${id}`, req(worker, 'DELETE'))).status).toBe(200);
    expect((await app.request(`/api/warehouse/${await mk()}`, req(admin, 'DELETE'))).status).toBe(200);
    expect(await (await app.request('/api/warehouse', req(admin, 'GET'))).json()).toEqual([]);
  });

  it('zadanie dzienne usuwa rzeczy zabrane ponad 7 dni temu (z wpisem w changes), młodsze i leżące zostają', async () => {
    const { app, deps, clock, worker } = await setup();
    const add = async (nazwa: string) => (await (await app.request('/api/warehouse', req(worker, 'POST', { nazwa }))).json()).id;
    const [old, young, lying] = [await add('Stare'), await add('Młode'), await add('Leży')];
    await app.request(`/api/warehouse/${old}/take`, req(worker, 'POST', {}));
    clock.t = new Date('2026-10-24T10:00:00Z');
    await app.request(`/api/warehouse/${young}/take`, req(worker, 'POST', {}));
    clock.t = new Date('2026-10-27T10:00:01Z'); // 7 dni i sekunda po pierwszym
    const def = magazyn.cron!.find((d) => d.name === 'magazyn-zabrane')!;
    expect(def.schedule).toBe('20 3 * * *');
    await def.run(deps);
    expect((await (await app.request('/api/warehouse', req(worker, 'GET'))).json()).map((r: { id: string }) => r.id).sort()).toEqual([young, lying].sort());
    expect(deps.db.$client.prepare("select action, user_id from changes where entity = 'warehouse_items' and entity_id = ? order by seq desc limit 1").get(old)).toEqual({ action: 'delete', user_id: null });
    expect((await app.request(`/api/warehouse/${old}`, req(worker, 'DELETE'))).status).toBe(200); // usunięcie z kolejki po sprzątaniu
  });
});
