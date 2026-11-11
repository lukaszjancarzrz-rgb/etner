import ExcelJS from 'exceljs';
import { newId } from '@etner/shared';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { addUser, loginCookie, testDeps } from '../../test-utils.js';
import { create as newClient } from '../klienci/service.js';
import { modules } from '../index.js';
import { seedBase } from '../slowniki/seed.js';
import { jobs } from '../zlecenia/schema.js';
import { costs, kpirMonths, revenues } from './schema.js';

/** Arkusz z danymi syntetycznymi w układzie prawdziwego skoroszytu. */
async function skoroszyt(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet('Pracownicy').getCell('D4').value = 2026;
  const p = wb.addWorksheet('Przychody');
  // kolumny: C kat, E data, G inny, H lokalizacja, I inwestor, J zakres, K bez faktury, L brutto, M stawka, P netto, R nr fv
  const prz = (r: number, v: Record<number, ExcelJS.CellValue>) => Object.entries(v).forEach(([c, x]) => { p.getCell(r, Number(c)).value = x; });
  prz(7, { 3: 'RW', 5: new Date('2026-03-10T00:00:00Z'), 8: 'Zawoja', 9: 'Kowalski', 10: 'rekuperacja', 11: 1000, 16: 1000 });
  prz(8, { 3: 'E', 5: new Date('2026-03-20T00:00:00Z'), 7: 'Maj', 9: 'Nieznany', 12: 1080, 13: 'VAT 8%', 16: { formula: 'L8/1.08', result: 1000 }, 18: 'FV/1' });
  prz(9, { 3: 'V', 5: new Date('2026-04-02T00:00:00Z'), 9: 'Urząd', 11: 300, 16: 300 });
  const k = wb.addWorksheet('Koszty');
  const kos = (r: number, v: Record<number, ExcelJS.CellValue>) => Object.entries(v).forEach(([c, x]) => { k.getCell(r, Number(c)).value = x; });
  kos(7, { 3: new Date('2026-03-05T00:00:00Z'), 4: 'III', 5: 'FV/A', 6: 'Hurtownia', 7: 'kable', 8: 'Materiały i towary', 9: 100.1, 10: '12 towary', 13: 'tak' });
  kos(8, { 3: new Date('2026-04-06T00:00:00Z'), 4: 'IV', 5: 'FV/B', 8: 'Wymyślona', 9: 50, 10: '13 uboczne', 13: 'nie' });
  const q = wb.addWorksheet('Kontrola KPiR');
  q.getCell(8, 2).value = 'Marzec';
  q.getCell(8, 3).value = 2000.5;
  q.getCell(8, 6).value = 100.1;
  q.getCell(9, 2).value = 'Kwiecień'; // same zera = pominięty
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function setup() {
  const deps = testDeps();
  seedBase(deps.db);
  const app = createApp(deps, modules);
  const a = addUser(deps, { role: 'admin', name: 'Admin' });
  const w = addUser(deps, { name: 'Pracownik' });
  const klient = newClient(deps.db, a.user.id, { typ: 'osoba', nazwa: 'Kowalski', telefony: [], emaile: [], nip: '', notatki: '', site: { nazwa: '', adres: '', miejscowosc: 'Zawoja', mapa: '', opis: '' } }).client;
  const t = new Date().toISOString();
  deps.db.insert(jobs).values({ id: newId(), firmaId: klient.firmaId, numer: 'Z1', clientId: klient.id, status: 'Nowe', kategoria: 'Rekuperacja', createdAt: t, updatedAt: t }).run();
  return { deps, app, admin: await loginCookie(app, a.login), worker: await loginCookie(app, w.login) };
}
const post = async (app: ReturnType<typeof createApp>, cookie: string, q = '') => {
  const fd = new FormData();
  fd.set('plik', new File([await skoroszyt()], 'arkusz.xlsx'));
  return app.request(`/api/finanse/import-xlsx${q}`, { method: 'POST', headers: { cookie }, body: fd });
};

describe('przeniesienie finansów z arkusza', () => {
  it('próba nic nie zapisuje, prawdziwy zapis tak; dopasowanie do zlecenia; drugi import 409', async () => {
    const { deps, app, admin, worker } = await setup();
    const n = () => [revenues, costs, kpirMonths].map((t) => deps.db.select().from(t).all().length);
    expect((await post(app, worker)).status).toBe(403);

    const proba = await post(app, admin);
    expect(await proba.json()).toEqual({ przychody: 3, dopasowane: 1, doPrzejrzenia: 2, koszty: 2, kpirMiesiace: 1 });
    expect(n()).toEqual([0, 0, 0]);

    expect(await (await post(app, admin, '?naprawde=1')).json()).toMatchObject({ przychody: 3, koszty: 2 });
    expect(n()).toEqual([3, 2, 1]);
    const r = deps.db.select().from(revenues).all();
    const rw = r.find((x) => x.kategoria === 'Rekuperacja')!;
    expect(rw).toMatchObject({ sposob: 'bez', nettoGr: 100000, miesiac: '2026-03' });
    expect(rw.jobId).toBeTruthy();
    expect(r.find((x) => x.klient === 'Nieznany')).toMatchObject({ jobId: null, sposob: 'vat8', kwotaGr: 108000, nettoGr: 100000, vatGr: 8000, innyMiesiac: '2026-05', miesiac: '2026-05', nrFaktury: 'FV/1' });
    expect(r.find((x) => x.klient === 'Urząd')).toMatchObject({ sposob: 'zwrot', kwotaGr: 30000 });
    const c = deps.db.select().from(costs).all();
    expect(c.find((x) => x.nrDokumentu === 'FV/B')).toMatchObject({ kategoria: 'Inne', kolumnaKpir: 13, doWyniku: false, miesiac: '2026-04', nettoGr: 5000 });
    expect(deps.db.select().from(kpirMonths).get()).toMatchObject({ miesiac: '2026-03', przychodGr: 200050, towaryGr: 10010, uboczneGr: 0 });

    const drugi = await post(app, admin, '?naprawde=1');
    expect(drugi.status).toBe(409);
    expect(n()).toEqual([3, 2, 1]);
  });
});
