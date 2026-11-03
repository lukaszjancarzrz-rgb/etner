import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { runOp } from '../../core/ops.js';
import { dict } from '../slowniki/schema.js';
import { addUser, loginCookie, testDeps } from '../../test-utils.js';
import { modules } from '../index.js';
import { create as newClient } from '../klienci/service.js';
import { seedBase } from '../slowniki/seed.js';
import { list } from '../slowniki/service.js';
import { defaultCycle, ensureFolder, findFolder } from './service.js';

async function setup() {
  const deps = testDeps();
  seedBase(deps.db);
  const app = createApp(deps, modules);
  const a = addUser(deps, { role: 'admin', name: 'Admin' });
  const w = addUser(deps, { name: 'Bartek' });
  const k = newClient(deps.db, a.user.id, { typ: 'osoba', nazwa: 'Jan Nowak', telefony: [], emaile: [], nip: '', notatki: '', site: { nazwa: '', adres: 'Krótka 1', miejscowosc: 'Zawoja', mapa: '', opis: '' } });
  return { deps, app, a, w, site: k.site!, admin: await loginCookie(app, a.login), worker: await loginCookie(app, w.login) };
}
const req = (cookie: string, method: string, body?: unknown) =>
  ({ method, headers: { cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const count = (s: Awaited<ReturnType<typeof setup>>, sql: string) => (s.deps.db.$client.prepare(sql).get() as { n: number }).n;

describe('paszport – dane', () => {
  it('ensureFolder: drugi raz (także dwa runOp z różnymi opId) zwraca tę samą teczkę, z domyślnym cyklem', async () => {
    const s = await setup();
    const f1 = ensureFolder(s.deps.db, s.w.user.id, s.site.id, 'Rekuperacja');
    expect(f1).toMatchObject({ siteId: s.site.id, kategoria: 'Rekuperacja', cyklMies: 6, przypomnienia: true, notatkaRozliczenie: '' });
    expect(ensureFolder(s.deps.db, s.w.user.id, s.site.id, 'Rekuperacja').id).toBe(f1.id);
    const r1 = runOp(s.deps.db, 'op-a', s.w.user.id, () => ensureFolder(s.deps.db, s.w.user.id, s.site.id, 'Klimatyzacja'));
    const r2 = runOp(s.deps.db, 'op-b', s.a.user.id, () => ensureFolder(s.deps.db, s.a.user.id, s.site.id, 'Klimatyzacja'));
    expect(r2.result.id).toBe(r1.result.id);
    expect(count(s, "select count(*) n from passport_folders where kategoria = 'Klimatyzacja'")).toBe(1);
    expect(count(s, "select count(*) n from changes where entity = 'passport_folders'")).toBe(2);
    expect(() => ensureFolder(s.deps.db, s.a.user.id, s.site.id, 'Nie ma')).toThrow('Nieznana kategoria');
    expect(() => ensureFolder(s.deps.db, s.a.user.id, 'brak', 'Elektryka')).toThrow('Nie znaleziono obiektu');
    // baza też pilnuje jednej aktywnej teczki
    expect(() => s.deps.db.$client.prepare("insert into passport_folders (id, created_at, updated_at, site_id, kategoria) values ('x', '', '', ?, 'Rekuperacja')").run(s.site.id)).toThrow(/UNIQUE/);
  });

  it('defaultCycle: rekuperacja 6, klimatyzacja i fotowoltaika 12, pozostałe brak', () => {
    expect(defaultCycle('Rekuperacja')).toBe(6);
    expect(defaultCycle('Klimatyzacja')).toBe(12);
    expect(defaultCycle('Fotowoltaika')).toBe(12);
    expect(defaultCycle('Elektryka')).toBeNull();
    expect(defaultCycle('constructor')).toBeNull();
  });

  it('słownik czynności serwisowych z kategorią; w działającej bazie dosiewany raz, z wpisami w changes', async () => {
    const s = await setup();
    expect(list(s.deps.db, 'czynnosc_serwisowa').find((d) => d.wartosc === 'Wymiana filtrów F7')).toMatchObject({ kategoria: 'Rekuperacja' });
    // baza sprzed modułu 2: słowniki są, czynności nie
    s.deps.db.delete(dict).run();
    s.deps.db.$client.prepare("insert into dict (id, created_at, updated_at, rodzaj, wartosc, kolejnosc) values ('k1', '', '', 'kategoria', 'Elektryka', 0)").run();
    seedBase(s.deps.db);
    seedBase(s.deps.db);
    expect(list(s.deps.db, 'czynnosc_serwisowa')).toHaveLength(14);
    expect(list(s.deps.db, 'ekipa')).toHaveLength(0); // inne rodzaje bez zmian
    expect(count(s, "select count(*) n from changes where entity = 'dict'")).toBe(14);
  });

  it('zmiana nazwy kategorii w słowniku zmienia nazwę teczki i kategorię czynności (R36)', async () => {
    const s = await setup();
    const f = ensureFolder(s.deps.db, s.a.user.id, s.site.id, 'Rekuperacja');
    const items = list(s.deps.db, 'kategoria').map((d) => ({ id: d.id, wartosc: d.wartosc === 'Rekuperacja' ? 'Wentylacja' : d.wartosc, kolor: d.kolor }));
    expect((await s.app.request('/api/dict/kategoria', req(s.admin, 'PUT', { items }))).status).toBe(200);
    expect(findFolder(s.deps.db, s.site.id, 'Wentylacja')?.id).toBe(f.id);
    expect(list(s.deps.db, 'czynnosc_serwisowa').find((d) => d.wartosc === 'Wymiana filtrów F7')).toMatchObject({ kategoria: 'Wentylacja' });
    expect(count(s, `select count(*) n from changes where entity = 'passport_folders' and action = 'update'`)).toBe(1);
  });

  it('PUT czynności: kategoria zostaje zapisana, nieznana kategoria → 400', async () => {
    const s = await setup();
    const put = (items: unknown[]) => s.app.request('/api/dict/czynnosc_serwisowa', req(s.admin, 'PUT', { items }));
    expect((await put([{ wartosc: 'Mycie', kategoria: 'Nie ma' }])).status).toBe(400);
    expect(await (await put([{ wartosc: 'Mycie', kategoria: 'Klimatyzacja' }])).json()).toMatchObject([{ wartosc: 'Mycie', kategoria: 'Klimatyzacja' }]);
  });
});
