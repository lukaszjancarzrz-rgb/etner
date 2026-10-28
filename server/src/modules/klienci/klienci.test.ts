import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { addUser, loginCookie, testDeps } from '../../test-utils.js';
import { seedBase } from '../slowniki/seed.js';
import { modules } from '../index.js';
import { changesSince } from '../../core/changes.js';
import * as leady from '../leady/service.js';
import * as zadania from '../zadania/service.js';
import * as zlecenia from '../zlecenia/service.js';
import { create, get, getSite, merge, search, updateSite, addSite } from './service.js';

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
    const r3 = await (await app.request(`/api/clients/${a.client.id}`, json(admin, 'PUT', { emaile: [], telefony: ['727728903'] }))).json();
    expect(r3.duplicates).toEqual([]); // formularz wysyła te same telefony: bez zmian, bez ostrzeżenia
    const r4 = await (await app.request(`/api/clients/${a.client.id}`, json(admin, 'PUT', { telefony: ['727728903', '500500500'] }))).json();
    expect(r4.duplicates.map((d: { id: string }) => d.id)).toEqual([b.client.id]);
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

describe('klienci: łączenie duplikatów (R58)', () => {
  async function two() {
    const s = await setup();
    const { db, uid } = s;
    const main = create(db, uid, { ...base, nazwa: 'Jan Kowalski', telefony: ['727728903'], site: { nazwa: '', adres: 'Długa 5', miejscowosc: 'Zawoja', mapa: '', opis: '' } });
    const dup = create(db, uid, { ...base, nazwa: 'Kowalski Jan', telefony: ['+48 727 728 903', '600100100'], emaile: ['jan@x.pl'], nip: '123', notatki: 'z duplikatu', site: { nazwa: '', adres: 'Krótka 1', miejscowosc: 'Sucha', mapa: '', opis: '' } });
    const job = zlecenia.save(db, uid, { clientId: dup.client.id, siteId: dup.site!.id, status: 'Nowe' } as never)!;
    const lead = leady.save(db, uid, { clientId: dup.client.id, siteId: dup.site!.id, temat: 'Klima' } as never)!;
    const kontakt = leady.contact(db, uid, lead.id, 'Dzwonił', undefined, '2026-10-28')!.contact;
    const task = zadania.save(db, uid, { tekst: 'Oddzwonić', clientId: dup.client.id } as never, '2026-10-28')!;
    return { ...s, main: main.client, dup: dup.client, dupSite: dup.site!, job, lead, kontakt, task };
  }
  const mergeReq = (s: Awaited<ReturnType<typeof two>>, cookie: string, body: Record<string, unknown> = {}) =>
    s.app.request(`/api/clients/${s.main.id}/merge`, json(cookie, 'POST', { from: s.dup.id, ...body }));

  it('pracownik 403; sam ze sobą lub nieznany 404', async () => {
    const s = await two();
    expect((await mergeReq(s, s.worker)).status).toBe(403);
    expect((await s.app.request(`/api/clients/${s.main.id}/merge`, json(s.admin, 'POST', { from: s.main.id }))).status).toBe(404);
    expect((await s.app.request(`/api/clients/${s.main.id}/merge`, json(s.admin, 'POST', { from: 'nie-ma' }))).status).toBe(404);
    expect(get(s.db, s.dup.id)).toBeDefined();
  });

  it('zlecenia, leady (z kontaktami), zadania i obiekty przechodzą do głównego; pola uzupełnione; duplikat miękko usunięty; każdy wiersz w changes', async () => {
    const s = await two();
    const before = changesSince(s.db, 0, 10_000).length;
    const res = await mergeReq(s, s.admin, { opId: 'm1' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: s.main.id, nazwa: 'Jan Kowalski', telefony: ['727728903', '600100100'], emaile: ['jan@x.pl'], nip: '123', notatki: 'z duplikatu' });
    expect(zlecenia.get(s.db, s.job.id)).toMatchObject({ clientId: s.main.id, siteId: s.dupSite.id });
    expect(leady.get(s.db, s.lead.id)).toMatchObject({ clientId: s.main.id, siteId: s.dupSite.id });
    expect(leady.contactsOf(s.db, s.lead.id).map((c) => c.id)).toEqual([s.kontakt.id]); // kontakty idą z leadem
    expect(zadania.get(s.db, s.task.id)!.clientId).toBe(s.main.id);
    expect(getSite(s.db, s.dupSite.id)!.clientId).toBe(s.main.id);
    expect(get(s.db, s.dup.id)).toBeUndefined();
    expect(search(s.db, 'sucha').map((h) => h.id)).toEqual([s.main.id]);
    const ch = changesSince(s.db, 0, 10_000).slice(before).map((c) => `${c.entity}:${c.entityId}:${c.action}`).sort();
    expect(ch).toEqual([
      `clients:${s.dup.id}:delete`, `clients:${s.main.id}:update`, `jobs:${s.job.id}:update`,
      `leads:${s.lead.id}:update`, `sites:${s.dupSite.id}:update`, `tasks:${s.task.id}:update`,
    ].sort());

    // powtórka z kolejki (ten sam opId) i ponowne łączenie: 200 bez nowych zmian
    const n = changesSince(s.db, 0, 10_000).length;
    expect((await mergeReq(s, s.admin, { opId: 'm1' })).status).toBe(200);
    expect((await mergeReq(s, s.admin)).status).toBe(200);
    expect(changesSince(s.db, 0, 10_000)).toHaveLength(n);
  });

  it('błąd w środku: nic nie zmienione (jedna transakcja)', async () => {
    const s = await two();
    const n = changesSince(s.db, 0, 10_000).length;
    const boom = { count: () => 0, rename: () => { throw new Error('x'); } };
    expect(() => merge(s.db, s.uid, s.main.id, s.dup.id, [zlecenia.clientRefs, boom])).toThrow('x');
    expect(zlecenia.get(s.db, s.job.id)!.clientId).toBe(s.dup.id);
    expect(getSite(s.db, s.dupSite.id)!.clientId).toBe(s.dup.id);
    expect(get(s.db, s.dup.id)).toBeDefined();
    expect(changesSince(s.db, 0, 10_000)).toHaveLength(n);
  });
});
