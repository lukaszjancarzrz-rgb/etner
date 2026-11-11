import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { addUser, loginCookie, testDeps } from '../../test-utils.js';
import { modules } from '../index.js';
import { seedBase } from '../slowniki/seed.js';

async function setup() {
  const deps = testDeps();
  seedBase(deps.db);
  const app = createApp(deps, modules);
  const a = addUser(deps, { role: 'admin', name: 'Admin' });
  const w = addUser(deps, { name: 'Pracownik' });
  return { deps, app, admin: await loginCookie(app, a.login), worker: await loginCookie(app, w.login) };
}
const req = (cookie: string, method: string, body?: unknown) =>
  ({ method, headers: { cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

const plik = {
  format: 'etner-kpir-1', miesiac: '2026-10',
  kpir: { przychod: 5000, towary: 150.5, uboczne: 20, wynagrodzenia: 0, pozostale: 0 },
  koszty: [
    { data: '2026-10-03', nrDokumentu: 'FV/1', kontrahent: 'Hurtownia', opis: 'kable', kategoria: 'Materiały i towary', netto: 100.1, kolumnaKpir: 12 },
    { data: '2026-10-04', nrDokumentu: 'FV/2', kontrahent: 'Stacja', opis: 'paliwo', kategoria: 'Nieznana', netto: 30.3, kolumnaKpir: 13 },
  ],
};

describe('finanse', () => {
  it('przychód: netto/VAT/miesiąc liczy serwer, zmiana sposobu przelicza', async () => {
    const { app, admin } = await setup();
    const r = await (await app.request('/api/revenues', req(admin, 'POST', { sposob: 'vat23', kwotaGr: 12300, dzien: '2026-10-28' }))).json();
    expect(r).toMatchObject({ nettoGr: 10000, vatGr: 2300, miesiac: '2026-10' });
    const u = await (await app.request(`/api/revenues/${r.id}`, req(admin, 'PUT', { sposob: 'bez', innyMiesiac: '2026-11' }))).json();
    expect(u).toMatchObject({ nettoGr: 12300, vatGr: 0, miesiac: '2026-11' });
    expect((await app.request(`/api/revenues/${r.id}`, req(admin, 'DELETE'))).status).toBe(200);
    expect((await app.request(`/api/revenues/${r.id}`, req(admin, 'DELETE'))).status).toBe(200);
    expect((await app.request('/api/revenues/nie-ma', req(admin, 'DELETE'))).status).toBe(404);
  });

  it('pracownik: 403 i brak encji w changes', async () => {
    const { app, admin, worker } = await setup();
    await app.request('/api/revenues', req(admin, 'POST', { sposob: 'bez', kwotaGr: 100, dzien: '2026-10-01' }));
    await app.request('/api/costs/kpir-import?naprawde=1', req(admin, 'POST', plik));
    for (const [m, p, b] of [['GET', '/api/revenues'], ['POST', '/api/revenues', { sposob: 'bez', kwotaGr: 1 }], ['GET', '/api/costs'], ['POST', '/api/costs/kpir-import', plik]] as const) {
      expect((await app.request(p, req(worker, m, b))).status).toBe(403);
    }
    const ch = (await (await app.request('/api/changes?since=0', req(worker, 'GET'))).json()) as { changes: { entity: string }[] };
    expect(ch.changes.filter((x) => ['revenues', 'costs', 'kpir_months'].includes(x.entity))).toEqual([]);
  });

  it('import KPiR: próba, prawdziwy zapis, duplikaty, różnice, nieznana kategoria', async () => {
    const { app, admin } = await setup();
    const imp = async (q = '') => (await app.request(`/api/costs/kpir-import${q}`, req(admin, 'POST', plik))).json();
    const count = async () => ((await (await app.request('/api/costs', req(admin, 'GET'))).json()) as unknown[]);
    const proba = await imp();
    expect(proba).toMatchObject({ dodane: 2, duplikaty: 0 });
    expect(await count()).toHaveLength(0);
    expect(await (await app.request('/api/kpir', req(admin, 'GET'))).json()).toEqual([]);
    expect(await imp('?naprawde=1')).toMatchObject({ dodane: 2, sumy: { 12: 10010, 13: 3030, 14: 0, 15: 0 }, roznice: { towary: 10010 - 15050, uboczne: 3030 - 2000, wynagrodzenia: 0, pozostale: 0 } });
    const koszty = (await count()) as { kategoria: string; uwagi: string }[];
    expect(koszty).toHaveLength(2);
    expect(koszty.find((k) => k.kategoria === 'Inne')!.uwagi).toContain('kategoria z pliku: Nieznana');
    expect(await (await app.request('/api/kpir', req(admin, 'GET'))).json()).toMatchObject([{ miesiac: '2026-10', towaryGr: 15050 }]);
    expect(await imp('?naprawde=1')).toMatchObject({ dodane: 0, duplikaty: 2 });
    expect(await count()).toHaveLength(2);
  });

  it('zmiana nazwy wartości słownika kategoria_kosztu zmienia costs.kategoria', async () => {
    const { app, admin } = await setup();
    await app.request('/api/costs/kpir-import?naprawde=1', req(admin, 'POST', plik));
    const items = ((await (await app.request('/api/dict', req(admin, 'GET'))).json()) as { rodzaj: string; wartosc: string; kategoria?: string }[]).filter((x) => x.rodzaj === 'kategoria_kosztu');
    const nowe = items.map((x) => (x.wartosc === 'Materiały i towary' ? { ...x, wartosc: 'Materiały' } : x));
    const r = await app.request('/api/dict/kategoria_kosztu', req(admin, 'PUT', { items: nowe, zamien: { 'Materiały i towary': 'Materiały' } }));
    expect(r.status).toBe(200);
    expect(((await (await app.request('/api/costs', req(admin, 'GET'))).json()) as { kategoria: string }[]).map((k) => k.kategoria)).toContain('Materiały');
  });

  it('ustawienia: domyślne i zapis', async () => {
    const { app, admin } = await setup();
    expect(await (await app.request('/api/settings/finanse', req(admin, 'GET'))).json()).toEqual({ autoPrzychod: false, domyslnySposob: 'vat8' });
    const r = await (await app.request('/api/settings/finanse', req(admin, 'PUT', { autoPrzychod: true, domyslnySposob: 'bez' }))).json();
    expect(r).toEqual({ autoPrzychod: true, domyslnySposob: 'bez' });
  });
});
