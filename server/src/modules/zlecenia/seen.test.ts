import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { addUser, loginCookie, testDeps } from '../../test-utils.js';
import { seedBase } from '../slowniki/seed.js';
import { modules } from '../index.js';
import { create as newClient } from '../klienci/service.js';

async function setup() {
  const deps = testDeps();
  seedBase(deps.db);
  const app = createApp(deps, modules);
  const a = addUser(deps, { role: 'admin', name: 'A' });
  const b = addUser(deps, { role: 'admin', name: 'B' });
  const w = addUser(deps, { name: 'W' });
  const k = newClient(deps.db, a.user.id, { typ: 'osoba', nazwa: 'Nowak', telefony: ['111'], emaile: [], nip: '', notatki: '', site: { nazwa: '', adres: 'Krótka 1', miejscowosc: 'Zawoja', mapa: '', opis: '' } });
  const A = await loginCookie(app, a.login), B = await loginCookie(app, b.login), W = await loginCookie(app, w.login);
  const call = async (cookie: string, method: string, url: string, body?: unknown) => {
    const r = await app.request(url, { method, headers: { cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, json: await r.json().catch(() => null) as any };
  };
  const job = (await call(A, 'POST', '/api/jobs', { clientId: k.client.id, siteId: k.site!.id, status: 'Nowe' })).json;
  return { deps, app, a, b, w, k, A, B, W, call, job };
}
const seenRows = async (call: any, cookie: string) => ((await call(cookie, 'GET', '/api/changes?since=0')).json.changes as any[]).filter((c) => c.entity === 'job_seen').map((c) => c.data);

describe('widziane i zmiany pól (Task 26)', () => {
  it('POST /api/seen: tylko własne wiersze w synchronizacji, tylko rośnie, bez przyszłości i nieznanych zleceń, baza raz', async () => {
    const { a, w, A, W, call, job } = await setup();
    const t1 = '2026-10-01T10:00:00Z', t0 = '2026-09-01T10:00:00.000Z';
    expect((await call(A, 'POST', '/api/seen', { jobs: { [job.id]: t1, 'nie-ma': t1 }, base: t0 })).status).toBe(200);
    await call(A, 'POST', '/api/seen', { jobs: { [job.id]: t0 }, base: '2026-10-20T00:00:00Z' }); // starsze nie cofa, baza zostaje
    await call(W, 'POST', '/api/seen', { jobs: { [job.id]: '2999-01-01T00:00:00Z' } });
    const last = (rows: any[]) => Object.fromEntries(rows.map((r) => [r.jobId, r.seenAt]));
    const mine = await seenRows(call, A);
    expect(mine.every((r) => r.userId === a.user.id)).toBe(true);
    expect(last(mine)).toEqual({ [job.id]: '2026-10-01T10:00:00.000Z', '*': t0 });
    const ws = last(await seenRows(call, W));
    expect(ws[job.id]! <= new Date().toISOString()).toBe(true);
    expect(Date.parse(ws['*']!)).toBeLessThan(Date.now() - 2.9 * 864e5); // bez podpowiedzi: 3 dni wstecz
    expect((await seenRows(call, W)).every((r) => r.userId === w.user.id)).toBe(true);
    // snapshot: też tylko własne
    const snap = (await call(W, 'GET', '/api/snapshot')).json.records.filter((r: any) => r.entity === 'job_seen');
    expect(snap.length).toBe(2);
    expect(snap.every((r: any) => r.data.userId === w.user.id)).toBe(true);
    expect((await call(A, 'POST', '/api/seen', { jobs: { [job.id]: 'wczoraj' } })).status).toBe(400);
  });

  it('GET /zmiany: pola zmienione przez innych od since; własne pominięte; pracownik bez uwag admina i pól klienta ukrytych', async () => {
    const { k, A, B, W, call, job } = await setup();
    const since = new Date().toISOString();
    await new Promise((r) => setTimeout(r, 5));
    await call(A, 'PUT', `/api/jobs/${job.id}`, { status: 'W realizacji', uwagiAdmin: 'tajne' });
    await call(A, 'PUT', `/api/clients/${k.client.id}`, { telefony: ['111', '222'], notatki: 'tajne', nip: '123' });
    await call(A, 'PUT', `/api/sites/${k.site!.id}`, { adres: 'Długa 2' });
    const z = async (c: string) => (await call(c, 'GET', `/api/jobs/${job.id}/zmiany?since=${encodeURIComponent(since)}`)).json;
    const b = await z(B);
    expect(b.jobs.sort()).toEqual(['status', 'uwagiAdmin']);
    expect(b.clients.sort()).toEqual(['nip', 'notatki', 'telefony']);
    expect(b.sites).toEqual(['adres']);
    expect(await z(A)).toEqual({ jobs: [], clients: [], sites: [] });
    const wk = await z(W);
    expect(wk.jobs).toEqual(['status']);
    expect(wk.clients).toEqual(['telefony']);
    expect(wk.sites).toEqual(['adres']);
    // B przywraca status sprzed since: pole nie jest już nowe dla nikogo
    await call(B, 'PUT', `/api/jobs/${job.id}`, { status: 'Nowe' });
    expect((await z(B)).jobs).toEqual(['uwagiAdmin']);
    expect((await z(W)).jobs).toEqual([]);
    expect((await call(B, 'GET', `/api/jobs/${job.id}/zmiany?since=x`)).status).toBe(400);
    expect((await call(B, 'GET', `/api/jobs/nie-ma/zmiany?since=${since}`)).status).toBe(404);
  });
});
