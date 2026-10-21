import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { addUser, loginCookie, testDeps } from '../../test-utils.js';
import { seedBase } from '../slowniki/seed.js';
import { modules } from '../index.js';
import { create, search, updateSite, addSite } from './service.js';

async function setup(clientHasJobs?: (id: string) => boolean) {
  const deps = testDeps({ clientHasJobs });
  seedBase(deps.db);
  const app = createApp(deps, modules);
  const a = addUser(deps, { role: 'admin' });
  const w = addUser(deps);
  return { deps, db: deps.db, app, uid: a.user.id, admin: await loginCookie(app, a.login), worker: await loginCookie(app, w.login) };
}
const json = (cookie: string, method: string, body?: unknown) =>
  ({ method, headers: { cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const base = { typ: 'osoba' as const, telefony: [], emaile: [], nip: '', notatki: '' };

describe('klienci: wyszukiwanie', () => {
  it('nazwa, telefon (cyfry), miejscowość obiektu, diakrytyki', async () => {
    const { db, uid } = await setup();
    const k = create(db, uid, { ...base, nazwa: 'Jan Kowalski', telefony: ['+48 727 728 903'], site: { nazwa: '', adres: 'Długa 5', miejscowosc: 'Zawoja', mapa: '', opis: '' } });
    create(db, uid, { ...base, nazwa: 'Bańka Sp. z o.o.', typ: 'firma' });
    expect(search(db, 'kowal').map((h) => h.id)).toEqual([k.client.id]);
    expect(search(db, '727 728').map((h) => h.id)).toEqual([k.client.id]);
    expect(search(db, 'zawoja').map((h) => h.id)).toEqual([k.client.id]);
    expect(search(db, 'Bańka')).toHaveLength(1);
    expect(search(db, 'Bańka')).toEqual(search(db, 'banka'));
    expect(search(db, '%')).toEqual([]);
    updateSite(db, uid, k.site!.id, { miejscowosc: 'Żywiec' });
    expect(search(db, 'zawoja')).toEqual([]);
    expect(search(db, 'zywiec')).toHaveLength(1);
    addSite(db, uid, k.client.id, { miejscowosc: 'Łodygowice' });
    expect(search(db, 'lodygowice')).toHaveLength(1);
  });

  it('duplikaty po telefonie i e-mailu', async () => {
    const { db, uid } = await setup();
    create(db, uid, { ...base, nazwa: 'A', telefony: ['727728903'], emaile: ['A@x.pl'] });
    expect(create(db, uid, { ...base, nazwa: 'B', telefony: ['727 728 903'] }).duplicates).toHaveLength(1);
    expect(create(db, uid, { ...base, nazwa: 'C', emaile: ['a@X.pl'] }).duplicates).toHaveLength(1);
    expect(create(db, uid, { ...base, nazwa: 'D' }).duplicates).toHaveLength(0);
  });
});

describe('klienci: edycja', () => {
  it('PUT /api/clients/:id zwraca innych klientów z tym samym telefonem (bez samego siebie)', async () => {
    const { app, admin, db, uid } = await setup();
    const a = create(db, uid, { ...base, nazwa: 'A', telefony: ['727728903'] });
    const b = create(db, uid, { ...base, nazwa: 'B', telefony: ['600100100'] });
    const r = await (await app.request(`/api/clients/${b.client.id}`, json(admin, 'PUT', { telefony: ['600100100', '+48 727 728 903'] }))).json();
    expect(r).toMatchObject({ id: b.client.id, telefony: ['600100100', '+48 727 728 903'] });
    expect(r.duplicates.map((d: { id: string }) => d.id)).toEqual([a.client.id]);
    const r2 = await (await app.request(`/api/clients/${a.client.id}`, json(admin, 'PUT', { nazwa: 'A2' }))).json();
    expect(r2.duplicates).toEqual([]); // bez telefonów i e-maili w zmianie: bez ostrzeżenia
    const r3 = await (await app.request(`/api/clients/${a.client.id}`, json(admin, 'PUT', { emaile: [] }))).json();
    expect(r3.duplicates.map((d: { id: string }) => d.id)).toEqual([b.client.id]);
  });
});

describe('klienci: częściowa zmiana obiektu', () => {
  it('PUT /api/sites bez pól nie kasuje pozostałych', async () => {
    const { app, admin, db, uid } = await setup();
    const k = create(db, uid, { ...base, nazwa: 'A', site: { nazwa: 'Dom', adres: 'Długa 5', miejscowosc: 'Zawoja', mapa: 'm', opis: 'o' } });
    const r = await (await app.request(`/api/sites/${k.site!.id}`, json(admin, 'PUT', { miejscowosc: 'Żywiec' }))).json();
    expect(r).toMatchObject({ nazwa: 'Dom', adres: 'Długa 5', miejscowosc: 'Żywiec', mapa: 'm', opis: 'o' });
  });
});

describe('klienci: trasy i widoczność', () => {
  it('pracownik nie wyszukuje; admin tworzy przez opId raz', async () => {
    const { app, admin, worker, db } = await setup();
    expect((await app.request('/api/clients?q=a', json(worker, 'GET'))).status).toBe(403);
    const body = { opId: 'op-1', ...base, nazwa: 'Kowalski' };
    const r1 = await (await app.request('/api/clients', json(admin, 'POST', body))).json();
    await app.request('/api/clients', json(admin, 'POST', body));
    expect(search(db, 'kowalski')).toHaveLength(1);
    expect(r1.client.nazwa).toBe('Kowalski');
    const res = await app.request('/api/clients', json(admin, 'POST', { ...base, nazwa: '' }));
    expect(res.status).toBe(400);
  });

  it('pracownik: bez zmian dopóki brak zleceń, potem tylko przycięte pola', async () => {
    let has = false;
    const { app, admin, worker, db, uid } = await setup(() => has);
    const k = create(db, uid, { ...base, nazwa: 'Kowalski', telefony: ['111222333'], nip: '123', notatki: 'tajne', site: { nazwa: 'Dom', adres: 'Długa 5', miejscowosc: 'Zawoja', mapa: 'm', opis: 'o' } });
    const feed = async () => (await (await app.request('/api/changes?since=0', json(worker, 'GET'))).json()).changes as any[];
    expect((await feed()).filter((c) => c.entity === 'clients' || c.entity === 'sites')).toEqual([]);
    expect((await app.request(`/api/clients/${k.client.id}`, json(worker, 'GET'))).status).toBe(404);
    has = true;
    const out = (await feed()).filter((c) => c.entity === 'clients' || c.entity === 'sites');
    expect(out).toHaveLength(2);
    expect(Object.keys(out.find((c) => c.entity === 'clients').data).sort()).toEqual(['id', 'nazwa', 'telefony']);
    expect(JSON.stringify(out)).not.toMatch(/123|tajne/);
    expect(out.find((c) => c.entity === 'sites').data.clientId).toBe(k.client.id);
    const w = await (await app.request(`/api/clients/${k.client.id}`, json(worker, 'GET'))).json();
    expect(w).toMatchObject({ nazwa: 'Kowalski', telefony: ['111222333'], site: { miejscowosc: 'Zawoja' } });
    expect(w.nip).toBeUndefined();
    const full = await (await app.request(`/api/clients/${k.client.id}`, json(admin, 'GET'))).json();
    expect(full.client.nip).toBe('123');
    expect(full.sites).toHaveLength(1);
    const snap = (await (await app.request('/api/snapshot', json(worker, 'GET'))).json()).records as any[];
    expect(JSON.stringify(snap.filter((r) => r.entity === 'clients'))).not.toMatch(/tajne/);
  });
});
