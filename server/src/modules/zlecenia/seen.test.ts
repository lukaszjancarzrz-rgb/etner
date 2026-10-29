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

  it('limity: 2001 zleceń = 400, przesunięcie poniżej minuty nie zapisuje, usunięte zlecenie pominięte', async () => {
    const { deps, A, call, job } = await setup();
    const many = Object.fromEntries(Array.from({ length: 2001 }, (_, i) => [`j${i}`, '2026-10-01T10:00:00Z']));
    expect((await call(A, 'POST', '/api/seen', { jobs: many })).status).toBe(400);
    await call(A, 'POST', '/api/seen', { jobs: { [job.id]: '2026-10-01T10:00:00Z' } });
    await call(A, 'POST', '/api/seen', { jobs: { [job.id]: '2026-10-01T10:00:59Z' } });
    let rows = (await seenRows(call, A)).filter((r) => r.jobId === job.id);
    expect(rows.map((r) => r.seenAt)).toEqual(['2026-10-01T10:00:00.000Z']);
    await call(A, 'POST', '/api/seen', { jobs: { [job.id]: '2026-10-01T10:01:00Z' } });
    rows = (await seenRows(call, A)).filter((r) => r.jobId === job.id);
    expect(rows.at(-1)!.seenAt).toBe('2026-10-01T10:01:00.000Z');
    const { jobs } = await import('./schema.js');
    const { eq } = await import('drizzle-orm');
    deps.db.update(jobs).set({ deletedAt: new Date().toISOString() }).where(eq(jobs.id, job.id)).run();
    await call(A, 'POST', '/api/seen', { jobs: { [job.id]: '2026-10-02T10:00:00Z' } });
    expect((await seenRows(call, A)).filter((r) => r.jobId === job.id).at(-1)!.seenAt).toBe('2026-10-01T10:01:00.000Z');
  });

  it('GET /zmiany liczy od własnego wiersza „widziane” na serwerze, nie od chwili z telefonu', async () => {
    const { A, B, call, job } = await setup();
    await call(A, 'PUT', `/api/jobs/${job.id}`, { status: 'W realizacji' });
    const z = async (since: string) => (await call(B, 'GET', `/api/jobs/${job.id}/zmiany?since=${encodeURIComponent(since)}`)).json.jobs;
    expect(await z('2000-01-01T00:00:00Z')).toEqual(['status']);
    await call(B, 'POST', '/api/seen', { jobs: { [job.id]: new Date().toISOString() } }); // B obejrzał po zmianie
    expect(await z('2000-01-01T00:00:00Z')).toEqual([]); // zegar telefonu cofnięty: i tak nic nowego
  });

  it('strumień SSE: „widziane” dochodzą tylko do właściciela', async () => {
    const { app, A, B, call, job } = await setup();
    const open = async (cookie: string) => {
      const res = await app.request('/api/stream?since=0', { headers: { cookie } });
      const reader = res.body!.getReader();
      let buf = '';
      return {
        async seen(): Promise<any> {
          for (;;) {
            for (const m of buf.matchAll(/data: (\{.*\})\n/g)) { const d = JSON.parse(m[1]!); if (d.entity === 'job_seen') { buf = ''; return d; } }
            const { value, done } = await reader.read();
            if (done) throw new Error('koniec');
            buf += new TextDecoder().decode(value);
          }
        },
        close: () => reader.cancel(),
      };
    };
    const sa = await open(A), sb = await open(B);
    await call(B, 'POST', '/api/seen', { jobs: { [job.id]: '2026-10-01T10:00:00Z' } });
    await call(A, 'POST', '/api/seen', { jobs: { [job.id]: '2026-10-01T11:00:00Z' } });
    const b1 = await sb.seen(), a1 = await sa.seen();
    expect(a1.data.seenAt).toBe('2026-10-01T11:00:00.000Z'); // pierwsze, co A dostaje z job_seen, to jego wiersz, nie B
    expect(b1.data.seenAt).toBe('2026-10-01T10:00:00.000Z');
    await sa.close(); await sb.close();
  });
});
