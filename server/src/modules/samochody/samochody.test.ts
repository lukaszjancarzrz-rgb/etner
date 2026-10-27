import { describe, expect, it, vi } from 'vitest';
import { newId } from '@etner/shared';
import { createApp } from '../../app.js';
import { pushSubscriptions } from '../../core/schema-base.js';
import { addUser, loginCookie, testDeps } from '../../test-utils.js';
import { modules } from '../index.js';
import { seedBase } from '../slowniki/seed.js';
import * as uzytkownicy from '../uzytkownicy/service.js';

async function setup() {
  const push = vi.fn(async (_s: unknown, _p: string) => ({ statusCode: 201 }));
  const deps = testDeps({ push });
  seedBase(deps.db);
  const app = createApp(deps, modules);
  const a = addUser(deps, { role: 'admin', name: 'Admin' });
  const w = addUser(deps, { name: 'Bartek', ekipa: 'ekipa Bartek' });
  const w2 = addUser(deps, { name: 'Marek', ekipa: 'ekipa Marek' });
  const off = addUser(deps, { name: 'Wyłączony', active: false });
  const t = new Date().toISOString();
  for (const u of [a, w, w2, off]) deps.db.insert(pushSubscriptions).values({ id: newId(), userId: u.user.id, endpoint: u.user.name, p256dh: 'p', auth: 'a', createdAt: t, updatedAt: t }).run();
  const pb = uzytkownicy.createPerson(deps.db, a.user.id, { nazwa: 'Bartek', userId: w.user.id });
  const pm = uzytkownicy.createPerson(deps.db, a.user.id, { nazwa: 'Marek', userId: w2.user.id });
  return { deps, app, push, pb, pm, admin: await loginCookie(app, a.login), worker: await loginCookie(app, w.login), worker2: await loginCookie(app, w2.login) };
}
const req = (cookie: string, method: string, body?: unknown) =>
  ({ method, headers: { cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
const pushed = (push: ReturnType<typeof vi.fn>) => push.mock.calls.map((c) => ({ endpoint: (c[0] as { endpoint: string }).endpoint, ...JSON.parse(c[1] as string) }));

describe('samochody', () => {
  it('trzy auta z seeda (raz, z wpisem w changes); auta zmienia tylko admin', async () => {
    const { app, deps, admin, worker } = await setup();
    seedBase(deps.db); // drugie uruchomienie: bez duplikatów
    const cars = await (await app.request('/api/cars', req(worker, 'GET'))).json();
    expect(cars.map((c: { nazwa: string }) => c.nazwa)).toEqual(['Nowa Duża Toyota', 'Mała Toyota', 'Stary Ducato']);
    expect(deps.db.$client.prepare("select count(*) n from changes where entity = 'cars'").get()).toEqual({ n: 3 });
    expect((await app.request(`/api/cars/${cars[0].id}`, req(worker, 'PUT', { ekipa: 'ekipa Bartek' }))).status).toBe(403);
    expect((await app.request('/api/cars', req(worker, 'POST', { nazwa: 'Bus' }))).status).toBe(403);
    expect((await app.request(`/api/cars/${cars[0].id}`, req(admin, 'PUT', { ekipa: 'ekipa Nikt' }))).status).toBe(400);
    expect(await (await app.request(`/api/cars/${cars[0].id}`, req(admin, 'PUT', { ekipa: 'ekipa Bartek', nazwa: 'Toyota Duża' }))).json()).toMatchObject({ nazwa: 'Toyota Duża', ekipa: 'ekipa Bartek' });
    const bus = await (await app.request('/api/cars', req(admin, 'POST', { opId: 'op-bus', nazwa: 'Bus' }))).json();
    expect(await (await app.request('/api/cars', req(admin, 'POST', { opId: 'op-bus', nazwa: 'Bus' }))).json()).toEqual(bus); // idempotencja
    expect(await (await app.request('/api/cars', req(admin, 'GET'))).json()).toHaveLength(4);
    expect((await app.request(`/api/cars/${cars[0].id}`, req(admin, 'PUT', { ekipa: null }))).status).toBe(200);
  });

  it('usterkę zgłasza każdy (idempotentnie); naprawę planuje admin, push do wszystkich aktywnych z linkiem do usterki', async () => {
    const { app, admin, worker, worker2, push } = await setup();
    const [car] = await (await app.request('/api/cars', req(worker, 'GET'))).json();
    const f = await (await app.request('/api/car-faults', req(worker, 'POST', { opId: 'op-f', carId: car.id, opis: 'Zaświecił się check engine' }))).json();
    expect(await (await app.request('/api/car-faults', req(worker, 'POST', { opId: 'op-f', carId: car.id, opis: 'Zaświecił się check engine' }))).json()).toEqual(f);
    expect(await (await app.request('/api/car-faults', req(worker2, 'GET'))).json()).toHaveLength(1);
    expect((await app.request('/api/car-faults', req(worker, 'POST', { carId: 'nie-ma', opis: 'x' }))).status).toBe(400);
    expect(push).not.toHaveBeenCalled();

    expect((await app.request(`/api/car-faults/${f.id}`, req(worker, 'PUT', { naprawaDzien: '2026-11-03' }))).status).toBe(403);
    expect((await app.request(`/api/car-faults/${f.id}`, req(worker, 'DELETE'))).status).toBe(403);
    const r = await app.request(`/api/car-faults/${f.id}`, req(admin, 'PUT', { opId: 'op-n', naprawaDzien: '2026-11-03' }));
    expect(await r.json()).toMatchObject({ naprawaDzien: '2026-11-03' });
    const p = pushed(push);
    expect(p.map((x) => x.endpoint).sort()).toEqual(['Admin', 'Bartek', 'Marek']); // bez wyłączonego konta
    expect(p[0]).toMatchObject({ title: '🔧 Nowa Duża Toyota: naprawa 03.11.2026 – Zaświecił się check engine', url: `#auta~${f.id}` });
    push.mockClear();
    await app.request(`/api/car-faults/${f.id}`, req(admin, 'PUT', { opId: 'op-n', naprawaDzien: '2026-11-03' })); // powtórka: bez drugiego pusha
    await app.request(`/api/car-faults/${f.id}`, req(admin, 'PUT', { naprawaDzien: null })); // odwołanie: bez pusha
    expect(push).not.toHaveBeenCalled();
    await app.request(`/api/car-faults/${f.id}`, req(admin, 'PUT', { naprawaDzien: '2026-11-05' })); // nowy dzień: push
    expect(pushed(push)).toHaveLength(3);

    expect((await app.request(`/api/car-faults/${f.id}`, req(admin, 'DELETE'))).status).toBe(200);
    expect((await app.request(`/api/car-faults/${f.id}`, req(admin, 'DELETE'))).status).toBe(200); // powtórka z kolejki
    expect((await app.request('/api/car-faults/nie-ma', req(admin, 'DELETE'))).status).toBe(404);
    expect(await (await app.request('/api/car-faults', req(admin, 'GET'))).json()).toEqual([]);
  });

  it('harmonogram: dzień naprawy oznaczony u członków aktualnej ekipy auta; auto bez ekipy i usunięta usterka bez oznaczenia', async () => {
    const { app, admin, worker, pb, pm } = await setup();
    const [car] = await (await app.request('/api/cars', req(admin, 'GET'))).json();
    const f = await (await app.request('/api/car-faults', req(worker, 'POST', { carId: car.id, opis: 'Hamulce' }))).json();
    await app.request(`/api/car-faults/${f.id}`, req(admin, 'PUT', { naprawaDzien: '2026-11-03' }));
    const marks = async () => (await (await app.request('/api/schedule?from=2026-11-02&to=2026-11-04', req(worker, 'GET'))).json()).days
      .flatMap((d: { naprawy: unknown[] }) => d.naprawy);
    expect(await marks()).toEqual([]); // auto bez ekipy
    await app.request(`/api/cars/${car.id}`, req(admin, 'PUT', { ekipa: 'ekipa Bartek' }));
    expect(await marks()).toEqual([{ dzien: '2026-11-03', personId: pb.id, tekst: 'Nowa Duża Toyota w naprawie', faultId: f.id }]);
    await app.request(`/api/cars/${car.id}`, req(admin, 'PUT', { ekipa: 'ekipa Marek' })); // ekipa w chwili oglądania
    expect((await marks()).map((m: { personId: string }) => m.personId)).toEqual([pm.id]);
    await app.request(`/api/car-faults/${f.id}`, req(admin, 'DELETE'));
    expect(await marks()).toEqual([]);
  });

  it('zmiana nazwy ekipy w słowniku przenosi się na auta; ekipy z autem nie można usunąć', async () => {
    const { app, admin, deps } = await setup();
    const [car] = await (await app.request('/api/cars', req(admin, 'GET'))).json();
    await app.request(`/api/cars/${car.id}`, req(admin, 'PUT', { ekipa: 'ekipa Marek' }));
    const ek = (await (await app.request('/api/dict', req(admin, 'GET'))).json()).filter((d: { rodzaj: string }) => d.rodzaj === 'ekipa');
    const items = ek.map((d: { id: string; wartosc: string }) => ({ id: d.id, wartosc: d.wartosc === 'ekipa Marek' ? 'ekipa Marka' : d.wartosc }));
    expect((await app.request('/api/dict/ekipa', req(admin, 'PUT', { items }))).status).toBe(200);
    expect((await (await app.request('/api/cars', req(admin, 'GET'))).json())[0].ekipa).toBe('ekipa Marka');
    expect(deps.db.$client.prepare("select count(*) n from changes where entity = 'cars' and action = 'update'").get()).toEqual({ n: 2 });
    const r = await app.request('/api/dict/ekipa', req(admin, 'PUT', { items: items.filter((i: { wartosc: string }) => i.wartosc !== 'ekipa Marka') }));
    expect(r.status).toBe(409);
  });
});
