import { describe, expect, it, vi } from 'vitest';
import { chwilaPl, newId } from '@etner/shared';
import { createApp } from '../../app.js';
import { pushSubscriptions } from '../../core/schema-base.js';
import { addUser, loginCookie, testDeps } from '../../test-utils.js';
import { modules } from '../index.js';
import { seedBase } from '../slowniki/seed.js';
import { create as newClient } from '../klienci/service.js';
import { jobs } from '../zlecenia/schema.js';
import * as users from '../uzytkownicy/service.js';
import { czasTick } from './index.js';

const pl = (g: string, d = '2026-11-16') => chwilaPl(d, g);

async function setup() {
  let clock = new Date(pl('07:00'));
  const push = vi.fn(async (_s: unknown, _p: string) => ({ statusCode: 201 }));
  const deps = testDeps({ push, now: () => clock });
  seedBase(deps.db);
  const app = createApp(deps, modules);
  const a = addUser(deps, { role: 'admin', name: 'Admin' });
  const w = addUser(deps, { name: 'Bartek' });
  const w2 = addUser(deps, { name: 'Niter' });
  const pw = users.createPerson(deps.db, a.user.id, { nazwa: 'Bartek', userId: w.user.id });
  users.createPerson(deps.db, a.user.id, { nazwa: 'Niter', userId: w2.user.id });
  const t = new Date().toISOString();
  deps.db.insert(pushSubscriptions).values({ id: newId(), userId: w.user.id, endpoint: 'Bartek', p256dh: 'p', auth: 'a', createdAt: t, updatedAt: t }).run();
  const klient = newClient(deps.db, a.user.id, { typ: 'osoba', nazwa: 'Kowalski', telefony: [], emaile: [], nip: '', notatki: '', site: { nazwa: '', adres: '', miejscowosc: 'Zawoja', mapa: '', opis: '' } }).client;
  const J = newId(), K = newId();
  for (const [id, numer] of [[J, 'Z1'], [K, 'Z2']]) deps.db.insert(jobs).values({ id, firmaId: klient.firmaId, numer, clientId: klient.id, status: 'Nowe', kategoria: 'Rekuperacja', createdAt: t, updatedAt: t }).run();
  const call = async (cookie: string, method: string, url: string, body?: unknown) => {
    const r = await app.request(url, { method, headers: { cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, json: await r.json() };
  };
  return { deps, app, push, w, pw, J, K, call, set: (g: string, d?: string) => { clock = new Date(pl(g, d)); }, admin: await loginCookie(app, a.login), worker: await loginCookie(app, w.login), worker2: await loginCookie(app, w2.login) };
}

describe('czasomierz', () => {
  it('start, zmiana zlecenia, stop z poprawką godzin; pracownik widzi tylko swoje', async () => {
    const { call, worker, worker2, admin, set, J, K, pw } = await setup();
    set('07:15');
    const a = await call(worker, 'POST', '/api/time/start', { at: pl('07:12'), jobId: J, opId: 'o1' });
    expect(a.json).toMatchObject({ personId: pw.id, jobId: J, od: pl('07:12'), odCz: pl('07:12'), do: null, dzien: '2026-11-16', zrodlo: 'czasomierz' });
    expect((await call(worker, 'POST', '/api/time/start', { at: pl('07:12'), jobId: J, opId: 'o1' })).json.id).toBe(a.json.id); // powtórka z kolejki
    set('11:31');
    const b = await call(worker, 'POST', '/api/time/start', { at: pl('11:30'), jobId: K });
    set('15:45');
    const s = await call(worker, 'POST', '/api/time/stop', { at: pl('15:40'), od: pl('11:00') });
    expect(s.status).toBe(400); // nakłada się na pierwszy wpis
    set('16:05'); // wysłane później (kolejka offline); stop z przyszłości odrzucony
    const s2 = await call(worker, 'POST', '/api/time/stop', { at: pl('15:40'), do: pl('16:00'), komentarz: 'za wcześnie kliknąłem' });
    expect(s2.json).toMatchObject({ id: b.json.id, od: pl('11:30'), do: pl('16:00'), doCz: pl('15:40'), komentarz: 'za wcześnie kliknąłem' });
    expect(s2.json.edytowalAt).toBeTruthy();
    const pierwszy = (await call(admin, 'GET', '/api/changes?since=0')).json;
    expect(JSON.stringify(pierwszy)).toContain(a.json.id);
    const obcy = (await call(worker2, 'GET', '/api/changes?since=0')).json;
    expect(JSON.stringify(obcy)).not.toContain(a.json.id);
  });

  it('przypomnienie 30 min przed i auto-stop po 11 h; spóźniony stop z kolejki poprawia wpis', async () => {
    const { deps, call, worker, set, J, push } = await setup();
    set('07:12');
    const a = await call(worker, 'POST', '/api/time/start', { at: pl('07:12'), jobId: J });
    await czasTick(deps, new Date(pl('17:30')));
    expect(push).not.toHaveBeenCalled();
    await czasTick(deps, new Date(pl('17:45')));
    await czasTick(deps, new Date(pl('17:50')));
    expect(push).toHaveBeenCalledTimes(1);
    expect(JSON.parse(push.mock.calls[0]![1] as string)).toMatchObject({ title: '⏱ Czy jeszcze pracujesz?', url: '#czas' });
    await czasTick(deps, new Date(pl('18:15')));
    expect(push).toHaveBeenCalledTimes(2);
    set('18:20');
    const s = await call(worker, 'POST', '/api/time/stop', { at: pl('15:40') });
    expect(s.json).toMatchObject({ id: a.json.id, do: pl('15:40'), autoStop: false });
    expect((await call(worker, 'POST', '/api/time/stop', { at: pl('18:19') })).json).toEqual({ ok: true }); // nic nie trwa
  });

  it('wpis ręczny i poprawki tylko z tego i poprzedniego tygodnia; usuwanie: pracownik tylko ręczne', async () => {
    const { call, worker, worker2, admin, set, J } = await setup();
    set('12:00', '2026-11-18');
    const stary = await call(worker, 'POST', '/api/time-entries', { od: pl('08:00', '2026-11-06'), do: pl('12:00', '2026-11-06'), jobId: null });
    expect(stary.status).toBe(403);
    const r = await call(worker, 'POST', '/api/time-entries', { od: pl('08:00', '2026-11-10'), do: pl('12:00', '2026-11-10'), jobId: J, komentarz: 'magazyn' });
    expect(r.json).toMatchObject({ zrodlo: 'reczny', odCz: null, dzien: '2026-11-10' });
    expect((await call(worker2, 'PUT', `/api/time-entries/${r.json.id}`, { komentarz: 'x' })).status).toBe(403);
    expect((await call(worker, 'PUT', `/api/time-entries/${r.json.id}`, { od: pl('08:00', '2026-11-06') })).status).toBe(403);
    expect((await call(worker, 'PUT', `/api/time-entries/${r.json.id}`, { do: pl('13:00', '2026-11-10') })).json.do).toBe(pl('13:00', '2026-11-10'));
    expect((await call(admin, 'POST', '/api/time-entries', { od: pl('08:00', '2026-11-02'), do: pl('09:00', '2026-11-02'), jobId: null })).status).toBe(400); // admin bez kolumny
    const t = await call(worker, 'POST', '/api/time/start', { at: pl('11:00', '2026-11-18'), jobId: null });
    expect((await call(worker, 'DELETE', `/api/time-entries/${t.json.id}`)).status).toBe(403);
    expect((await call(worker, 'DELETE', `/api/time-entries/${r.json.id}`)).status).toBe(200);
    expect((await call(admin, 'DELETE', `/api/time-entries/${t.json.id}`)).status).toBe(200);
  });

  it('zły zegar telefonu i nieznane zlecenie', async () => {
    const { call, worker, set } = await setup();
    set('07:00');
    expect((await call(worker, 'POST', '/api/time/start', { at: pl('08:00'), jobId: null })).status).toBe(400);
    expect((await call(worker, 'POST', '/api/time/start', { at: pl('07:00'), jobId: 'nie-ma' })).status).toBe(400);
  });

  it('kolejka offline: zmiana zlecenia i stop po auto-stopie nie dublują czasu; poprawka trwającego wpisu sprawdza nakładanie', async () => {
    const { deps, call, worker, set, J, K } = await setup();
    set('07:00');
    const a = await call(worker, 'POST', '/api/time/start', { at: pl('07:00'), jobId: J });
    await czasTick(deps, new Date(pl('18:00'))); // auto-stop o 18:00 (11 h)
    set('19:00');
    const k = await call(worker, 'POST', '/api/time/start', { at: pl('15:00'), jobId: K });
    expect(k.status).toBe(200);
    const s = await call(worker, 'POST', '/api/time/stop', { at: pl('17:00') });
    expect(s.json).toMatchObject({ id: k.json.id, od: pl('15:00'), do: pl('17:00') });
    const ch = (await call(worker, 'GET', '/api/changes?since=0')).json as { changes?: { id: string; data: Record<string, unknown> }[] };
    const rows = new Map<string, Record<string, unknown>>();
    for (const c of (Array.isArray(ch) ? ch : ch.changes ?? []) as { id: string; data: Record<string, unknown> }[]) if (c.data) rows.set(c.id, c.data);
    expect(rows.get(a.json.id)).toMatchObject({ do: pl('15:00'), autoStop: false });
    // trwający wpis: przesunięcie startu na czas innego wpisu odrzucone
    set('20:30');
    const t = await call(worker, 'POST', '/api/time/start', { at: pl('20:30'), jobId: null });
    expect((await call(worker, 'PUT', `/api/time-entries/${t.json.id}`, { od: pl('16:00') })).status).toBe(400);
  });

  it('auto-stop nie nadpisuje stopu wysłanego w trakcie tiku', async () => {
    const { deps, call, worker, set } = await setup();
    set('07:00');
    await call(worker, 'POST', '/api/time/start', { at: pl('07:00'), jobId: null });
    const { runningAll, autoStop } = await import('./service.js');
    const [r] = runningAll(deps.db);
    set('17:00');
    await call(worker, 'POST', '/api/time/stop', { at: pl('16:30') });
    expect(autoStop(deps.db, r!, pl('18:00'))).toBeUndefined();
  });

  it('Stop i od razu Start (w tej samej minucie) – bez błędu nakładania', async () => {
    const { call, worker, set } = await setup();
    set('07:00');
    await call(worker, 'POST', '/api/time/start', { at: pl('07:00'), jobId: null });
    expect((await call(worker, 'POST', '/api/time/stop', { at: pl('07:00') })).status).toBe(200);
    set('07:01');
    expect((await call(worker, 'POST', '/api/time/start', { at: new Date(Date.parse(pl('07:00')) + 5000).toISOString(), jobId: null })).status).toBe(200);
  });
});
