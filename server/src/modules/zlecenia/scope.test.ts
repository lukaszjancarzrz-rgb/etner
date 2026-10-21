import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { addUser, loginCookie, testDeps } from '../../test-utils.js';
import { modules } from '../index.js';
import { create as newClient } from '../klienci/service.js';
import { seedBase } from '../slowniki/seed.js';
import * as zlecenia from './service.js';

async function setup() {
  const deps = testDeps();
  seedBase(deps.db);
  const app = createApp(deps, modules);
  const a = addUser(deps, { role: 'admin', name: 'Admin' });
  const w = addUser(deps, { name: 'Pracownik' });
  const k = newClient(deps.db, a.user.id, { typ: 'osoba', nazwa: 'Nowak', telefony: [], emaile: [], nip: '', notatki: '', site: { nazwa: '', adres: 'Krótka 1', miejscowosc: 'Zawoja', mapa: '', opis: '' } });
  const job = zlecenia.save(deps.db, a.user.id, { clientId: k.client.id, siteId: k.site!.id, status: 'Nowe', uwagiAdmin: 'tajne' } as never)!;
  return { deps, app, job, admin: await loginCookie(app, a.login), worker: await loginCookie(app, w.login) };
}
type S = Awaited<ReturnType<typeof setup>>;
const json = (cookie: string, method: string, body?: unknown) =>
  ({ method, headers: { cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const up = async (s: S, cookie: string) => {
  const fd = new FormData();
  fd.set('file', new File([new Uint8Array(await sharp({ create: { width: 800, height: 600, channels: 3, background: '#36a' } }).jpeg().toBuffer())], 'a.jpg'));
  return ((await (await s.app.request('/api/uploads', { method: 'POST', headers: { cookie }, body: fd })).json()) as { uploadId: string }).uploadId;
};
const add = async (s: S, tekst: string, uploads: string[] = []) =>
  (await (await s.app.request(`/api/jobs/${s.job.id}/scope`, json(s.admin, 'POST', { tekst, uploads }))).json()) as { id: string; kolejnosc: number };
const feed = async (s: S, cookie: string) => (await (await s.app.request('/api/changes?since=0', json(cookie, 'GET'))).json()).changes as { entity: string; id: string; data: any }[];
const atts = (s: S) => s.deps.db.$client.prepare('select id, owner_type, owner_id, deleted_at from attachments order by id').all() as any[];

describe('zakres prac', () => {
  it('admin dodaje punkty ze zdjęciami; kolejność rośnie', async () => {
    const s = await setup();
    const ph = [await up(s, s.admin), await up(s, s.admin)];
    const p1 = await add(s, 'Montaż centrali', ph);
    const p2 = await add(s, 'Kanały');
    expect([p1.kolejnosc, p2.kolejnosc]).toEqual([1, 2]);
    expect(atts(s).map((a) => [a.owner_type, a.owner_id])).toEqual([['scope', p1.id], ['scope', p1.id]]);
    const extra = await up(s, s.admin);
    const r = await s.app.request(`/api/scope/${p2.id}`, json(s.admin, 'PUT', { tekst: 'Kanały 160 mm', uploads: [extra] }));
    expect(await r.json()).toMatchObject({ tekst: 'Kanały 160 mm', kolejnosc: 2 });
    expect(atts(s).filter((a) => a.owner_id === p2.id)).toHaveLength(1);
    expect((await s.app.request(`/api/jobs/${s.job.id}/scope`, json(s.admin, 'POST', { tekst: '' }))).status).toBe(400);
    expect((await s.app.request('/api/jobs/brak/scope', json(s.admin, 'POST', { tekst: 'x' }))).status).toBe(404);
  });

  it('pracownik: zapisy 403, ale widzi punkty i zdjęcia (changes, plik)', async () => {
    const s = await setup();
    const ph = await up(s, s.admin);
    const p = await add(s, 'Montaż', [ph]);
    const wid = await up(s, s.worker);
    for (const [url, m, b] of [[`/api/jobs/${s.job.id}/scope`, 'POST', { tekst: 'x', uploads: [wid] }], [`/api/scope/${p.id}`, 'PUT', { tekst: 'y' }], [`/api/scope/${p.id}`, 'DELETE', undefined], [`/api/jobs/${s.job.id}/scope/order`, 'POST', { ids: [p.id] }]] as const)
      expect((await s.app.request(url, json(s.worker, m, b))).status).toBe(403);
    const ch = await feed(s, s.worker);
    expect(ch.find((c) => c.entity === 'job_scope_items')).toMatchObject({ id: p.id, data: { tekst: 'Montaż', jobId: s.job.id } });
    expect(ch.find((c) => c.entity === 'attachments')).toMatchObject({ id: ph, data: { ownerType: 'scope', ownerId: p.id } });
    expect(ch.find((c) => c.entity === 'jobs')!.data).not.toHaveProperty('uwagiAdmin');
    expect((await s.app.request(`/api/attachments/${ph}/file?v=thumb`, json(s.worker, 'GET'))).status).toBe(302);
  });

  it('kolejność: tylko pełna lista; usunięcie zabiera zdjęcia', async () => {
    const s = await setup();
    const ph = await up(s, s.admin);
    const [a, b, c] = [await add(s, 'A', [ph]), await add(s, 'B'), await add(s, 'C')];
    expect((await s.app.request(`/api/jobs/${s.job.id}/scope/order`, json(s.admin, 'POST', { ids: [c.id, a.id] }))).status).toBe(400);
    const r = await s.app.request(`/api/jobs/${s.job.id}/scope/order`, json(s.admin, 'POST', { ids: [c.id, a.id, b.id] }));
    expect(((await r.json()) as any[]).map((x) => [x.tekst, x.kolejnosc])).toEqual([['C', 1], ['A', 2], ['B', 3]]);
    expect((await s.app.request(`/api/scope/${a.id}`, json(s.admin, 'DELETE'))).status).toBe(200);
    expect(atts(s)[0].deleted_at).toBeTruthy();
    expect((await s.app.request(`/api/attachments/${ph}/file`, json(s.worker, 'GET'))).status).toBe(404);
    const del = (await feed(s, s.worker)).filter((x) => x.id === a.id || x.id === ph).at(-1)!;
    expect(del.data.deletedAt).toBeTruthy();
    expect((await s.app.request(`/api/scope/${a.id}`, json(s.admin, 'DELETE'))).status).toBe(404);
  });

  it('pokaż klientowi na zdjęciu punktu (admin)', async () => {
    const s = await setup();
    const ph = await up(s, s.admin);
    await add(s, 'A', [ph]);
    expect((await s.app.request(`/api/attachments/${ph}`, json(s.admin, 'PATCH', { dla_klienta: true }))).status).toBe(200);
  });
});
