import ExcelJS from 'exceljs';
import { PARAMETRY_2026 } from '@etner/shared';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { addUser, loginCookie, testDeps } from '../../test-utils.js';
import { modules } from '../index.js';
import { seedBase } from '../slowniki/seed.js';
import { createPerson as addPerson, deletePerson } from '../uzytkownicy/service.js';
import { payrollEntries, payrollMonths, payrollPeople, payrollRates } from './schema.js';

async function setup() {
  const deps = testDeps();
  seedBase(deps.db);
  const app = createApp(deps, modules);
  const a = addUser(deps, { role: 'admin', name: 'Admin' });
  const w = addUser(deps, { name: 'Pracownik' });
  const jan = addPerson(deps.db, a.user.id, { nazwa: 'Jan Kowalski' });
  return { deps, app, jan, adminId: a.user.id, admin: await loginCookie(app, a.login), worker: await loginCookie(app, w.login) };
}
const req = (cookie: string, method: string, body?: unknown) =>
  ({ method, headers: { cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const osoba = { forma: 'uop', umowaOd: '2026-01-01', umowaDo: null, bruttoGr: 480600, kosztRecznyGr: null, kupGr: null, urlopDni: 26, etat: 1, staz10: false, uwagi: '' };

describe('płace – API', () => {
  it('pracownik dostaje 403, osoba spoza harmonogramu 404', async () => {
    const { app, admin, worker, jan } = await setup();
    expect((await app.request(`/api/payroll/people/${jan.id}`, req(worker, 'PUT', osoba))).status).toBe(403);
    expect((await app.request('/api/settings/place', req(worker, 'GET'))).status).toBe(403);
    expect((await app.request('/api/payroll/people/nie-ma', req(admin, 'PUT', osoba))).status).toBe(404);
  });

  it('osoba usunięta z harmonogramu: płace dalej edytowalne, imię w /api/payroll/byli (tylko z danymi płac)', async () => {
    const { deps, app, admin, adminId, jan } = await setup();
    await app.request(`/api/payroll/people/${jan.id}`, req(admin, 'PUT', osoba));
    expect(await (await app.request('/api/payroll/byli', req(admin, 'GET'))).json()).toEqual([]);
    deletePerson(deps.db, adminId, jan.id);
    expect((await app.request(`/api/payroll/people/${jan.id}`, req(admin, 'PUT', { ...osoba, uwagi: 'praktyki' }))).status).toBe(200);
    expect(await (await app.request('/api/payroll/byli', req(admin, 'GET'))).json()).toEqual([{ id: jan.id, nazwa: jan.nazwa, kolejnosc: jan.kolejnosc }]);
    // powrót: ta sama osoba wraca do harmonogramu i znika z „byłych”
    expect((await app.request(`/api/schedule-people/${jan.id}/restore`, req(admin, 'POST'))).status).toBe(200);
    expect(await (await app.request('/api/payroll/byli', req(admin, 'GET'))).json()).toEqual([]);
    expect((await (await app.request('/api/schedule-people', req(admin, 'GET'))).json()).map((p: { id: string }) => p.id)).toContain(jan.id);
    expect((await app.request(`/api/schedule-people/${jan.id}/restore`, req(admin, 'POST'))).status).toBe(404);
  });

  it('osoba: upsert nie dubluje, miesiąc: upsert i usunięcie przy dwóch null', async () => {
    const { deps, app, admin, jan } = await setup();
    await app.request(`/api/payroll/people/${jan.id}`, req(admin, 'PUT', osoba));
    const r = await (await app.request(`/api/payroll/people/${jan.id}`, req(admin, 'PUT', { ...osoba, forma: 'zlecenie', staz10: true }))).json();
    expect(r).toMatchObject({ forma: 'zlecenie', staz10: true });
    expect(deps.db.select().from(payrollPeople).all()).toHaveLength(1);
    expect((await app.request(`/api/payroll/people/${jan.id}`, req(admin, 'PUT', { ...osoba, forma: 'zła' }))).status).toBe(400);

    const m = `/api/payroll/months/${jan.id}/2026-03`;
    await app.request(m, req(admin, 'PUT', { godziny: 160, kosztUmowyGr: null }));
    await app.request(m, req(admin, 'PUT', { godziny: 168, kosztUmowyGr: 100 }));
    expect(deps.db.select().from(payrollMonths).all()).toMatchObject([{ godziny: 168, kosztUmowyGr: 100, deletedAt: null }]);
    await app.request(m, req(admin, 'PUT', { godziny: null, kosztUmowyGr: null }));
    expect(deps.db.select().from(payrollMonths).all()[0]!.deletedAt).toBeTruthy();
    await app.request(m, req(admin, 'PUT', { godziny: 100, kosztUmowyGr: null })); // po usunięciu nowy wiersz
    expect(deps.db.select().from(payrollMonths).all()).toHaveLength(2);
    expect((await app.request(`/api/payroll/months/${jan.id}/2026-13`, req(admin, 'PUT', { godziny: 1, kosztUmowyGr: null }))).status).toBe(400);
  });

  it('stawki i wpisy: tworzenie, zmiana, usunięcie miękkie (powtórzone ok, nieznane 404), opId idempotentne', async () => {
    const { deps, app, admin, jan } = await setup();
    const s = await (await app.request('/api/payroll/rates', req(admin, 'POST', { personId: jan.id, odMiesiaca: '2026-01', stawkaGr: 3000, opId: 'o1' }))).json();
    await app.request('/api/payroll/rates', req(admin, 'POST', { personId: jan.id, odMiesiaca: '2026-01', stawkaGr: 3000, opId: 'o1' }));
    expect(deps.db.select().from(payrollRates).all()).toHaveLength(1);
    expect(await (await app.request(`/api/payroll/rates/${s.id}`, req(admin, 'PUT', { stawkaGr: 3500 }))).json()).toMatchObject({ stawkaGr: 3500, odMiesiaca: '2026-01' });
    expect((await app.request(`/api/payroll/rates/${s.id}`, req(admin, 'DELETE'))).status).toBe(200);
    expect((await app.request(`/api/payroll/rates/${s.id}`, req(admin, 'DELETE'))).status).toBe(200);
    expect((await app.request('/api/payroll/rates/nie-ma', req(admin, 'DELETE'))).status).toBe(404);
    expect((await app.request(`/api/payroll/rates/${s.id}`, req(admin, 'PUT', { stawkaGr: 1 }))).status).toBe(404);

    const e = await (await app.request('/api/payroll/entries', req(admin, 'POST', { personId: jan.id, miesiac: '2026-02', rodzaj: 'zaliczka', kwotaGr: 50000 }))).json();
    expect(e).toMatchObject({ dzien: null, opis: '', kwotaGr: 50000 });
    expect((await app.request(`/api/payroll/entries/${e.id}`, req(admin, 'PUT', { rodzaj: 'premia', opis: 'x' }))).status).toBe(200);
    expect((await app.request(`/api/payroll/entries/${e.id}`, req(admin, 'DELETE'))).status).toBe(200);
    expect(deps.db.select().from(payrollEntries).all()[0]).toMatchObject({ rodzaj: 'premia', opis: 'x' });
    expect(deps.db.select().from(payrollEntries).all()[0]!.deletedAt).toBeTruthy();
    expect((await app.request('/api/payroll/entries', req(admin, 'POST', { personId: jan.id, miesiac: '2026-02', rodzaj: 'zły', kwotaGr: 1 }))).status).toBe(400);
  });

  it('parametry: zapis mapy lat, walidacja klucza i zakresów', async () => {
    const { app, admin } = await setup();
    expect(await (await app.request('/api/settings/place', req(admin, 'GET'))).json()).toEqual({});
    expect((await app.request('/api/settings/place', req(admin, 'PUT', { '2026': PARAMETRY_2026 }))).status).toBe(200);
    expect(await (await app.request('/api/settings/place', req(admin, 'GET'))).json()).toEqual({ '2026': PARAMETRY_2026 });
    for (const zle of [{ '26': PARAMETRY_2026 }, { '2026': { ...PARAMETRY_2026, pit: 1.2 } }, { '2026': { ...PARAMETRY_2026, godzDnia: 0 } }, { '2026': { ...PARAMETRY_2026, urlopMax: 41 } }, { '2026': { ...PARAMETRY_2026, placaMinGr: 1.5 } }, { '2026': { ...PARAMETRY_2026, placaMinGr: -1 } }]) {
      expect((await app.request('/api/settings/place', req(admin, 'PUT', zle))).status).toBe(400);
    }
  });
});

/** Arkusz z danymi syntetycznymi w układzie prawdziwego skoroszytu. */
async function skoroszyt(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const set = (s: ExcelJS.Worksheet, r: number, c: number, v: ExcelJS.CellValue) => { s.getCell(r, c).value = v; };
  const prc = wb.addWorksheet('Pracownicy');
  set(prc, 4, 4, 2026);
  const wiersz = (r: number, v: Record<number, ExcelJS.CellValue>) => Object.entries(v).forEach(([c, x]) => set(prc, r, Number(c), x));
  wiersz(7, { 3: 'Jan Kowalski', 4: 'Umowa o pracę', 5: 30, 6: new Date('2026-01-01T00:00:00Z'), 8: 4806, 12: 26, 13: 1, 14: 'tak', 16: 'uwaga' });
  wiersz(8, { 3: 'Ewa Nieznana', 4: 'Umowa zlecenie', 5: 25 });
  wiersz(9, { 3: 'Adam Nowak', 4: 'Inna umowa (koszt ręcznie)', 9: 1500 });
  const par = wb.addWorksheet('Parametry');
  [[6, 4806], [7, 0.0976], [8, 0.015], [11, 0.12], [12, 300], [13, 250], [20, 7.5], [74, 20], [75, 26], [76, 8]].forEach(([r, v]) => set(par, r!, 3, v!));
  set(par, 24, 5, 250);
  const g = wb.addWorksheet('Godziny');
  set(g, 6, 4, 160); set(g, 6, 5, 168); // godziny Jana, styczeń–luty
  set(g, 19, 4, { formula: 'Pracownicy!E7', result: 30 }); // formuła = stawka podstawowa
  set(g, 19, 6, 35); // wyjątek tylko w marcu: w kwietniu powrót do podstawowej
  set(g, 30, 5, { formula: 'F6*1', result: 999 }); // formuła: ignorowana
  set(g, 30, 6, 1234.5); // koszt umowy w marcu
  const z = wb.addWorksheet('Zaliczki i dodatki');
  const wpis = (r: number, v: Record<number, ExcelJS.CellValue>) => Object.entries(v).forEach(([c, x]) => set(z, r, Number(c), x));
  wpis(10, { 4: 'Marzec', 5: 'Jan Kowalski', 6: 'Zaliczka / wypłata', 7: 500, 8: 'gotówka' });
  wpis(11, { 3: new Date('2026-04-15T00:00:00Z'), 5: 'jan kowalski', 6: 'Premia / dodatek', 7: 200.5 });
  wpis(12, { 4: 'Maj', 5: 'Ktoś Obcy', 6: 'Przelew na konto', 7: 10 });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('przeniesienie płac z arkusza', () => {
  const post = async (app: ReturnType<typeof createApp>, cookie: string, q = '') => {
    const fd = new FormData();
    fd.set('plik', new File([await skoroszyt()], 'arkusz.xlsx'));
    return app.request(`/api/payroll/import-xlsx${q}`, { method: 'POST', headers: { cookie }, body: fd });
  };

  it('próba nic nie zapisuje, zapis tak; nieznane osoby w ostrzeżeniach; 409 gdy niepuste', async () => {
    const { deps, app, admin, worker } = await setup();
    addPerson(deps.db, 'test', { nazwa: 'Adam Nowak' });
    const n = () => [payrollPeople, payrollRates, payrollMonths, payrollEntries].map((t) => deps.db.select().from(t).all().length);
    expect((await post(app, worker)).status).toBe(403);

    const proba = await (await post(app, admin)).json();
    expect(proba).toMatchObject({ rok: 2026, osoby: 2, stawki: 3, miesiace: 3, wpisy: 2 });
    expect(proba.ostrzezenia).toHaveLength(2);
    expect(proba.ostrzezenia.join('|')).toMatch(/Ewa Nieznana.*Ktoś Obcy/);
    expect(n()).toEqual([0, 0, 0, 0]);

    expect(await (await post(app, admin, '?naprawde=1')).json()).toMatchObject({ osoby: 2, stawki: 3, miesiace: 3, wpisy: 2 });
    expect(n()).toEqual([2, 3, 3, 2]);
    const jan = deps.db.select().from(payrollPeople).all().find((p) => p.forma === 'uop')!;
    expect(jan).toMatchObject({ umowaOd: '2026-01-01', bruttoGr: 480600, kupGr: 25000, urlopDni: 26, etat: 1, staz10: true, uwagi: 'uwaga' });
    expect(deps.db.select().from(payrollRates).all().map((r) => [r.odMiesiaca, r.stawkaGr]).sort()).toEqual([['2026-01', 3000], ['2026-03', 3500], ['2026-04', 3000]].sort());
    const mies = deps.db.select().from(payrollMonths).all().map((m) => [m.miesiac, m.godziny, m.kosztUmowyGr]).sort();
    expect(mies).toEqual([['2026-01', 160, null], ['2026-02', 168, null], ['2026-03', null, 123450]]);
    expect(deps.db.select().from(payrollEntries).all().map((e) => [e.miesiac, e.dzien, e.rodzaj, e.kwotaGr]).sort()).toEqual([['2026-03', null, 'zaliczka', 50000], ['2026-04', '2026-04-15', 'premia', 20050]]);
    const ust = await (await app.request('/api/settings/place', req(admin, 'GET'))).json();
    expect(ust['2026']).toMatchObject({ placaMinGr: 480600, godzDnia: 7.5, kwotaZmnGr: 30000, kupGr: 25000, emF: PARAMETRY_2026.emF });

    expect((await post(app, admin, '?naprawde=1')).status).toBe(409);
    expect(n()).toEqual([2, 3, 3, 2]);
  });

  it('plik niebędący arkuszem: 415, brak kart: 422', async () => {
    const { app, admin } = await setup();
    const fd = new FormData();
    fd.set('plik', new File(['zwykły tekst'], 'a.xlsx'));
    expect((await app.request('/api/payroll/import-xlsx', { method: 'POST', headers: { cookie: admin }, body: fd })).status).toBe(415);
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Inna');
    const fd2 = new FormData();
    fd2.set('plik', new File([Buffer.from(await wb.xlsx.writeBuffer())], 'b.xlsx'));
    expect((await app.request('/api/payroll/import-xlsx', { method: 'POST', headers: { cookie: admin }, body: fd2 })).status).toBe(422);
  });
});
