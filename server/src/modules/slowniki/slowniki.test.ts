import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { addUser, loginCookie, testDeps } from '../../test-utils.js';
import { firmy } from '../../core/schema-base.js';
import { modules } from '../index.js';
import { seedBase } from './seed.js';
import { groupOf, list } from './service.js';
import { newId } from '@etner/shared';
import { create as newClient } from '../klienci/service.js';
import { save as saveJob, get as getJob } from '../zlecenia/service.js';
import { save as saveLead, get as getLead } from '../leady/service.js';
import { get as getUser, createPerson } from '../uzytkownicy/service.js';
import { scheduleEntries } from '../harmonogram/schema.js';
import { eq } from 'drizzle-orm';

async function setup() {
  const deps = testDeps();
  seedBase(deps.db);
  const app = createApp(deps, modules);
  const a = addUser(deps, { role: 'admin' });
  const w = addUser(deps);
  return { deps, app, admin: await loginCookie(app, a.login), worker: await loginCookie(app, w.login) };
}
const put = (app: any, rodzaj: string, cookie: string, items: unknown[]) =>
  app.request(`/api/dict/${rodzaj}`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ items }) });

describe('seed', () => {
  it('jest idempotentny i tworzy firmę ETNER', async () => {
    const { deps } = await setup();
    const n = list(deps.db, 'status_zlecenia').length;
    seedBase(deps.db);
    expect(list(deps.db, 'status_zlecenia')).toHaveLength(n);
    const f = deps.db.select().from(firmy).all();
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ skrot: 'ETNER', prefiksZ: 'Z', prefiksL: 'L' });
    expect(list(deps.db, 'status_leada')[3]!.wartosc).toBe('Przyjęta');
  });
});

