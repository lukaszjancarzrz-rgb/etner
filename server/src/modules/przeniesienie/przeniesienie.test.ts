import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { tx } from '../../core/db.js';
import { addUser, loginCookie, testDeps } from '../../test-utils.js';
import { modules } from '../index.js';
import { seedBase } from '../slowniki/seed.js';
import { fixtureXlsx } from '../../scripts/migrate-old/fixtures.js';
import * as zlecenia from '../zlecenia/service.js';
import * as svc from './service.js';

async function setup() {
  const deps = testDeps();
  seedBase(deps.db);
  const app = createApp(deps, modules);
  const a = addUser(deps, { role: 'admin', name: 'Admin' });
  const w = addUser(deps);
  tx(deps.db, () => svc.add(deps.db, a.user.id, [{ co: 'harmonogram', arkusz: 'Harmonogram', wiersz: 285, dzien: '2026-10-08', osoba: 'Bartek', tekst: 'Nowk', opis: 'Wpis nie pasuje do hasła', ile: 1, pominiete: false }]));
  return { deps, app, admin: await loginCookie(app, a.login), worker: await loginCookie(app, w.login) };
}
const req = (cookie: string, method: string, body?: unknown) =>
  ({ method, headers: { cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

describe('przeniesienie – do przejrzenia', () => {
  it('admin odhacza pozycję; pracownik nie widzi listy ani zmian i nie pisze', async () => {
    const { app, admin, worker, deps } = await setup();
    const [r] = svc.list(deps.db);
    const res = await app.request(`/api/migration-review/${r!.id}`, req(admin, 'PUT', { przejrzane: true }));
    expect(res.status).toBe(200);
    expect(svc.list(deps.db)[0]!.przejrzane).toBe(true);
    expect((await app.request(`/api/migration-review/${r!.id}`, req(worker, 'PUT', { przejrzane: false }))).status).toBe(403);
    expect((await app.request('/api/migration-review', req(worker, 'GET'))).status).toBe(403);
    for (const url of ['/api/changes?since=0', '/api/snapshot']) {
      expect(JSON.stringify(await (await app.request(url, req(worker, 'GET'))).json())).not.toContain('Nowk');
      expect(JSON.stringify(await (await app.request(url, req(admin, 'GET'))).json())).toContain('Nowk');
    }
    expect((await app.request('/api/migration-review/brak', req(admin, 'PUT', { przejrzane: true }))).status).toBe(404);
  });
});

describe('przeniesienie – wgranie arkusza', () => {
  const post = async (app: ReturnType<typeof createApp>, cookie: string, file: Buffer | null, q = '') => {
    const fd = new FormData();
    if (file) fd.set('file', new File([new Uint8Array(file)], 'arkusz.xlsx'));
    return app.request(`/api/migration-import${q}`, { method: 'POST', headers: { cookie }, body: fd });
  };
  async function fresh() {
    const deps = testDeps();
    seedBase(deps.db);
    const app = createApp(deps, modules);
    const a = addUser(deps, { role: 'admin', name: 'Admin' });
    const w = addUser(deps);
    return { deps, app, admin: await loginCookie(app, a.login), worker: await loginCookie(app, w.login) };
  }

  it('próba nic nie zapisuje; prawdziwe przeniesienie zwraca hasła raz; drugie odmawia (409); pracownik 403', async () => {
    const { deps, app, admin, worker } = await fresh();
    const xlsx = await fixtureXlsx();
    expect((await post(app, worker, xlsx)).status).toBe(403);
    expect((await post(app, admin, null)).status).toBe(400);
    expect((await post(app, admin, Buffer.from('nie arkusz'))).status).toBe(415);

    const dry = await post(app, admin, xlsx);
    expect(dry.status).toBe(200);
    expect(dry.headers.get('cache-control')).toBe('no-store');
    const d = await dry.json() as { naprawde: boolean; wiersze: { roznica: number | null }[]; doPrzejrzenia: number; konta: { haslo: string }[] };
    expect(d.naprawde).toBe(false);
    expect(d.wiersze.length).toBeGreaterThan(0);
    expect(d.wiersze.every((w) => w.roznica === null || w.roznica === 0)).toBe(true);
    expect(d.doPrzejrzenia).toBeGreaterThan(0);
    expect(d.konta.every((k) => k.haslo === '')).toBe(true);
    expect(zlecenia.list(deps.db)).toHaveLength(0);
    expect(svc.list(deps.db)).toHaveLength(0);

    const real = await (await post(app, admin, xlsx, '?naprawde=1')).json() as typeof d;
    expect(real.naprawde).toBe(true);
    expect(real.konta.length).toBeGreaterThan(0);
    expect(real.konta.every((k) => k.haslo.length >= 8)).toBe(true);
    expect(zlecenia.list(deps.db).length).toBeGreaterThan(0);
    expect(svc.list(deps.db)).toHaveLength(real.doPrzejrzenia);

    const again = await post(app, admin, xlsx, '?naprawde=1');
    expect(again.status).toBe(409);
    expect((await again.json() as { error: string }).error).toMatch(/Baza nie jest pusta/);
    // niepusta baza: 409 bez czytania pliku, także w próbie i dla pliku, który nie jest arkuszem
    expect((await post(app, admin, xlsx)).status).toBe(409);
    expect((await post(app, admin, Buffer.from('nie arkusz'))).status).toBe(409);
    expect(JSON.stringify(deps.db.$client.prepare('select * from errors').all())).not.toContain(real.konta[0]!.haslo);
  });

  it('za duży plik → 413 przed wczytaniem', async () => {
    const { app, admin } = await fresh();
    expect((await post(app, admin, Buffer.alloc(11 * 1024 * 1024))).status).toBe(413);
  });
});
