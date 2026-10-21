import { describe, expect, it, vi } from 'vitest';
import { newId } from '@etner/shared';
import { createApp } from '../../app.js';
import { pushSubscriptions } from '../../core/schema-base.js';
import { addUser, loginCookie, testDeps } from '../../test-utils.js';
import { modules } from '../index.js';
import { create as newClient } from '../klienci/service.js';
import { seedBase } from '../slowniki/seed.js';
import * as slowniki from '../slowniki/service.js';
import * as users from '../uzytkownicy/service.js';
import * as zlecenia from '../zlecenia/service.js';
import * as svc from './service.js';

// 22:30Z = 00:30 w Warszawie 22.10: „dziś” to już 2026-10-22 (przełom doby).
async function setup(now = new Date('2026-10-21T22:30:00Z')) {
  const push = vi.fn(async (_s: unknown, _p: string) => ({ statusCode: 201 }));
  const deps = testDeps({ push, now: () => now });
  seedBase(deps.db);
  const app = createApp(deps, modules);
  const a = addUser(deps, { role: 'admin', name: 'Admin' });
  const b = addUser(deps, { role: 'admin', name: 'Admin2' });
  const w = addUser(deps, { name: 'Bartek' });
  const t = new Date().toISOString();
  for (const u of [a, b, w]) deps.db.insert(pushSubscriptions).values({ id: newId(), userId: u.user.id, endpoint: u.user.name, p256dh: 'p', auth: 'a', createdAt: t, updatedAt: t }).run();
  const pw = users.createPerson(deps.db, a.user.id, { nazwa: 'Bartek', userId: w.user.id });
  const pa = users.createPerson(deps.db, a.user.id, { nazwa: 'Admin', userId: a.user.id });
  const px = users.createPerson(deps.db, a.user.id, { nazwa: 'Bez konta' });
  const k = newClient(deps.db, a.user.id, { typ: 'osoba', nazwa: 'Nowak', telefony: [], emaile: [], nip: '', notatki: '', site: { nazwa: '', adres: 'Krótka 1', miejscowosc: 'Zawoja', mapa: '', opis: '' } });
  const job = zlecenia.save(deps.db, a.user.id, { clientId: k.client.id, siteId: k.site!.id, status: 'Nowe' } as never)!;
  const job2 = zlecenia.save(deps.db, a.user.id, { clientId: k.client.id, status: 'Nowe' } as never)!;
  return { deps, app, push, a, b, w, pw, pa, px, job, job2, admin: await loginCookie(app, a.token), admin2: await loginCookie(app, b.token), worker: await loginCookie(app, w.token) };
}
type S = Awaited<ReturnType<typeof setup>>;
const req = (cookie: string, method: string, body?: unknown) =>
  ({ method, headers: { cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const pushed = (push: ReturnType<typeof vi.fn>) => push.mock.calls.map((c) => ({ endpoint: (c[0] as { endpoint: string }).endpoint, ...JSON.parse(c[1] as string) }));
const draft = (s: S, cookie: string, d: Record<string, unknown>) => s.app.request('/api/schedule/drafts', req(cookie, 'POST', { workdaysOnly: false, ...d }));
const range = async (s: S, cookie: string, from: string, to: string) => (await s.app.request(`/api/schedule?from=${from}&to=${to}`, req(cookie, 'GET'))).json();
const zl = (jobId: string, polDnia = false) => ({ rodzaj: 'zlecenie', jobId, polDnia });
const draftDays = (s: S) => svc.drafts(s.deps.db).map((d) => d.key.split('|')[0]).sort();

describe('harmonogram', () => {
  it('szkic widzi tylko admin (GET i changes); pracownik nie tworzy szkicu', async () => {
    const s = await setup();
    expect((await draft(s, s.admin, { from: '2026-10-23', to: '2026-10-23', people: [s.pw.id], value: [zl(s.job.id)] })).status).toBe(200);
    const ra = await range(s, s.admin, '2026-10-23', '2026-10-23');
    expect(ra.drafts).toHaveLength(1);
    expect(ra.drafts[0]).toMatchObject({ key: `2026-10-23|${s.pw.id}`, proposalHash: expect.stringMatching(/^[0-9a-f]{64}$/) });
    const rw = await range(s, s.worker, '2026-10-23', '2026-10-23');
    expect(rw.drafts).toBeUndefined();
    expect(rw.days).toHaveLength(1);
    const ch = await (await s.app.request('/api/changes?since=0', req(s.worker, 'GET'))).json();
    expect(ch.changes.some((c: { entity: string }) => c.entity === 'schedule_drafts')).toBe(false);
    const snap = await (await s.app.request('/api/snapshot', req(s.worker, 'GET'))).json();
    expect(snap.records.some((c: { entity: string }) => c.entity === 'schedule_drafts')).toBe(false);
    expect((await draft(s, s.worker, { from: '2026-10-23', to: '2026-10-23', people: [s.pw.id], value: [] })).status).toBe(403);
    expect((await s.app.request('/api/schedule/approve', req(s.worker, 'POST', {}))).status).toBe(403);
    expect((await s.app.request('/api/schedule/discard', req(s.worker, 'POST', {}))).status).toBe(403);
  });

  it('zatwierdzenie zapisuje wpisy i wysyła push osobie z kolumny, bez zatwierdzającego', async () => {
    const s = await setup();
    await draft(s, s.admin, { from: '2026-10-23', to: '2026-10-23', people: [s.pw.id, s.pa.id, s.px.id], value: [zl(s.job.id)] });
    await draft(s, s.admin, { from: '2026-10-23', to: '2026-10-23', people: ['uwagi'], value: { tekst: 'Zebranie 7:00' } });
    const r = await s.app.request('/api/schedule/approve', req(s.admin, 'POST', {}));
    expect(r.status).toBe(200);
    const day = (await range(s, s.worker, '2026-10-23', '2026-10-23')).days[0];
    expect(day.entries).toHaveLength(3);
    expect(day.note).toBe('Zebranie 7:00');
    expect(svc.drafts(s.deps.db)).toEqual([]);
    const p = pushed(s.push);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ endpoint: 'Bartek', title: '📅 Zmiana w Twoim harmonogramie', body: `jutro: — → ${s.job.numer}`, url: '#harm/2026-10-23', tag: 'harm' });
  });

  it('kilka zmian: tytuł z liczbą, etykiety dziś/jutro/dzień, pół dnia przez " / "', async () => {
    const s = await setup();
    await draft(s, s.admin, { from: '2026-10-22', to: '2026-10-23', people: [s.pw.id], value: [zl(s.job.id)] });
    await draft(s, s.admin, { from: '2026-11-03', to: '2026-11-03', people: [s.pw.id], value: [zl(s.job.id, true), { rodzaj: 'kod', kod: 'urlop', polDnia: true }] });
    await s.app.request('/api/schedule/approve', req(s.admin, 'POST', {}));
    s.push.mockClear();
    await draft(s, s.admin, { from: '2026-10-23', to: '2026-10-23', people: [s.pw.id], value: [{ rodzaj: 'tekst', tekst: 'magazyn', polDnia: false }] });
    await s.app.request('/api/schedule/approve', req(s.admin, 'POST', {}));
    expect(pushed(s.push)[0]).toMatchObject({ title: '📅 Zmiana w Twoim harmonogramie', body: `jutro: ${s.job.numer} → magazyn` });
    s.push.mockClear();
    await draft(s, s.admin2, { from: '2026-10-22', to: '2026-10-22', people: [s.pw.id], value: [] });
    await draft(s, s.admin2, { from: '2026-11-03', to: '2026-11-03', people: [s.pw.id], value: [{ rodzaj: 'kod', kod: 'L4', polDnia: false }] });
    await s.app.request('/api/schedule/approve', req(s.admin2, 'POST', {}));
    const p = pushed(s.push);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ title: '📅 Zmiany w Twoim harmonogramie (2)', body: `dziś: ${s.job.numer} → —\nwto 03.11: ${s.job.numer} / urlop → L4`, url: '#harm/2026-10-22' });
  });

  it('dwóch adminów: szkic zmieniony po wczytaniu zostaje, reszta zatwierdzona', async () => {
    const s = await setup();
    await draft(s, s.admin, { from: '2026-10-23', to: '2026-10-24', people: [s.pw.id], value: [zl(s.job.id)] });
    const seen = (await range(s, s.admin, '2026-10-23', '2026-10-24')).drafts as { key: string; proposalHash: string }[];
    expect(seen).toHaveLength(2);
    // drugi admin zmienia 24.10 w międzyczasie
    await draft(s, s.admin2, { from: '2026-10-24', to: '2026-10-24', people: [s.pw.id], value: [zl(s.job2.id)] });
    const r = await (await s.app.request('/api/schedule/approve', req(s.admin, 'POST', { items: seen.map(({ key, proposalHash }) => ({ key, proposalHash })) }))).json();
    expect(r).toEqual({ applied: [`2026-10-23|${s.pw.id}`], skipped: [`2026-10-24|${s.pw.id}`] });
    const days = (await range(s, s.admin, '2026-10-23', '2026-10-24'));
    expect(days.days[0].entries[0]).toMatchObject({ jobId: s.job.id });
    expect(days.days[1].entries).toEqual([]);
    expect(days.drafts).toHaveLength(1);
    expect(days.drafts[0].proposal).toEqual([zl(s.job2.id)]);
  });

  it('szkic równy zatwierdzonemu znika; discard; walidacja zlecenia, kodu i osób', async () => {
    const s = await setup();
    await draft(s, s.admin, { from: '2026-10-23', to: '2026-10-23', people: [s.pw.id], value: [zl(s.job.id)] });
    await s.app.request('/api/schedule/approve', req(s.admin, 'POST', {}));
    await draft(s, s.admin, { from: '2026-10-23', to: '2026-10-23', people: [s.pw.id], value: [zl(s.job2.id)] });
    expect(svc.drafts(s.deps.db)).toHaveLength(1);
    await draft(s, s.admin, { from: '2026-10-23', to: '2026-10-23', people: [s.pw.id], value: [zl(s.job.id)] });
    expect(svc.drafts(s.deps.db)).toEqual([]);
    await draft(s, s.admin, { from: '2026-10-26', to: '2026-10-28', people: [s.pw.id], value: [] });
    expect(svc.drafts(s.deps.db)).toEqual([]); // puste = już puste
    await draft(s, s.admin, { from: '2026-10-26', to: '2026-10-28', people: [s.px.id], value: [{ rodzaj: 'kod', kod: 'urlop', polDnia: false }] });
    await s.app.request('/api/schedule/discard', req(s.admin, 'POST', { keys: [`2026-10-26|${s.px.id}`] }));
    expect(draftDays(s)).toEqual(['2026-10-27', '2026-10-28']);
    await s.app.request('/api/schedule/discard', req(s.admin, 'POST', {}));
    expect(svc.drafts(s.deps.db)).toEqual([]);
    const bad = async (d: Record<string, unknown>) => (await draft(s, s.admin, { from: '2026-10-23', to: '2026-10-23', people: [s.pw.id], ...d })).status;
    expect(await bad({ value: [zl('nie-ma')] })).toBe(400);
    expect(await bad({ value: [{ rodzaj: 'kod', kod: 'urlopik', polDnia: false }] })).toBe(400);
    expect(await bad({ value: [zl(s.job.id), zl(s.job2.id)] })).toBe(400);
    expect(await bad({ people: ['obcy'], value: [] })).toBe(400);
    expect(await bad({ people: ['uwagi'], value: [] })).toBe(400);
    expect(await bad({ value: { tekst: 'x' } })).toBe(400);
    expect(await bad({ from: '2026-10-24', to: '2026-10-23', value: [] })).toBe(400);
  });

  it('jobDays: dwa pełne dni i jedno pół = 2.5, od/do; peopleForJob i myNext', async () => {
    const s = await setup();
    await draft(s, s.admin, { from: '2026-10-26', to: '2026-10-27', people: [s.pw.id], value: [zl(s.job.id)] });
    await draft(s, s.admin, { from: '2026-10-29', to: '2026-10-29', people: [s.px.id], value: [zl(s.job.id, true), zl(s.job2.id, true)] });
    await draft(s, s.admin, { from: '2026-10-21', to: '2026-10-21', people: [s.pw.id], value: [zl(s.job2.id)] }); // przeszłość
    await s.app.request('/api/schedule/approve', req(s.admin, 'POST', {}));
    expect(await (await s.app.request(`/api/schedule/job/${s.job.id}/days`, req(s.worker, 'GET'))).json()).toEqual({ dni: 2.5, od: '2026-10-26', do: '2026-10-29' });
    expect(svc.jobDays(s.deps.db, 'brak')).toEqual({ dni: 0 });
    expect(svc.peopleForJob(s.deps.db, s.job.id)).toEqual([s.w.user.id]);
    expect(s.deps.schedule!.peopleForJob!(s.job2.id)).toEqual([s.w.user.id]);
    const next = await (await s.app.request('/api/schedule/my-next', req(s.worker, 'GET'))).json();
    expect(next).toMatchObject({ dzien: '2026-10-26', entries: [{ jobId: s.job.id, job: { numer: s.job.numer, klient: 'Nowak', miejscowosc: 'Zawoja' } }] });
    expect(await (await s.app.request('/api/schedule/my-next', req(s.admin2, 'GET'))).json()).toBeNull();
  });

  it('workdaysOnly pomija sobotę, niedzielę, 11.11 i dzień wolny ze słownika', async () => {
    const s = await setup();
    slowniki.replace(s.deps.db, s.a.user.id, 'dzien_wolny', [{ wartosc: '2026-11-13' }]);
    await draft(s, s.admin, { from: '2026-11-09', to: '2026-11-15', people: [s.pw.id], value: [zl(s.job.id)], workdaysOnly: true });
    expect(draftDays(s)).toEqual(['2026-11-09', '2026-11-10', '2026-11-12']);
    const days = (await range(s, s.admin, '2026-11-09', '2026-11-15')).days;
    expect(days.find((d: { dzien: string }) => d.dzien === '2026-11-13')).toMatchObject({ wd: 2, info: '2026-11-13' });
  });

  it('zmiana czasu: zakres przez ostatnią niedzielę października i marca daje dokładnie te dni', async () => {
    const s = await setup();
    await draft(s, s.admin, { from: '2026-10-24', to: '2026-10-26', people: [s.pw.id], value: [zl(s.job.id)] });
    expect(draftDays(s)).toEqual(['2026-10-24', '2026-10-25', '2026-10-26']);
    await s.app.request('/api/schedule/discard', req(s.admin, 'POST', {}));
    await draft(s, s.admin, { from: '2026-03-28', to: '2026-03-30', people: [s.pw.id], value: [zl(s.job.id)] });
    expect(draftDays(s)).toEqual(['2026-03-28', '2026-03-29', '2026-03-30']);
    expect((await range(s, s.admin, '2026-03-28', '2026-03-30')).days.map((d: { dzien: string; wd: number }) => [d.dzien, d.wd]))
      .toEqual([['2026-03-28', 0], ['2026-03-29', 0], ['2026-03-30', 1]]);
  });

  it('range dla 2026-12 zawiera Wigilię z wd=2', async () => {
    const s = await setup();
    const r = await range(s, s.worker, '2026-12-01', '2026-12-31');
    expect(r.days).toHaveLength(31);
    expect(r.days.find((d: { dzien: string }) => d.dzien === '2026-12-24')).toMatchObject({ wd: 2, info: 'Wigilia (dzień wolny od 2025 r.)' });
    expect((await s.app.request('/api/schedule?from=2026-12-01&to=2028-12-01', req(s.worker, 'GET'))).status).toBe(400);
  });
});
