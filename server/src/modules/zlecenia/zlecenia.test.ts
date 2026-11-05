import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import { addUser, loginCookie, testDeps } from '../../test-utils.js';
import { pushSubscriptions } from '../../core/schema-base.js';
import { newId } from '@etner/shared';
import { seedBase } from '../slowniki/seed.js';
import { modules } from '../index.js';
import { addSite, create as newClient } from '../klienci/service.js';
import { active, forSite, get, jobLabel } from './service.js';

async function setup() {
  const push = vi.fn(async () => ({ statusCode: 201 }));
  const deps = testDeps({ push });
  seedBase(deps.db);
  const app = createApp(deps, modules);
  const a = addUser(deps, { role: 'admin', name: 'Admin' });
  const b1 = addUser(deps, { ekipa: 'ekipa Bartek', name: 'B1' });
  const b2 = addUser(deps, { ekipa: 'ekipa Bartek', name: 'B2' });
  const w = addUser(deps);
  const now = new Date().toISOString();
  for (const u of [a, b1, b2]) // jedna subskrypcja na osobę; endpoint = id użytkownika
    deps.db.insert(pushSubscriptions).values({ id: newId(), userId: u.user.id, endpoint: u.user.id, p256dh: 'p', auth: 'a', createdAt: now, updatedAt: now }).run();
  const k = newClient(deps.db, a.user.id, { typ: 'osoba', nazwa: 'Kowalski', telefony: [], emaile: [], nip: '', notatki: '', site: { nazwa: '', adres: 'Długa 5', miejscowosc: 'Zawoja', mapa: '', opis: '' } });
  return { deps, app, push, a, b1, b2, k, admin: await loginCookie(app, a.login), worker: await loginCookie(app, w.login) };
}
const req = (cookie: string, method: string, body?: unknown) =>
  ({ method, headers: { cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const feed = async (app: any, cookie: string) => (await (await app.request('/api/changes?since=0', req(cookie, 'GET'))).json()).changes as any[];

describe('zlecenia', () => {
  it('jobLabel: nazwisko osoby lub nazwa firmy – miejscowość, numer gdy się mieści, bez klienta sam numer', async () => {
    const { deps, a, k } = await setup();
    const f = newClient(deps.db, a.user.id, { typ: 'firma', nazwa: 'Pensjonat Pod Babią Górą Sp. z o.o.', telefony: [], emaile: [], nip: '', notatki: '', site: { nazwa: '', adres: '', miejscowosc: 'Zawoja Markowa', mapa: '', opis: '' } });
    expect(jobLabel(deps.db, { numer: 'Z0012', clientId: k.client.id, siteId: k.site!.id })).toBe('Kowalski – Zawoja (Z0012)');
    expect(jobLabel(deps.db, { numer: 'Z0012', clientId: k.client.id, siteId: null })).toBe('Kowalski (Z0012)');
    expect(jobLabel(deps.db, { numer: 'Z0012', clientId: f.client.id, siteId: f.site!.id })).toBe('Pensjonat Pod Babią Górą Sp. z o.o. – Zawoja Markowa');
    expect(jobLabel(deps.db, { numer: 'Z0012', clientId: 'nie-ma', siteId: null })).toBe('Z0012');
  });

  it('numeracja Z0001, Z0002; zamkniete_at wg grupy statusu', async () => {
    const { app, admin, k } = await setup();
    const post = async (b: object) => (await app.request('/api/jobs', req(admin, 'POST', { clientId: k.client.id, status: 'Nowe', ...b }))).json();
    const j1 = await post({});
    const j2 = await post({});
    expect([j1.numer, j2.numer]).toEqual(['Z0001', 'Z0002']);
    const put = async (status: string) => (await app.request(`/api/jobs/${j1.id}`, req(admin, 'PUT', { status }))).json();
    expect((await put('Rozliczone')).zamknieteAt).toBeTruthy();
    expect((await put('W realizacji')).zamknieteAt).toBeNull();
    expect((await app.request('/api/jobs', req(admin, 'POST', { clientId: k.client.id, status: 'Bzdura' }))).status).toBe(400);
  });

  it('powiadomienia: ekipa bez autora, mieszane i ta sama ekipa bez', async () => {
    const { app, admin, push, k, a, b1, b2 } = await setup();
    const post = async (b: object) => (await app.request('/api/jobs', req(admin, 'POST', { clientId: k.client.id, siteId: k.site!.id, status: 'Nowe', ...b }))).json();
    const j = await post({ ekipa: 'ekipa Bartek' });
    expect(push).toHaveBeenCalledTimes(2);
    const eps = push.mock.calls.map((c: any) => c[0].endpoint).sort();
    expect(eps).toEqual([b1.user.id, b2.user.id].sort());
    expect(eps).not.toContain(a.user.id);
    const n = JSON.parse((push.mock.calls[0] as any)[1]);
    expect(n).toMatchObject({ title: '🆕 Nowe zlecenie: Kowalski – Zawoja (Z0001)', url: `#zl/${j.id}`, body: 'Kowalski, Długa 5 Zawoja' });
    push.mockClear();
    await post({ ekipa: 'mieszane' });
    await app.request(`/api/jobs/${j.id}`, req(admin, 'PUT', { ekipa: 'ekipa Bartek', zakres: 'x' }));
    expect(push).not.toHaveBeenCalled();
    await app.request(`/api/jobs/${j.id}`, req(admin, 'PUT', { ekipa: 'ekipa Marek' })); // nikt w ekipie Marek
    await app.request(`/api/jobs/${j.id}`, req(admin, 'PUT', { ekipa: 'ekipa Bartek' }));
    expect(JSON.parse((push.mock.calls[0] as any)[1]).title).toBe('🛠️ Zlecenie dla Twojej ekipy: Kowalski – Zawoja (Z0001)');
  });

  it('brak pusha dla wycofanego zapisu', async () => {
    const { app, admin, push, k } = await setup();
    const res = await app.request('/api/jobs', req(admin, 'POST', { clientId: k.client.id, status: 'Nowe', ekipa: 'ekipa Bartek', siteId: 'nie-moj' }));
    expect(res.status).toBe(400);
    expect(push).not.toHaveBeenCalled();
  });

  it('pracownik: bez uwagi admina i leada w GET, liście i zmianach; kopia nie rusza oryginału', async () => {
    const { app, admin, worker, deps, k } = await setup();
    const j = await (await app.request('/api/jobs', req(admin, 'POST', { clientId: k.client.id, status: 'Nowe', uwagiAdmin: 'tajne-uwagi', leadId: 'lead-1', zakres: 'montaż' }))).json();
    for (const url of [`/api/jobs/${j.id}`, '/api/jobs', '/api/changes?since=0', '/api/snapshot']) {
      const txt = await (await app.request(url, req(worker, 'GET'))).text();
      expect(txt).not.toMatch(/tajne-uwagi|lead-1|uwagiAdmin|leadId/);
    }
    expect((await (await app.request(`/api/jobs/${j.id}`, req(worker, 'GET'))).json()).zakres).toBe('montaż');
    expect(await (await app.request(`/api/jobs/${j.id}`, req(admin, 'GET'))).json()).toMatchObject({ uwagiAdmin: 'tajne-uwagi', leadId: 'lead-1' });
    expect(get(deps.db, j.id)!.uwagiAdmin).toBe('tajne-uwagi');
  });

  it('R18: pracownik dostaje klienta i obiekt (przycięte) po utworzeniu zlecenia', async () => {
    const { app, admin, worker, k } = await setup();
    const ids = async () => (await feed(app, worker)).filter((c) => c.entity === 'clients' || c.entity === 'sites');
    expect(await ids()).toEqual([]);
    await app.request('/api/jobs', req(admin, 'POST', { clientId: k.client.id, siteId: k.site!.id, status: 'Nowe' }));
    const out = await ids();
    expect([...new Set(out.map((c) => c.entity))].sort()).toEqual(['clients', 'sites']); // create z kroku klienci + ponowna emisja
    expect(Object.keys(out.find((c) => c.entity === 'clients').data).sort()).toEqual(['id', 'nazwa', 'telefony']);
  });

  it('newClient + newSite zakładają klienta i obiekt; active i forSite', async () => {
    const { app, admin, deps } = await setup();
    const j = await (await app.request('/api/jobs', req(admin, 'POST', {
      newClient: { nazwa: 'Nowak', typ: 'osoba' }, newSite: { miejscowosc: 'Żywiec' }, status: 'Nowe',
    }))).json();
    const w = await (await app.request(`/api/clients/${j.clientId}`, req(admin, 'GET'))).json();
    expect(w.client.nazwa).toBe('Nowak');
    expect(w.sites).toHaveLength(1);
    expect(j.siteId).toBe(w.sites[0].id);
    expect(addSite(deps.db, j.createdBy, j.clientId, { adres: 'A', miejscowosc: undefined })!.miejscowosc).toBe(''); // undefined nie nadpisuje domyślnych
    expect(forSite(deps.db, j.siteId).map((x) => x.id)).toEqual([j.id]);
    expect(active(deps.db)).toEqual([{ id: j.id, numer: 'Z0001', klient: 'Nowak', miejscowosc: 'Żywiec', status: 'Nowe' }]);
    await app.request(`/api/jobs/${j.id}`, req(admin, 'PUT', { status: 'Zakończone' }));
    expect(active(deps.db)).toEqual([]);
  });

  it('częściowy PUT nie kasuje pól; błąd pusha nie psuje zapisu', async () => {
    const { app, admin, push, k, deps } = await setup();
    const j = await (await app.request('/api/jobs', req(admin, 'POST', { clientId: k.client.id, status: 'Nowe', zakres: 'montaż', uwagiAdmin: 'u', rodzaj: 'serwis', kategoria: 'Inne' }))).json();
    const r = await (await app.request(`/api/jobs/${j.id}`, req(admin, 'PUT', { status: 'W realizacji' }))).json();
    expect(r).toMatchObject({ zakres: 'montaż', uwagiAdmin: 'u', rodzaj: 'serwis', kategoria: 'Inne' });
    push.mockRejectedValue(new Error('boom'));
    const res = await app.request(`/api/jobs/${j.id}`, req(admin, 'PUT', { ekipa: 'ekipa Bartek' }));
    expect(res.status).toBe(200);
    expect(get(deps.db, j.id)!.ekipa).toBe('ekipa Bartek');
  });

  it('pracownik POST/PUT -> 403', async () => {
    const { app, worker, k } = await setup();
    expect((await app.request('/api/jobs', req(worker, 'POST', { clientId: k.client.id, status: 'Nowe' }))).status).toBe(403);
    expect((await app.request('/api/jobs/x', req(worker, 'PUT', { status: 'Nowe' }))).status).toBe(403);
  });
});
