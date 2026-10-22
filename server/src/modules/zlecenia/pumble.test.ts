import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { fakePumble } from '../../core/pumble-fake.js';
import { recentErrors } from '../../core/errors.js';
import { addUser, loginCookie, testDeps } from '../../test-utils.js';
import { modules } from '../index.js';
import { create as newClient } from '../klienci/service.js';
import { seedBase } from '../slowniki/seed.js';
import * as users from '../uzytkownicy/service.js';
import { channelSlug, idle, messages, pollTick } from './pumble.js';
import { get } from './service.js';

let clock = new Date('2026-10-21T10:00:00Z');
async function setup(withPumble = true) {
  const f = fakePumble([
    { id: 'pa', email: 'szef@firma.pl', name: 'Szef' },
    { id: 'pb', email: 'b1@firma.pl', name: 'Bartek' },
    { id: 'pm', email: 'm1@firma.pl', name: 'Marek' },
    { id: 'px', email: 'x@firma.pl', name: 'Ktoś spoza' },
  ]);
  clock = new Date('2026-10-21T10:00:00Z');
  const deps = testDeps({ pumble: withPumble ? f.client : undefined, now: () => clock });
  seedBase(deps.db);
  const app = createApp(deps, modules);
  const a = addUser(deps, { role: 'admin', name: 'Szef', email: 'szef@firma.pl' });
  const b1 = addUser(deps, { ekipa: 'ekipa Bartek', name: 'Bartek', email: 'b1@firma.pl' });
  const b2 = addUser(deps, { ekipa: 'ekipa Bartek', name: 'Bez Pumble' });
  const m1 = addUser(deps, { ekipa: 'ekipa Marek', name: 'Marek', email: 'm1@firma.pl' });
  const k = newClient(deps.db, a.user.id, { typ: 'osoba', nazwa: 'Jan Kowalski', telefony: [], emaile: [], nip: '', notatki: '', site: { nazwa: '', adres: 'Długa 5', miejscowosc: 'Zawoja', mapa: '', opis: '' } });
  return { f, deps, app, a, b1, b2, m1, k, admin: await loginCookie(app, a.login), worker: await loginCookie(app, b1.login) };
}
const req = (cookie: string, method: string, body?: unknown) =>
  ({ method, headers: { cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
type S = Awaited<ReturnType<typeof setup>>;
const newJob = async (s: S, b: object = {}) => {
  const j = (await (await s.app.request('/api/jobs', req(s.admin, 'POST', { clientId: s.k.client.id, siteId: s.k.site!.id, status: 'Nowe', ekipa: 'ekipa Bartek', ...b }))).json()) as any;
  await idle(s.deps); // Pumble działa po odpowiedzi
  return get(s.deps.db, j.id) as any;
};
const put = async (s: S, id: string, b: object) => { await s.app.request(`/api/jobs/${id}`, req(s.admin, 'PUT', b)); await idle(s.deps); };
const errs = (s: S, where: string) => recentErrors(s.deps.db).filter((e) => e.where === where);
const chan = (s: S, id: string) => s.f.channels.get(id)!;

describe('Pumble', () => {
  it('slug: polskie litery, znaki, długość', () => {
    expect(channelSlug('Z0012', 'Łukasz Żółć', 'Zawoja')).toBe('z0012-lukasz-zolc-zawoja');
    expect(channelSlug('Z1', 'A'.repeat(100))).toHaveLength(80);
    expect(channelSlug('Z1', '', 'x--')).toBe('z1-x');
  });

  it('nowe zlecenie: prywatny kanał z nazwą i opisem, admini i ekipa; brak e-maila w błędach raz', async () => {
    const s = await setup();
    const j = await newJob(s);
    expect(j.pumbleChannelId).toBeTruthy();
    const c = chan(s, j.pumbleChannelId);
    expect(c).toMatchObject({ name: 'z0001-kowalski-zawoja', type: 'private', description: 'Zlecenie Z0001 – Jan Kowalski, Długa 5 Zawoja' });
    expect([...c.members].sort()).toEqual(['pa', 'pb']);
    expect(get(s.deps.db, j.id)!.pumbleChannelId).toBe(j.pumbleChannelId);
    const errs = recentErrors(s.deps.db).filter((e) => e.where === 'pumble:osoby');
    expect(errs).toHaveLength(1);
    expect(errs[0]!.message).toContain('Bez Pumble');
    // zmiana zlecenia (ta sama ekipa) nie loguje drugi raz
    await put(s, j.id, { ekipa: 'mieszane' });
    await put(s, j.id, { ekipa: 'ekipa Bartek' });
    expect(recentErrors(s.deps.db).filter((e) => e.where === 'pumble:osoby')).toHaveLength(1);
  });

  it('zajęta nazwa: przyrostek -2', async () => {
    const s = await setup();
    await s.f.client.createChannel({ name: 'z0001-kowalski-zawoja', type: 'public', description: '' });
    const j = await newJob(s);
    expect(chan(s, j.pumbleChannelId).name).toBe('z0001-kowalski-zawoja-2');
  });

  it('błąd Pumble nie psuje zapisu; ponowienie w obiegu najwcześniej po 5 min; admin może założyć od razu', async () => {
    const s = await setup();
    s.f.fail = true;
    const res = await s.app.request('/api/jobs', req(s.admin, 'POST', { clientId: s.k.client.id, status: 'Nowe' }));
    expect(res.status).toBe(200);
    const j = (await res.json()) as any;
    await idle(s.deps);
    expect(get(s.deps.db, j.id)!.pumbleChannelId).toBeNull();
    s.f.fail = false;
    await pollTick(s.deps);
    expect(get(s.deps.db, j.id)!.pumbleChannelId).toBeNull(); // za wcześnie
    clock = new Date(clock.getTime() + 5 * 60_000 + 1);
    await pollTick(s.deps);
    expect(get(s.deps.db, j.id)!.pumbleChannelId).toBeTruthy();
    // ręcznie przez admina (pracownik nie może)
    s.f.fail = true;
    const j2 = (await (await s.app.request('/api/jobs', req(s.admin, 'POST', { clientId: s.k.client.id, status: 'Nowe' }))).json()) as any;
    await idle(s.deps);
    expect((await s.app.request(`/api/jobs/${j2.id}/pumble/channel`, req(s.admin, 'POST'))).status).toBe(502);
    s.f.fail = false;
    expect((await s.app.request(`/api/jobs/${j2.id}/pumble/channel`, req(s.worker, 'POST'))).status).toBe(403);
    const r = await s.app.request(`/api/jobs/${j2.id}/pumble/channel`, req(s.admin, 'POST'));
    expect(((await r.json()) as any).pumbleChannelId).toBeTruthy();
  });

  it('zmiana ekipy i nowe osoby z harmonogramu trafiają do kanału', async () => {
    const s = await setup();
    const j = await newJob(s);
    await put(s, j.id, { ekipa: 'ekipa Marek' });
    expect([...chan(s, j.pumbleChannelId).members].sort()).toEqual(['pa', 'pb', 'pm']);
    // harmonogram: osoba spoza ekip
    const x = addUser(s.deps, { name: 'Ktoś spoza', email: 'x@firma.pl' });
    const p = users.createPerson(s.deps.db, s.a.user.id, { nazwa: 'X', userId: x.user.id });
    await s.app.request('/api/schedule/drafts', req(s.admin, 'POST', { workdaysOnly: false, from: '2026-10-23', to: '2026-10-23', people: [p.id], value: [{ rodzaj: 'zlecenie', jobId: j.id, polDnia: false }] }));
    s.f.calls.length = 0;
    expect((await s.app.request('/api/schedule/approve', req(s.admin, 'POST', {}))).status).toBe(200);
    await idle(s.deps);
    expect(chan(s, j.pumbleChannelId).members.has('px')).toBe(true);
    expect(s.f.calls.filter((c) => c === 'addUsers')).toHaveLength(1); // tylko nowa osoba, raz
  });

  it('odpytywanie: tylko nowe wiadomości, imię z prefiksu bota, autor po e-mailu, najwyżej 50; widzi pracownik', async () => {
    const s = await setup();
    const j = await newJob(s);
    const t0 = Date.parse('2026-10-21T08:00:00Z');
    s.f.users.push({ id: 'me', email: '', name: 'Właściciel' }); // przed pierwszym listUsers
    s.f.post(j.pumbleChannelId, 'pb', 'Jestem na miejscu', new Date(t0));
    s.f.post(j.pumbleChannelId, 'me', 'Szef: Dzięki', new Date(t0 + 1000)); // konto klucza, podpis ETNER
    s.f.post(j.pumbleChannelId, 'pb', 'Uwaga: kabel', new Date(t0 + 2000)); // inna osoba: bez rozbioru
    s.f.post(j.pumbleChannelId, 'me', 'Kowal: obcy podpis', new Date(t0 + 3000)); // nie nasz użytkownik
    await pollTick(s.deps);
    await pollTick(s.deps);
    let ms = messages(s.deps.db, j.id);
    expect(ms.map((m) => [m.authorName, m.text])).toEqual([['Bartek', 'Jestem na miejscu'], ['Szef', 'Dzięki'], ['Bartek', 'Uwaga: kabel'], ['Właściciel', 'Kowal: obcy podpis']]);
    expect(ms.map((m) => m.createdBy)).toEqual([s.b1.user.id, s.a.user.id, s.b1.user.id, null]);
    for (let i = 0; i < 60; i++) {
      s.f.post(j.pumbleChannelId, 'pm', `m${i}`, new Date(t0 + 10_000 + i * 1000));
      if (i % 15 === 14) await pollTick(s.deps); // po 20 na raz z Pumble
    }
    ms = messages(s.deps.db, j.id);
    expect(ms).toHaveLength(50);
    expect(ms.at(-1)!.text).toBe('m59');
    const feed = (await (await s.app.request('/api/changes?since=0', req(s.worker, 'GET'))).json()) as any;
    const pm = feed.changes.filter((c: any) => c.entity === 'pumble_messages');
    expect(pm.filter((c: any) => c.action === 'create')).toHaveLength(64);
    expect(pm.filter((c: any) => c.action === 'delete')).toHaveLength(14);
  });

  it('obieg pomija zamknięte zlecenia i bierze najwyżej 50 kanałów naraz, po kolei', async () => {
    const s = await setup();
    const closed = await newJob(s);
    await put(s, closed.id, { status: 'Rozliczone' });
    for (let i = 0; i < 55; i++) await newJob(s);
    s.f.calls.length = 0;
    await pollTick(s.deps);
    expect(s.f.calls.filter((c) => c === 'listMessages')).toHaveLength(50);
    s.f.calls.length = 0;
    await pollTick(s.deps);
    expect(s.f.calls.filter((c) => c === 'listMessages')).toHaveLength(50);
    s.f.post(closed.pumbleChannelId, 'pb', 'stare');
    for (let i = 0; i < 3; i++) await pollTick(s.deps);
    expect(messages(s.deps.db, closed.id)).toHaveLength(0);
  });

  it('wysyłka: z konta klucza (bot nie pisze do prywatnego) z imieniem, od razu w bazie; opId nie wysyła drugi raz; błąd → 502', async () => {
    const s = await setup();
    const j = await newJob(s);
    const send = (text: string, opId?: string) => s.app.request(`/api/jobs/${j.id}/pumble`, req(s.worker, 'POST', { text, opId }));
    const r = await send('  Brakuje kabla  ', 'op-1');
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ authorName: 'Bartek', text: 'Brakuje kabla', createdBy: s.b1.user.id });
    expect(chan(s, j.pumbleChannelId).messages[0]).toMatchObject({ text: 'Bartek: Brakuje kabla', author: 'me' });
    await send('Brakuje kabla', 'op-1');
    // dwa naraz z tym samym opId: do Pumble raz
    const [r1, r2] = await Promise.all([send('Drugi', 'op-2'), send('Drugi', 'op-2')]);
    expect((await r1.json() as any).id).toBe((await r2.json() as any).id);
    expect(chan(s, j.pumbleChannelId).messages).toHaveLength(2);
    await expect(s.f.client.sendMessage({ channelId: j.pumbleChannelId, text: 'x', asBot: true })).rejects.toThrow(/bot/);
    await pollTick(s.deps);
    expect(messages(s.deps.db, j.id)).toHaveLength(2);
    expect((await send('')).status).toBe(400);
    expect((await send('x'.repeat(4001))).status).toBe(400);
    s.f.fail = true;
    const bad = await send('Halo');
    expect(bad.status).toBe(502);
    expect(await bad.json()).toEqual({ error: 'PUMBLE' });
    expect((await s.app.request(`/api/jobs/${j.id}/pumble`, req('', 'POST', { text: 'x' }))).status).toBe(401);
  });

  it('link: obszar roboczy z myInfo i kanał; bez kanału strona Pumble', async () => {
    const s = await setup();
    const j = await newJob(s);
    const link = async (id: string) => ((await (await s.app.request(`/api/pumble/link/${id}`, req(s.worker, 'GET'))).json()) as any).url;
    expect(await link(j.id)).toBe(`https://app.pumble.com/workspace/ws-demo/${j.pumbleChannelId}`);
    expect(await link('nie-ma')).toBe('https://app.pumble.com');
  });

  it('bez klucza: status wyłączony, trasy nie istnieją, zlecenie bez kanału', async () => {
    const s = await setup(false);
    expect(await (await s.app.request('/api/pumble/status', req(s.worker, 'GET'))).json()).toEqual({ enabled: false });
    const j = await newJob(s);
    expect(j.pumbleChannelId).toBeNull();
    expect((await s.app.request(`/api/jobs/${j.id}/pumble`, req(s.worker, 'POST', { text: 'x' }))).status).toBe(404);
    expect((await s.app.request(`/api/pumble/link/${j.id}`, req(s.worker, 'GET'))).status).toBe(404);
    await pollTick(s.deps);
    expect(s.f.calls).toEqual([]);
  });

  it('zapis zlecenia nie czeka na Pumble; id kanału przychodzi zmianą zlecenia', async () => {
    const s = await setup();
    const res = (await (await s.app.request('/api/jobs', req(s.admin, 'POST', { clientId: s.k.client.id, status: 'Nowe' }))).json()) as any;
    expect(res.pumbleChannelId).toBeNull();
    await idle(s.deps);
    const feed = (await (await s.app.request('/api/changes?since=0', req(s.worker, 'GET'))).json()) as any;
    expect(feed.changes.filter((c: any) => c.entity === 'jobs' && c.id === res.id).at(-1).data.pumbleChannelId).toBeTruthy();
  });

  it('osoby: błąd Pumble przy dodawaniu → ponowienie w obiegu; jedno złe id nie blokuje reszty', async () => {
    const s = await setup();
    s.f.failOn.set('addUsers', 503);
    const j = await newJob(s);
    expect(chan(s, j.pumbleChannelId).members.size).toBe(0);
    s.f.failOn.clear();
    await pollTick(s.deps);
    expect([...chan(s, j.pumbleChannelId).members].sort()).toEqual(['pa', 'pb']);
    // zmiana ekipy, gdy Pumble nie działa: też ponowienie
    s.f.fail = true;
    await put(s, j.id, { ekipa: 'ekipa Marek' });
    s.f.fail = false;
    clock = new Date(clock.getTime() + 1);
    await pollTick(s.deps);
    expect(chan(s, j.pumbleChannelId).members.has('pm')).toBe(true);
    // px znika z Pumble (lista w pamięci podręcznej go ma): paczka odrzucona, reszta dodana po jednym
    addUser(s.deps, { ekipa: 'ekipa Zenek', name: 'X', email: 'x@firma.pl' });
    addUser(s.deps, { ekipa: 'ekipa Zenek', name: 'Marek 2', email: 'm1@firma.pl' });
    chan(s, j.pumbleChannelId).members.delete('pm');
    s.f.users = s.f.users.filter((u) => u.id !== 'px');
    const j2 = await newJob(s, { ekipa: 'ekipa Zenek' });
    expect([...chan(s, j2.pumbleChannelId).members].sort()).toEqual(['pa', 'pm']);
    expect(errs(s, 'pumble:osoby').some((e) => /nie dodał osób px/.test(e.message))).toBe(true);
  });

  it('kanał nie jest prywatny: jeden czytelny błąd, nikt nie zostaje dodany', async () => {
    const s = await setup();
    s.f.forceType = 'public';
    const j = await newJob(s);
    expect(j.pumbleChannelId).toBeTruthy();
    expect(chan(s, j.pumbleChannelId).members.size).toBe(0);
    await put(s, j.id, { ekipa: 'ekipa Marek' });
    const e = errs(s, 'pumble:kanal');
    expect(e).toHaveLength(1);
    expect(e[0]!.message).toMatch(/nie jest prywatny/);
    expect(chan(s, j.pumbleChannelId).members.size).toBe(0);
  });

  it('awaria Pumble: obieg przerwany, jeden wpis, przerwa 1 → 2 min; błędy kanałów jednym wpisem na obieg', async () => {
    const s = await setup();
    const a = await newJob(s), b = await newJob(s);
    s.f.fail = true;
    s.f.calls.length = 0;
    await pollTick(s.deps);
    expect(s.f.calls).toEqual(['listMessages']); // pierwszy błąd kończy obieg
    await pollTick(s.deps);
    expect(s.f.calls).toHaveLength(1); // przerwa
    clock = new Date(clock.getTime() + 60_001);
    await pollTick(s.deps);
    expect(s.f.calls).toHaveLength(2);
    clock = new Date(clock.getTime() + 60_001);
    await pollTick(s.deps);
    expect(s.f.calls).toHaveLength(2); // teraz 2 min
    expect(errs(s, 'pumble')).toHaveLength(1);
    s.f.fail = false;
    clock = new Date(clock.getTime() + 60_001);
    s.f.channels.delete(a.pumbleChannelId); s.f.channels.delete(b.pumbleChannelId);
    await pollTick(s.deps);
    await pollTick(s.deps);
    const o = errs(s, 'pumble:obieg');
    expect(o).toHaveLength(2);
    expect(o[0]!.message).toMatch(/^Error: 2 błędów kanałów/);
  });

  it('kanały dla istniejących zleceń: tylko aktualne, do 5 na obieg', async () => {
    const s = await setup();
    s.f.fail = true;
    for (let i = 0; i < 7; i++) await newJob(s);
    const later = await newJob(s, { status: 'Na później' });
    s.f.fail = false;
    clock = new Date(clock.getTime() + 5 * 60_000);
    await pollTick(s.deps);
    expect(s.f.channels.size).toBe(5);
    await pollTick(s.deps);
    expect(s.f.channels.size).toBe(7);
    clock = new Date(clock.getTime() + 5 * 60_000);
    await pollTick(s.deps);
    expect(get(s.deps.db, later.id)!.pumbleChannelId).toBeNull();
  });

  it('e-mail użytkownika: małe litery, walidacja; pracownik nie widzi cudzych e-maili', async () => {
    const s = await setup();
    const put = (email: string) => s.app.request(`/api/users/${s.b2.user.id}`, req(s.admin, 'PUT', { email }));
    expect(((await (await put(' Jan.K@Firma.PL ')).json()) as any).email).toBe('jan.k@firma.pl');
    expect((await put('nie-email')).status).toBe(400);
    expect(((await (await put('')).json()) as any).email).toBeNull();
    const snap = (await (await s.app.request('/api/snapshot', req(s.worker, 'GET'))).json()) as any;
    const us = snap.records.filter((r: any) => r.entity === 'users');
    expect(us.map((r: any) => r.data.email)).toEqual(['b1@firma.pl']);
  });
});
