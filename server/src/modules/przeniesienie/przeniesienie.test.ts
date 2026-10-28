import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { tx } from '../../core/db.js';
import { addUser, loginCookie, testDeps } from '../../test-utils.js';
import { modules } from '../index.js';
import { seedBase } from '../slowniki/seed.js';
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
