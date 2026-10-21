import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { addUser, loginCookie, testDeps } from '../../test-utils.js';
import { modules } from '../index.js';
import { seedBase } from '../slowniki/seed.js';

async function setup() {
  const deps = testDeps({ now: () => new Date('2026-03-10T23:30:00Z') }); // 00:30 następnego dnia w Warszawie
  seedBase(deps.db);
  const app = createApp(deps, modules);
  const a = addUser(deps, { role: 'admin', name: 'Admin' });
  const w = addUser(deps);
  return { app, admin: await loginCookie(app, a.login), worker: await loginCookie(app, w.login) };
}
const req = (cookie: string, method: string, body?: unknown) =>
  ({ method, headers: { cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

describe('zadania', () => {
  it('pracownik nie widzi zadań ani zmian i nie pisze', async () => {
    const { app, admin, worker } = await setup();
    await app.request('/api/tasks', req(admin, 'POST', { tekst: 'Przegląd busa' }));
    expect((await app.request('/api/tasks', req(worker, 'GET'))).status).toBe(403);
    expect((await app.request('/api/tasks', req(worker, 'POST', { tekst: 'x' }))).status).toBe(403);
    expect(JSON.stringify(await (await app.request('/api/changes?since=0', req(worker, 'GET'))).json())).not.toContain('Przegląd');
  });

  it('cykliczne po Zrobione wraca do Do zrobienia, ostatnio = dziś; zwykłe zostaje', async () => {
    const { app, admin } = await setup();
    const cyc = await (await app.request('/api/tasks', req(admin, 'POST', { tekst: 'Przegląd', cykliczne: true, priorytet: 2, termin: '2026-03-20' }))).json();
    expect(cyc).toMatchObject({ status: 'Do zrobienia', priorytet: 2, termin: '2026-03-20', cykliczne: true });
    const r1 = await (await app.request(`/api/tasks/${cyc.id}`, req(admin, 'PUT', { status: 'Zrobione' }))).json();
    expect(r1).toMatchObject({ status: 'Do zrobienia', ostatnio: '2026-03-11' });
    const one = await (await app.request('/api/tasks', req(admin, 'POST', { tekst: 'Jednorazowe' }))).json();
    expect(one).toMatchObject({ priorytet: null, termin: null, cykliczne: false });
    const r2 = await (await app.request(`/api/tasks/${one.id}`, req(admin, 'PUT', { status: 'Zrobione' }))).json();
    expect(r2.status).toBe('Zrobione');
    expect((await app.request(`/api/tasks/${one.id}`, req(admin, 'PUT', { status: 'Bzdura' }))).status).toBe(400);
    expect((await app.request(`/api/tasks/${one.id}`, req(admin, 'DELETE'))).status).toBe(200);
    expect(await (await app.request('/api/tasks', req(admin, 'GET'))).json()).toHaveLength(1);
  });
});
