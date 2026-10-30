import { count, isNull } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { loginCookie, testDeps } from '../test-utils.js';
import { users } from '../core/schema-base.js';
import { modules } from '../modules/index.js';
import { attachments, diaryEntries } from '../modules/dziennik/schema.js';
import { scheduleDrafts, scheduleEntries } from '../modules/harmonogram/schema.js';
import { clients, sites } from '../modules/klienci/schema.js';
import { leads } from '../modules/leady/schema.js';
import { checklists } from '../modules/na-jutro/schema.js';
import { schedulePeople } from '../modules/uzytkownicy/schema.js';
import { seedBase } from '../modules/slowniki/seed.js';
import { shopping } from '../modules/zakupy/schema.js';
import { jobScopeItems } from '../modules/zlecenia/schema.js';
import { tasks } from '../modules/zadania/schema.js';
import { carFaults, cars } from '../modules/samochody/schema.js';
import { tools } from '../modules/narzedzia/schema.js';
import { warehouseItems } from '../modules/magazyn/schema.js';
import { jobs } from '../modules/zlecenia/schema.js';
import { DEMO_PASSWORD, demoAccounts, seedDemo } from './seed-demo.js';

const n = (db: ReturnType<typeof testDeps>['db'], t: any) => db.select({ n: count() }).from(t).get()!.n;

async function seeded() {
  const deps = testDeps();
  seedBase(deps.db);
  const now = new Date('2026-10-21T10:00:00Z');
  const added = await seedDemo(deps.db, deps.files, { now, photo: { w: 160, h: 120 } });
  return { deps, now, added };
}

describe('seedDemo', () => {
  it('na pustej bazie tworzy dane w liczbach z zadania, drugie wywołanie nic nie dodaje', async () => {
    const { deps, now, added } = await seeded();
    const { db } = deps;
    expect(added).toBe(true);
    expect(db.select().from(users).all().filter((u) => u.role === 'admin')).toHaveLength(2);
    expect(n(db, tools)).toBe(8);
    expect(db.select().from(warehouseItems).all().filter((r) => r.zabraneAt)).toHaveLength(2);
    const workers = db.select().from(users).all().filter((u) => u.role === 'pracownik');
    expect(workers).toHaveLength(5);
    expect(new Set(workers.map((w) => w.ekipa))).toEqual(new Set(['ekipa Bartek', 'ekipa Marek']));
    // kolumny harmonogramu tylko dla pracowników
    const sp = db.select().from(schedulePeople).all();
    expect(sp.map((p) => p.userId).sort()).toEqual(workers.map((w) => w.id).sort());
    expect(n(db, clients)).toBe(12);
    expect(n(db, sites)).toBeGreaterThanOrEqual(12);
    expect(n(db, leads)).toBe(6);
    const js = db.select().from(jobs).all();
    expect(js).toHaveLength(14);
    expect(new Set(js.map((j) => j.status)).size).toBeGreaterThanOrEqual(6);
    expect(js.some((j) => j.ekipa)).toBe(true);
    expect(db.select().from(attachments).all().filter((a) => a.rodzaj === 'zdjecie' && a.ownerType === 'entry')).toHaveLength(10);
    expect(n(db, attachments)).toBe(12);
    expect(db.select().from(cars).all().map((c) => c.ekipa)).toEqual(['ekipa Bartek', 'ekipa Marek', null]);
    expect(db.select().from(carFaults).all().filter((f) => f.naprawaDzien)).toHaveLength(2);
    expect(db.select().from(attachments).all().filter((a) => a.ownerType === 'scope')).toHaveLength(2);
    expect(n(db, jobScopeItems)).toBeGreaterThanOrEqual(15);
    expect(n(db, diaryEntries)).toBeGreaterThan(0);
    expect(n(db, scheduleEntries)).toBeGreaterThan(40);
    const d = db.select().from(scheduleDrafts).where(isNull(scheduleDrafts.deletedAt)).all();
    expect(d.length).toBeGreaterThanOrEqual(1);
    expect(d.length).toBeLessThanOrEqual(2);
    expect(n(db, shopping)).toBeGreaterThanOrEqual(3);
    expect(db.select().from(checklists).all().map((c) => c.dzien).filter((x, i, a) => a.indexOf(x) === i)).toHaveLength(2);
    expect(n(db, tasks)).toBeGreaterThanOrEqual(4);
    expect(db.select().from(tasks).all().some((t) => t.cykliczne)).toBe(true);
    expect(db.select().from(leads).all().some((l) => l.nastepny && l.nastepny <= now.toISOString().slice(0, 10))).toBe(true);

    const before = [clients, jobs, leads, attachments, scheduleEntries, users].map((t) => n(db, t));
    expect(await seedDemo(db, deps.files, { now, photo: { w: 160, h: 120 } })).toBe(false);
    expect([clients, jobs, leads, attachments, scheduleEntries, users].map((t) => n(db, t))).toEqual(before);
  });

  it('konta demo: loginy i wspólne hasło logują, hasło nie jest w bazie wprost', async () => {
    const { deps } = await seeded();
    const app = createApp(deps, modules);
    const konta = demoAccounts(deps.db);
    expect(konta).toHaveLength(7);
    expect(konta.map((k) => k.login)).toEqual(['tomek', 'anna', 'bartek', 'piotr', 'kamil', 'marek', 'adam']);
    expect(konta[0]).toEqual({ name: 'Tomasz Wrona', role: 'admin', ekipa: null, login: 'tomek', haslo: 'demo1234' });
    expect(DEMO_PASSWORD).toBe('demo1234');
    for (const k of konta) expect(await loginCookie(app, k.login, DEMO_PASSWORD)).toContain('etner_s=');
    expect(JSON.stringify(deps.db.$client.prepare('select * from users').all())).not.toContain(DEMO_PASSWORD);
  });

  it('GET /api/demo/konta tylko przy DEMO', async () => {
    const { deps } = await seeded();
    expect((await createApp(deps, modules).request('/api/demo/konta')).status).toBe(404);
    expect((await createApp(deps, modules).request('/api/demo/links')).status).toBe(404);
    const on = createApp({ ...deps, demoAccounts: () => demoAccounts(deps.db) }, modules);
    const res = await on.request('/api/demo/konta');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>[];
    expect(body).toHaveLength(7);
    expect(Object.keys(body[0]!).sort()).toEqual(['ekipa', 'haslo', 'login', 'name', 'role']);
  });
});
