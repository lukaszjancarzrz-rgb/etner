import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { newId } from '@etner/shared';
import { createApp } from '../../app.js';
import { pushSubscriptions } from '../../core/schema-base.js';
import { addUser, loginCookie, testDeps } from '../../test-utils.js';
import { modules } from '../index.js';
import { seedBase } from '../slowniki/seed.js';
import { create as newClient } from '../klienci/service.js';
import * as zlecenia from '../zlecenia/service.js';
import * as leady from '../leady/service.js';
import { changesSince } from '../../core/changes.js';

async function setup() {
  const push = vi.fn(async () => ({ statusCode: 201 }));
  const deps = testDeps({ push });
  seedBase(deps.db);
  const app = createApp(deps, modules);
  const a = addUser(deps, { role: 'admin', name: 'Admin' });
  const w = addUser(deps, { name: 'Pracownik', ekipa: 'A' });
  const w2 = addUser(deps, { name: 'Drugi' });
  const t = new Date().toISOString();
  for (const u of [a, w, w2]) deps.db.insert(pushSubscriptions).values({ id: newId(), userId: u.user.id, endpoint: u.user.id, p256dh: 'p', auth: 'a', createdAt: t, updatedAt: t }).run();
  const k = newClient(deps.db, a.user.id, { typ: 'osoba', nazwa: 'Nowak', telefony: [], emaile: [], nip: '', notatki: '', site: { nazwa: '', adres: 'Krótka 1', miejscowosc: 'Zawoja', mapa: '', opis: '' } });
  const job = zlecenia.save(deps.db, a.user.id, { clientId: k.client.id, siteId: k.site!.id, status: 'Nowe', ekipa: 'A' } as never)!;
  const lead = leady.save(deps.db, a.user.id, { clientId: k.client.id, temat: 'Rekuperacja' } as never)!;
  return { deps, app, push, a, w, w2, job, lead, admin: await loginCookie(app, a.login), worker: await loginCookie(app, w.login), worker2: await loginCookie(app, w2.login) };
}
type S = Awaited<ReturnType<typeof setup>>;
const json = (cookie: string, method: string, body?: unknown) =>
  ({ method, headers: { cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const upload = async (s: S, cookie: string, data: Buffer, name: string) => {
  const fd = new FormData();
  fd.set('file', new File([new Uint8Array(data)], name));
  return s.app.request('/api/uploads', { method: 'POST', headers: { cookie }, body: fd });
};
const jpeg = () => sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#3a6' } }).jpeg().toBuffer();
const up = async (s: S, cookie: string) => ((await (await upload(s, cookie, await jpeg(), 'a.jpg')).json()) as { uploadId: string }).uploadId;
const post = (s: S, cookie: string, over: Record<string, unknown> = {}) =>
  s.app.request('/api/diary', json(cookie, 'POST', { owner_type: 'job', owner_id: s.job.id, tekst: 'Zrobione', uploads: [], ...over }));

describe('dziennik', () => {
  it('wpis z dwoma zdjęciami: dla_klienta=false i trzy klucze w magazynie', async () => {
    const s = await setup();
    const ids = [await up(s, s.worker), await up(s, s.worker)];
    const res = await post(s, s.worker, { uploads: ids });
    expect(res.status).toBe(200);
    const atts = s.deps.db.$client.prepare('select * from attachments').all() as any[];
    expect(atts).toHaveLength(2);
    for (const a of atts) {
      expect(a.dla_klienta).toBe(0);
      expect(a.owner_type).toBe('entry');
      for (const k of [a.key_orig, a.key_view, a.key_thumb]) expect((await s.deps.files.get(k)).length).toBeGreaterThan(0);
    }
    const thumb = await sharp(await s.deps.files.get(atts[0].key_thumb)).metadata();
    expect(thumb.width).toBe(320);
  });

  it('ten sam opId daje jeden wpis', async () => {
    const s = await setup();
    await post(s, s.worker, { opId: 'op1' });
    await post(s, s.worker, { opId: 'op1' });
    expect(s.deps.db.$client.prepare('select count(*) n from diary_entries').get()).toEqual({ n: 1 });
  });

  it('usuwanie: cudzy wpis 403, własny OK (miękko, razem z załącznikami)', async () => {
    const s = await setup();
    const id = await up(s, s.worker);
    const mine = (await (await post(s, s.worker, { uploads: [id] })).json()) as { id: string };
    const theirs = (await (await post(s, s.admin, { tekst: 'Admin' })).json()) as { id: string };
    expect((await s.app.request(`/api/diary/${theirs.id}`, json(s.worker, 'DELETE'))).status).toBe(403);
    expect((await s.app.request(`/api/diary/${mine.id}`, json(s.worker, 'DELETE'))).status).toBe(200);
    expect(s.deps.db.$client.prepare('select count(*) n from attachments where deleted_at is null').get()).toEqual({ n: 0 });
  });

  it('PATCH dla_klienta: pracownik 403, admin OK', async () => {
    const s = await setup();
    const id = await up(s, s.worker);
    const e = (await (await post(s, s.worker, { uploads: [id] })).json()) as { id: string };
    for (const url of [`/api/diary/${e.id}`, `/api/attachments/${id}`]) {
      expect((await s.app.request(url, json(s.worker, 'PATCH', { dla_klienta: true }))).status).toBe(403);
      expect((await s.app.request(url, json(s.admin, 'PATCH', { dla_klienta: true }))).status).toBe(200);
    }
  });

  it('plik .exe: 415', async () => {
    const s = await setup();
    const exe = Buffer.concat([Buffer.from('MZ'), randomBytes(200)]);
    expect((await upload(s, s.worker, exe, 'x.exe')).status).toBe(415);
    expect((await upload(s, s.worker, exe, 'x.jpg')).status).toBe(415);
  });

  it('powiadomienie: bez autora, adres z ~entryId, 📷 n', async () => {
    const s = await setup();
    const ids = [await up(s, s.admin), await up(s, s.admin)];
    s.push.mockClear();
    const e = (await (await post(s, s.admin, { uploads: ids })).json()) as { id: string };
    const calls = s.push.mock.calls as any[];
    expect(calls.map((c) => c[0].endpoint).sort()).toEqual([s.w.user.id]); // admin = autor, ekipa A = Pracownik
    const p = JSON.parse(calls[0][1]);
    expect(p).toMatchObject({ title: '📝 Nowy wpis w dzienniku: Nowak – Zawoja (Z0001)', body: 'Admin: Zrobione 📷 2', url: `#zl/${s.job.id}~${e.id}` });
  });

  it('wpis leada: niewidoczny dla pracownika (zapis, plik, sync), admin dostaje powiadomienie z #ld', async () => {
    const s = await setup();
    expect((await post(s, s.worker, { owner_type: 'lead', owner_id: s.lead.id })).status).toBe(403);
    const id = await up(s, s.admin);
    s.push.mockClear();
    const e = (await (await post(s, s.admin, { owner_type: 'lead', owner_id: s.lead.id, uploads: [id] })).json()) as { id: string };
    expect(s.push).not.toHaveBeenCalled(); // jedyny admin jest autorem
    const w3 = addUser(s.deps, { role: 'admin', name: 'Admin2' });
    const t = new Date().toISOString();
    s.deps.db.insert(pushSubscriptions).values({ id: newId(), userId: w3.user.id, endpoint: 'adm2', p256dh: 'p', auth: 'a', createdAt: t, updatedAt: t }).run();
    await post(s, s.admin, { owner_type: 'lead', owner_id: s.lead.id });
    expect(JSON.parse((s.push.mock.calls as any[])[0][1])).toMatchObject({ title: '📝 Nowy wpis w dzienniku: Nowak – Rekuperacja', url: expect.stringMatching(new RegExp(`^#ld/${s.lead.id}~`)) });
    const adm = await s.app.request(`/api/attachments/${id}/file?v=thumb`, json(s.admin, 'GET'));
    expect(adm.status).toBe(302);
    expect(adm.headers.get('location')).toContain('/api/files/att/');
    expect((await s.app.request(`/api/attachments/${id}/file`, json(s.worker, 'GET'))).status).toBe(404);
    expect((await s.app.request(`/api/diary/${e.id}`, json(s.worker, 'DELETE'))).status).toBe(404);
    const vis = modules.find((m) => m.name === 'dziennik')!.visibleTo!;
    for (const ch of changesSince(s.deps.db, 0, 100).filter((c) => c.entity === 'diary_entries' || c.entity === 'attachments'))
      expect(vis(s.w.user, ch, s.deps)).toBe(false);
  });

  it('upload innego użytkownika nie da się podpiąć; niepodpięty plik niedostępny', async () => {
    const s = await setup();
    const id = await up(s, s.worker);
    expect((await post(s, s.worker2, { uploads: [id] })).status).toBe(400);
    expect((await s.app.request(`/api/attachments/${id}/file`, json(s.worker, 'GET'))).status).toBe(404);
    expect(changesSince(s.deps.db, 0, 100).some((c) => c.entity === 'attachments')).toBe(false);
  });

  it('leady.toJob tworzy dwa wpisy systemowe', async () => {
    const s = await setup();
    const res = await s.app.request(`/api/leads/${s.lead.id}/to-job`, json(s.admin, 'POST', { job: { status: 'Nowe' }, accept: false }));
    expect(res.status).toBe(200);
    const rows = s.deps.db.$client.prepare('select owner_type, author_id, tekst from diary_entries order by owner_type').all();
    expect(rows).toEqual([
      { owner_type: 'job', author_id: null, tekst: expect.stringMatching(/^Z leada: Nowak – Rekuperacja$/) },
      { owner_type: 'lead', author_id: null, tekst: expect.stringMatching(/^Utworzono zlecenie Z/) },
    ]);
  });

  it('upload ponad 25 MB: 413', async () => {
    const s = await setup();
    const big = Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(26 * 1024 * 1024)]);
    expect((await upload(s, s.worker, big, 'duzy.pdf')).status).toBe(413);
  });

  it('odbiorcy: admin, osoby z harmonogramu i ekipa bez autora; mieszane pomija ekipę', async () => {
    const s = await setup();
    const p = addUser(s.deps, { name: 'Z harmonogramu' });
    s.deps.schedule = { peopleForJob: () => [p.user.id, s.w.user.id] };
    s.push.mockClear();
    await post(s, s.worker2);
    const to = () => (s.push.mock.calls as any[]).map((c) => c[0].endpoint).sort();
    // admin + harmonogram (p bez subskrypcji) + ekipa A (w), deduplikacja
    expect(to()).toEqual([s.a.user.id, s.w.user.id].sort());
    zlecenia.save(s.deps.db, s.a.user.id, { id: s.job.id, ekipa: 'mieszane' } as never);
    s.push.mockClear();
    await post(s, s.worker2);
    expect(to()).toEqual([s.a.user.id, s.w.user.id].sort()); // w tylko przez harmonogram
    s.deps.schedule = undefined;
    s.push.mockClear();
    await post(s, s.worker2);
    expect(to()).toEqual([s.a.user.id]);
  });
});
