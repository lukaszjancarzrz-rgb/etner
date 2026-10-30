import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { addUser, loginCookie, testDeps } from '../../test-utils.js';
import { modules } from '../index.js';
import { seedBase } from '../slowniki/seed.js';
import { create as newClient } from '../klienci/service.js';
import { clients } from '../klienci/schema.js';
import { eq } from 'drizzle-orm';

async function setup() {
  const deps = testDeps({ now: () => new Date('2026-03-10T23:30:00Z') }); // 00:30 następnego dnia w Warszawie
  seedBase(deps.db);
  const app = createApp(deps, modules);
  const a = addUser(deps, { role: 'admin', name: 'Admin' });
  const w = addUser(deps);
  return { deps, a, app, admin: await loginCookie(app, a.login), worker: await loginCookie(app, w.login) };
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
  it('cykl: po Zrobione termin = dziś + cykl (koniec miesiąca); bez cyklu termin bez zmian', async () => {
    const { app, admin } = await setup(); // dziś w Warszawie: 2026-03-11
    const mk = async (cykl: string | null) => (await app.request('/api/tasks', req(admin, 'POST', { tekst: `T ${cykl}`, cykliczne: true, cykl, termin: '2026-03-01' }))).json();
    const done = async (id: string) => (await app.request(`/api/tasks/${id}`, req(admin, 'PUT', { status: 'Zrobione' }))).json();
    const want: Record<string, string> = { '1t': '2026-03-18', '2t': '2026-03-25', '1m': '2026-04-11', '3m': '2026-06-11', '6m': '2026-09-11', '1r': '2027-03-11' };
    for (const [c, t] of Object.entries(want)) expect(await done((await mk(c)).id)).toMatchObject({ status: 'Do zrobienia', ostatnio: '2026-03-11', termin: t, cykl: c });
    expect(await done((await mk(null)).id)).toMatchObject({ termin: '2026-03-01', ostatnio: '2026-03-11' });
    expect((await app.request('/api/tasks', req(admin, 'POST', { tekst: 'x', cykl: '5d' }))).status).toBe(400);
  });
  it('client_id: zapis, czyszczenie, nieznany klient 400', async () => {
    const { app, admin, deps, a } = await setup();
    const k = newClient(deps.db, a.user.id, { typ: 'osoba', nazwa: 'Nowak', telefony: [], emaile: [], nip: '', notatki: '' });
    const t = await (await app.request('/api/tasks', req(admin, 'POST', { tekst: 'Faktura', clientId: k.client.id }))).json();
    expect(t.clientId).toBe(k.client.id);
    expect((await (await app.request(`/api/tasks/${t.id}`, req(admin, 'PUT', { clientId: null }))).json()).clientId).toBeNull();
    expect((await app.request(`/api/tasks/${t.id}`, req(admin, 'PUT', { clientId: 'brak' }))).status).toBe(400);
    // klient usunięty po przypisaniu: zadanie nadal da się zapisać
    await app.request(`/api/tasks/${t.id}`, req(admin, 'PUT', { clientId: k.client.id }));
    deps.db.update(clients).set({ deletedAt: new Date().toISOString() }).where(eq(clients.id, k.client.id)).run();
    expect((await app.request(`/api/tasks/${t.id}`, req(admin, 'PUT', { tekst: 'Faktura 2', clientId: k.client.id }))).status).toBe(200);
    expect((await app.request(`/api/tasks/${t.id}`, req(admin, 'DELETE'))).status).toBe(200);
    expect((await app.request(`/api/tasks/${t.id}`, req(admin, 'DELETE'))).status).toBe(200); // powtórka
    expect((await app.request('/api/tasks/brak', req(admin, 'DELETE'))).status).toBe(404);
  });
});
