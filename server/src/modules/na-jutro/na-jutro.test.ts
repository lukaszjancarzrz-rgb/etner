import { describe, expect, it, vi } from 'vitest';
import { newId } from '@etner/shared';
import { createApp } from '../../app.js';
import { rankoTick } from '../../core/cron.js';
import { pushSubscriptions } from '../../core/schema-base.js';
import { addUser, loginCookie, testDeps } from '../../test-utils.js';
import { modules } from '../index.js';
import { seedBase } from '../slowniki/seed.js';
import { naJutro } from './index.js';
import { listTemplates } from './service.js';

async function setup() {
  const push = vi.fn(async (_s: unknown, _p: string) => ({ statusCode: 201 }));
  const deps = testDeps({ push, now: () => new Date('2026-03-10T05:00:00Z') });
  seedBase(deps.db);
  const app = createApp(deps, modules);
  const a = addUser(deps, { role: 'admin', name: 'Admin' });
  const w1 = addUser(deps, { name: 'Bartek', ekipa: 'ekipa A' });
  const w1b = addUser(deps, { name: 'Bartek2', ekipa: 'ekipa A' });
  const w2 = addUser(deps, { name: 'Marek', ekipa: 'ekipa B' });
  const t = new Date().toISOString();
  for (const u of [a, w1, w1b, w2]) deps.db.insert(pushSubscriptions).values({ id: newId(), userId: u.user.id, endpoint: u.user.name, p256dh: 'p', auth: 'a', createdAt: t, updatedAt: t }).run();
  const c = async (u: { login: string }) => loginCookie(app, u.login);
  return { deps, app, push, a, w1, w1b, w2, admin: await c(a), c1: await c(w1), c1b: await c(w1b), c2: await c(w2) };
}
const req = (cookie: string, method: string, body?: unknown) =>
  ({ method, headers: { cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const pushed = (push: ReturnType<typeof vi.fn>) => push.mock.calls.map((c) => ({ endpoint: (c[0] as { endpoint: string }).endpoint, ...JSON.parse(c[1] as string) }));

describe('na jutro', () => {
  it('dodanie przez członka ekipy: push do ekipy bez autora, tytuł i adres', async () => {
    const { app, c1, push, w1b } = await setup();
    const res = await app.request('/api/checklists', req(c1, 'POST', { ekipa: 'ekipa A', dzien: '2026-03-11', tekst: 'Drabina' }));
    expect(res.status).toBe(200);
    const row = await res.json();
    const p = pushed(push);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ endpoint: w1b.user.name, title: '📦 ekipa A – 2026-03-11: do zabrania', body: 'Drabina', url: `#jutro~${row.id}` });
  });

  it('obca ekipa: nie dodaje, nie widzi listy ani zmian', async () => {
    const { app, c1, c2, admin } = await setup();
    expect((await app.request('/api/checklists', req(c2, 'POST', { ekipa: 'ekipa A', dzien: '2026-03-11', tekst: 'x' }))).status).toBe(403);
    const row = await (await app.request('/api/checklists', req(c1, 'POST', { ekipa: 'ekipa A', dzien: '2026-03-11', tekst: 'Drabina' }))).json();
    expect(await (await app.request('/api/checklists', req(c2, 'GET'))).json()).toEqual([]);
    expect(await (await app.request('/api/checklists', req(admin, 'GET'))).json()).toHaveLength(1);
    const ch2 = await (await app.request('/api/changes?since=0', req(c2, 'GET'))).json();
    expect(JSON.stringify(ch2)).not.toContain('Drabina');
    const ch1 = await (await app.request('/api/changes?since=0', req(c1, 'GET'))).json();
    expect(JSON.stringify(ch1)).toContain('Drabina');
    expect((await app.request(`/api/checklists/${row.id}/zabrane`, req(c2, 'POST', { zabrane: true }))).status).toBe(404);
  });

  it('odhaczenie przez członka OK, zmiana treści przez niego 403, admin OK', async () => {
    const { app, c1, c1b, admin, w1b } = await setup();
    const row = await (await app.request('/api/checklists', req(c1, 'POST', { ekipa: 'ekipa A', dzien: '2026-03-11', tekst: 'Drabina' }))).json();
    const on = await (await app.request(`/api/checklists/${row.id}/zabrane`, req(c1b, 'POST', { zabrane: true }))).json();
    expect(on).toMatchObject({ zabrane: true, zabraneBy: w1b.user.id });
    expect(on.zabraneAt).toBeTruthy();
    const off = await (await app.request(`/api/checklists/${row.id}/zabrane`, req(c1b, 'POST', { zabrane: false }))).json();
    expect(off).toMatchObject({ zabrane: false, zabraneBy: null, zabraneAt: null });
    expect((await app.request(`/api/checklists/${row.id}`, req(c1b, 'PUT', { tekst: 'Inne' }))).status).toBe(403);
    expect((await app.request(`/api/checklists/${row.id}`, req(admin, 'PUT', { tekst: 'Inne' }))).status).toBe(200);
  });

  it('usuwanie: autor lub admin, inny pracownik 403', async () => {
    const { app, c1, c1b, admin } = await setup();
    const mk = async () => (await (await app.request('/api/checklists', req(c1, 'POST', { ekipa: 'ekipa A', dzien: '2026-03-11', tekst: 'Drabina' }))).json()).id;
    const id = await mk();
    expect((await app.request(`/api/checklists/${id}`, req(c1b, 'DELETE'))).status).toBe(403);
    expect((await app.request(`/api/checklists/${id}`, req(c1, 'DELETE'))).status).toBe(200);
    const id2 = await mk();
    expect((await app.request(`/api/checklists/${id2}`, req(admin, 'DELETE'))).status).toBe(200);
    expect(await (await app.request('/api/checklists', req(admin, 'GET'))).json()).toEqual([]);
  });

  it('cron rano: tylko ekipy z niezabranymi rzeczami na dziś', async () => {
    const { deps, app, c1, admin, push, w1, w1b, w2 } = await setup();
    const mk = async (ck: string, ekipa: string, dzien: string, tekst: string) => (await (await app.request('/api/checklists', req(ck, 'POST', { ekipa, dzien, tekst }))).json()).id;
    const done = await mk(c1, 'ekipa A', '2026-03-10', 'Zrobione już');
    const wiertarka = await mk(c1, 'ekipa A', '2026-03-10', 'Wiertarka');
    await mk(admin, 'ekipa B', '2026-03-10', 'Kabel');
    await mk(admin, 'ekipa B', '2026-03-11', 'Jutrzejsze');
    await app.request(`/api/checklists/${done}/zabrane`, req(c1, 'POST', { zabrane: true }));
    // ekipa C: wszystko zabrane -> brak pushu
    const c = await mk(admin, 'ekipa C', '2026-03-10', 'Młotek');
    await app.request(`/api/checklists/${c}/zabrane`, req(admin, 'POST', { zabrane: true }));
    push.mockClear();
    const def = naJutro.cron!.find((d) => d.schedule === 'rano')!;
    await def.run(deps);
    const p = pushed(push);
    expect(p.map((x) => x.endpoint).sort()).toEqual([w1.user.name, w1b.user.name, w2.user.name].sort());
    expect(p.find((x) => x.endpoint === w1.user.name)!.body).toContain('Wiertarka');
    expect(p.find((x) => x.endpoint === w1.user.name)!.body).not.toContain('Zrobione już');
    expect(p.find((x) => x.endpoint === w1.user.name)).toMatchObject({ title: '📦 Do zabrania dziś: 1', url: `#jutro~${wiertarka}` });
    expect(p.find((x) => x.endpoint === w2.user.name)!.body).not.toContain('Jutrzejsze');
    // godzina 'rano' w Warszawie (06:00Z = 07:00 CET) odpala def przez rankoTick
    push.mockClear();
    await rankoTick(deps, [def], new Date('2026-03-10T06:00:00Z'));
    expect(push).toHaveBeenCalled();
  });

  it('przeniesienie do innej ekipy nie wycieka nowej treści do starej', async () => {
    const { app, c1, c2, admin, deps } = await setup();
    const w3 = addUser(deps, { name: 'Trzeci', ekipa: 'ekipa C' });
    const c3 = await loginCookie(app, w3.login);
    const row = await (await app.request('/api/checklists', req(c1, 'POST', { ekipa: 'ekipa A', dzien: '2026-03-11', tekst: 'Drabina' }))).json();
    const r = await app.request(`/api/checklists/${row.id}`, req(admin, 'PUT', { ekipa: 'ekipa B', tekst: 'Nowy' }));
    expect(r.status).toBe(200);
    const ch = async (ck: string) => ((await (await app.request('/api/changes?since=0', req(ck, 'GET'))).json()).changes as { entity: string; action: string; data: unknown }[]).filter((x) => x.entity === 'checklists');
    const a = await ch(c1);
    expect(JSON.stringify(a)).not.toContain('Nowy');
    expect(a.at(-1)).toMatchObject({ action: 'delete' });
    expect(JSON.stringify(await ch(c2))).toContain('Nowy');
    expect(await ch(c3)).toEqual([]);
  });

  it('listy predefiniowane: seed idempotentny, czyta każdy, zmienia tylko admin', async () => {
    const { app, deps, admin, c1, c2 } = await setup();
    const names = (await (await app.request('/api/checklist-templates', req(c2, 'GET'))).json()).map((t: { nazwa: string }) => t.nazwa);
    expect(names).toEqual(['Elektryka', 'Montaż fotowoltaiki', 'Alarm', 'Kamery', 'Reku przygotówka', 'Reku rozkładanie instalacji', 'Montaż rekuperatora', 'Rozciąganie rur klimy', 'Montaż klimy']);
    seedBase(deps.db);
    expect(listTemplates(deps.db)).toHaveLength(9);
    expect(listTemplates(deps.db).find((t) => t.nazwa === 'Montaż klimy')).toMatchObject({ kategorie: ['Klimatyzacja'], rodzaje: [], pozycje: [] });
    const body = { nazwa: 'Serwis klimy', kategorie: ['Klimatyzacja'], rodzaje: ['serwis'], pozycje: ['Manometry', 'Odkurzacz'] };
    expect((await app.request('/api/checklist-templates', req(c1, 'POST', body))).status).toBe(403);
    expect((await app.request('/api/checklist-templates', req(admin, 'POST', { ...body, nazwa: ' ' }))).status).toBe(400);
    const t = await (await app.request('/api/checklist-templates', req(admin, 'POST', body))).json();
    expect(t).toMatchObject({ ...body, kolejnosc: 9 });
    expect((await app.request(`/api/checklist-templates/${t.id}`, req(c1, 'PUT', { pozycje: [] }))).status).toBe(403);
    const u = await (await app.request(`/api/checklist-templates/${t.id}`, req(admin, 'PUT', { pozycje: ['Odkurzacz', 'Manometry', 'Pompa'] }))).json();
    expect(u).toMatchObject({ nazwa: 'Serwis klimy', pozycje: ['Odkurzacz', 'Manometry', 'Pompa'] });
    // pracownik dostaje zmiany list (synchronizacja)
    const ch = (await (await app.request('/api/changes?since=0', req(c2, 'GET'))).json()).changes as { entity: string; id: string }[];
    expect(ch.filter((x) => x.entity === 'checklist_templates' && x.id === t.id)).toHaveLength(2);
    expect((await app.request(`/api/checklist-templates/${t.id}`, req(c1, 'DELETE'))).status).toBe(403);
    expect((await app.request(`/api/checklist-templates/${t.id}`, req(admin, 'DELETE'))).status).toBe(200);
    expect((await app.request(`/api/checklist-templates/${t.id}`, req(admin, 'DELETE'))).status).toBe(404);
    expect(listTemplates(deps.db)).toHaveLength(9);
    // usunięte listy seedu nie wracają przy restarcie
    for (const x of listTemplates(deps.db)) await app.request(`/api/checklist-templates/${x.id}`, req(admin, 'DELETE'));
    seedBase(deps.db);
    expect(listTemplates(deps.db)).toHaveLength(0);
  });

  it('słowniki: zmiana nazwy kategorii zmienia ją w listach predefiniowanych; wartość w liście jest „w użyciu”', async () => {
    const { app, admin } = await setup();
    const dict = (await (await app.request('/api/dict', req(admin, 'GET'))).json()) as { id: string; rodzaj: string; wartosc: string; grupa: string | null; kolor: string | null; platne: boolean | null }[];
    const kat = dict.filter((d) => d.rodzaj === 'kategoria');
    const items = kat.map((d) => ({ id: d.id, wartosc: d.wartosc === 'Fotowoltaika' ? 'PV' : d.wartosc, grupa: d.grupa, kolor: d.kolor, platne: d.platne }));
    expect((await app.request('/api/dict/kategoria', req(admin, 'PUT', { items }))).status).toBe(200);
    const ts = (await (await app.request('/api/checklist-templates', req(admin, 'GET'))).json()) as { nazwa: string; kategorie: string[] }[];
    expect(ts.find((t) => t.nazwa === 'Kamery')!.kategorie).toEqual(['Elektryka', 'PV']);
    // usunięcie wartości użytej w liście: odmowa
    const r = await app.request('/api/dict/kategoria', req(admin, 'PUT', { items: items.filter((i) => i.wartosc !== 'Klimatyzacja') }));
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ error: 'WARTOSC_W_UZYCIU', value: 'Klimatyzacja' });
  });
});