describe('słowniki', () => {
  it('groupOf zwraca grupę statusu', async () => {
    const { deps } = await setup();
    expect(groupOf(deps.db, 'status_zlecenia', 'Rozliczone')).toBe('zamkniete');
    expect(groupOf(deps.db, 'status_zlecenia', 'Na później')).toBe('pozniej');
    expect(groupOf(deps.db, 'status_zlecenia', 'Nowe')).toBe('aktualne');
    expect(groupOf(deps.db, 'status_zlecenia', 'Nie ma')).toBeNull();
  });

  it('pracownik czyta, ale nie zapisuje (403)', async () => {
    const { app, worker } = await setup();
    expect((await app.request('/api/dict', { headers: { cookie: worker } })).status).toBe(200);
    expect((await put(app, 'ekipa', worker, [{ wartosc: 'x' }])).status).toBe(403);
    expect((await app.request('/api/dict')).status).toBe(401);
  });

  it('PUT podmienia listę: zachowuje id, usuwa miękko, zmienia kolejność, pracownik widzi zmiany', async () => {
    const { deps, app, admin, worker } = await setup();
    const before = list(deps.db, 'ekipa');
    const marek = before.find((r) => r.wartosc === 'ekipa Marek')!;
    const res = await put(app, 'ekipa', admin, [{ wartosc: 'ekipa Marek' }, { wartosc: 'ekipa Nowa' }]);
    expect(res.status).toBe(200);
    const after = list(deps.db, 'ekipa');
    expect(after.map((r) => r.wartosc)).toEqual(['ekipa Marek', 'ekipa Nowa']);
    expect(after[0]!.id).toBe(marek.id);
    const ch = (await (await app.request('/api/changes?since=0', { headers: { cookie: worker } })).json()) as any;
    expect(ch.changes.filter((c: any) => c.entity === 'dict').map((c: any) => c.action).sort()).toEqual(['create', 'delete', 'delete', 'update']);
    expect((await put(app, 'ekipa', admin, [{ wartosc: 'a' }, { wartosc: 'a' }])).status).toBe(400);
    expect((await put(app, 'nieznany', admin, [])).status).toBe(400);
  });

  it('zmiana nazwy po id idzie do rekordów: zlecenie zostaje zamknięte, lead zamknięty, ekipa użytkownika i kod w harmonogramie', async () => {
    const { deps, app, admin, worker } = await setup();
    const db = deps.db;
    const w = addUser(deps, { ekipa: 'ekipa Marek' });
    const k = newClient(db, w.user.id, { typ: 'osoba', nazwa: 'Nowak', telefony: [], emaile: [], nip: '', notatki: '', site: undefined });
    const job = saveJob(db, w.user.id, { clientId: k.client.id, status: 'Rozliczone', kategoria: 'Elektryka', ekipa: 'ekipa Marek', rodzaj: 'serwis' })!;
    const lead = saveLead(db, w.user.id, { temat: 'X', status: 'Przyjęta', zrodlo: 'Telefon' })!;
    const p = createPerson(db, w.user.id, { nazwa: 'Marek', userId: w.user.id });
    const t = new Date().toISOString();
    const entryId = newId();
    db.insert(scheduleEntries).values({ id: entryId, dzien: '2026-10-22', personId: p.id, rodzaj: 'kod', kod: 'L4', createdAt: t, updatedAt: t }).run();
    const items = (rodzaj: string, from: string, to: string) => list(db, rodzaj as never).map((r) => ({ id: r.id, wartosc: r.wartosc === from ? to : r.wartosc, grupa: r.grupa, kolor: r.kolor, platne: r.platne }));
    const before = list(db, 'status_zlecenia').find((r) => r.wartosc === 'Rozliczone')!;

    for (const [rodzaj, from, to] of [['status_zlecenia', 'Rozliczone', 'Rozliczone (FV)'], ['status_leada', 'Przyjęta', 'Wygrana'], ['ekipa', 'ekipa Marek', 'ekipa Marka'],
      ['kod_nieobecnosci', 'L4', 'Chorobowe'], ['kategoria', 'Elektryka', 'Elektryczne'], ['zrodlo', 'Telefon', 'Telefonicznie']] as const) {
      expect((await put(app, rodzaj, admin, items(rodzaj, from, to))).status).toBe(200);
    }
    expect(list(db, 'status_zlecenia').find((r) => r.wartosc === 'Rozliczone (FV)')!.id).toBe(before.id); // ten sam wiersz
    expect(getJob(db, job.id)).toMatchObject({ status: 'Rozliczone (FV)', kategoria: 'Elektryczne', ekipa: 'ekipa Marka' });
    expect(groupOf(db, 'status_zlecenia', getJob(db, job.id)!.status)).toBe('zamkniete');
    expect(getLead(db, lead.id)).toMatchObject({ status: 'Wygrana', zrodlo: 'Telefonicznie' });
    expect(groupOf(db, 'status_leada', 'Wygrana')).toBe('zamkniete');
    expect(getUser(db, w.user.id)!.ekipa).toBe('ekipa Marka');
    expect(db.select().from(scheduleEntries).where(eq(scheduleEntries.id, entryId)).get()!.kod).toBe('Chorobowe');

    // zmiany w changes (pracownik widzi swoje konto bez password_hash)
    const ch = (await (await app.request('/api/changes?since=0', { headers: { cookie: worker } })).json()) as any;
    expect(ch.changes.some((c: any) => c.entity === 'schedule_entries' && c.data?.kod === 'Chorobowe')).toBe(true);
    const wc = await loginCookie(app, w.login);
    const own = (await (await app.request('/api/changes?since=0', { headers: { cookie: wc } })).json()) as any;
    const u = own.changes.filter((c: any) => c.entity === 'users' && c.id === w.user.id).at(-1);
    expect(u.data.ekipa).toBe('ekipa Marka');
    expect(JSON.stringify(own.changes)).not.toContain('passwordHash');

    // zamiana na nazwę innej bieżącej wartości: 400
    expect((await put(app, 'ekipa', admin, items('ekipa', 'ekipa Bartek', 'mieszane'))).status).toBe(400);
  });

  it('usunięcie używanej wartości: 409 WARTOSC_W_UZYCIU; pusta lista statusów 400; zakupy dokładnie 2 statusy', async () => {
    const { deps, app, admin } = await setup();
    const w = addUser(deps, { ekipa: 'ekipa Bartek' });
    const keep = list(deps.db, 'ekipa').filter((r) => r.wartosc !== 'ekipa Bartek').map((r) => ({ id: r.id, wartosc: r.wartosc }));
    const res = await put(app, 'ekipa', admin, keep);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'WARTOSC_W_UZYCIU', value: 'ekipa Bartek', count: 1 });
    expect(list(deps.db, 'ekipa').map((r) => r.wartosc)).toContain('ekipa Bartek'); // nic się nie zmieniło
    expect(getUser(deps.db, w.user.id)!.ekipa).toBe('ekipa Bartek');
    expect((await put(app, 'ekipa', admin, [...keep, { wartosc: 'ekipa Bartek' }])).status).toBe(200); // bez id, po tekście: zostaje
    for (const r of ['status_zlecenia', 'status_leada', 'status_zadania', 'status_zakupu']) expect((await put(app, r, admin, [])).status).toBe(400);
    expect((await put(app, 'status_zakupu', admin, [{ wartosc: 'Do kupienia' }, { wartosc: 'Zamówione' }, { wartosc: 'Kupione' }])).status).toBe(400);
    expect((await put(app, 'grupa_zadan', admin, [])).status).toBe(200);
  });
});
