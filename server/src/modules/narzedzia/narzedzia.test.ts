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
  const w2 = addUser(deps, { name: 'Drugi' });
  const admin = await loginCookie(app, a.login);
  const cars = await (await app.request('/api/cars', req(admin, 'GET'))).json();
  return { deps, app, cars, admin, worker: await loginCookie(app, w.login), worker2: await loginCookie(app, w2.login) };
}
const req = (cookie: string, method: string, body?: unknown) =>
  ({ method, headers: { cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

describe('narzędzia', () => {
  it('dodaje admin (idempotentnie); auto wymaga podmiejsca, Magazyn go nie ma; czyta każdy', async () => {
    const { app, admin, worker2, cars } = await setup();
    const t = await (await app.request('/api/tools', req(admin, 'POST', { opId: 'op-t', nazwa: 'Wkrętarka', carId: cars[1].id, podmiejsce: 'Górna półka na regale' }))).json();
    expect(t).toMatchObject({ nazwa: 'Wkrętarka', carId: cars[1].id, podmiejsce: 'Górna półka na regale' });
    expect(await (await app.request('/api/tools', req(admin, 'POST', { opId: 'op-t', nazwa: 'Wkrętarka', carId: cars[1].id, podmiejsce: 'Górna półka na regale' }))).json()).toEqual(t);
    expect(await (await app.request('/api/tools', req(admin, 'POST', { nazwa: 'Drabina', carId: null }))).json()).toMatchObject({ carId: null, podmiejsce: null });
    expect((await app.request('/api/tools', req(admin, 'POST', { nazwa: 'X', carId: cars[0].id }))).status).toBe(400);
    expect((await app.request('/api/tools', req(admin, 'POST', { nazwa: 'X', carId: null, podmiejsce: 'Nad kabiną' }))).status).toBe(400);
    expect((await app.request('/api/tools', req(admin, 'POST', { nazwa: 'X', carId: cars[0].id, podmiejsce: 'Na dachu' }))).status).toBe(400);
    expect((await app.request('/api/tools', req(admin, 'POST', { nazwa: 'X', carId: 'nie-ma', podmiejsce: 'Nad kabiną' }))).status).toBe(400);
    expect(await (await app.request('/api/tools', req(worker2, 'GET'))).json()).toHaveLength(2);
  });

  it('edycja i przeniesienie (admin); do Magazynu czyści podmiejsce; nazwa auta = nazwa miejsca', async () => {
    const { app, admin, worker, cars } = await setup();
    const t = await (await app.request('/api/tools', req(admin, 'POST', { nazwa: 'Poziomica', carId: cars[0].id, podmiejsce: 'Dolna półka' }))).json();
    expect(await (await app.request(`/api/tools/${t.id}`, req(admin, 'PUT', { carId: cars[2].id, podmiejsce: 'W kabinie', nazwa: 'Poziomica 2 m' }))).json())
      .toMatchObject({ carId: cars[2].id, podmiejsce: 'W kabinie', nazwa: 'Poziomica 2 m' });
    expect(await (await app.request(`/api/tools/${t.id}`, req(admin, 'PUT', { carId: null }))).json()).toMatchObject({ carId: null, podmiejsce: null });
    expect((await app.request(`/api/tools/${t.id}`, req(admin, 'PUT', { carId: cars[0].id }))).status).toBe(400); // auto bez podmiejsca
    expect((await app.request('/api/tools/nie-ma', req(admin, 'PUT', { nazwa: 'Y' }))).status).toBe(404);
    // R42: narzędzie wskazuje auto po id, więc zmiana nazwy auta nie rusza narzędzi
    await app.request(`/api/tools/${t.id}`, req(admin, 'PUT', { carId: cars[0].id, podmiejsce: 'Nad kabiną' }));
    await app.request(`/api/cars/${cars[0].id}`, req(admin, 'PUT', { nazwa: 'Toyota Hiace' }));
    expect((await (await app.request('/api/tools', req(worker, 'GET'))).json())[0].carId).toBe(cars[0].id);
  });

  it('pracownik nie dodaje, nie zmienia, nie przenosi i nie usuwa (403, R43); usuwa admin, powtórka 200', async () => {
    const { app, admin, worker, cars } = await setup();
    const id = (await (await app.request('/api/tools', req(admin, 'POST', { nazwa: 'Młotek', carId: null }))).json()).id;
    expect((await app.request('/api/tools', req(worker, 'POST', { nazwa: 'Drabina', carId: null }))).status).toBe(403);
    expect((await app.request(`/api/tools/${id}`, req(worker, 'PUT', { nazwa: 'Młotek 2' }))).status).toBe(403);
    expect((await app.request(`/api/tools/${id}`, req(worker, 'PUT', { carId: cars[0].id, podmiejsce: 'W kabinie' }))).status).toBe(403);
    expect((await app.request(`/api/tools/${id}`, req(worker, 'DELETE'))).status).toBe(403);
    expect(await (await app.request('/api/tools', req(worker, 'GET'))).json()).toMatchObject([{ id, nazwa: 'Młotek', carId: null }]);
    expect((await app.request(`/api/tools/${id}`, req(admin, 'DELETE'))).status).toBe(200);
    expect((await app.request(`/api/tools/${id}`, req(admin, 'DELETE'))).status).toBe(200);
    expect(await (await app.request('/api/tools', req(admin, 'GET'))).json()).toEqual([]);
  });
});
