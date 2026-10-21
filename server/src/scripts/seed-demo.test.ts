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
import { tasks } from '../modules/zadania/schema.js';
import { jobs } from '../modules/zlecenia/schema.js';
import { demoLinks, demoToken, seedDemo } from './seed-demo.js';

const n = (db: ReturnType<typeof testDeps>['db'], t: any) => db.select({ n: count() }).from(t).get()!.n;

async function seeded() {
  const deps = testDeps();
  seedBase(deps.db);
  const now = new Date('2026-10-21T10:00:00Z');
  const added = await seedDemo(deps.db, deps.files, { now, secret: deps.secret, photo: { w: 160, h: 120 } });
  return { deps, now, added };
}

describe('seedDemo', () => {
  it('na pustej bazie tworzy dane w liczbach z zadania, drugie wywołanie nic nie dodaje', async () => {
    const { deps, now, added } = await seeded();
    const { db } = deps;
    expect(added).toBe(true);
    expect(db.select().from(users).all().filter((u) => u.role === 'admin')).toHaveLength(2);
    const workers = db.select().from(users).all().filter((u) => u.role === 'pracownik');
    expect(workers).toHaveLength(5);
    expect(new Set(workers.map((w) => w.ekipa))).toEqual(new Set(['ekipa Bartek', 'ekipa Marek']));
    expect(n(db, schedulePeople)).toBeGreaterThanOrEqual(7);
    expect(n(db, clients)).toBe(12);
    expect(n(db, sites)).toBeGreaterThanOrEqual(12);
    expect(n(db, leads)).toBe(6);
    const js = db.select().from(jobs).all();
    expect(js).toHaveLength(14);
    expect(new Set(js.map((j) => j.status)).size).toBeGreaterThanOrEqual(6);
    expect(js.some((j) => j.ekipa)).toBe(true);
    expect(db.select().from(attachments).all().filter((a) => a.rodzaj === 'zdjecie' && a.ownerType === 'entry')).toHaveLength(10);
    expect(n(db, attachments)).toBe(10);
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
    expect(await seedDemo(db, deps.files, { now, secret: deps.secret, photo: { w: 160, h: 120 } })).toBe(false);
    expect([clients, jobs, leads, attachments, scheduleEntries, users].map((t) => n(db, t))).toEqual(before);
  });

  it('tokeny demo są deterministyczne i logują', async () => {
    const { deps } = await seeded();
    const app = createApp(deps, modules);
    const links = demoLinks(deps.db, deps.secret, 'https://x.test');
    expect(links).toHaveLength(7);
    expect(links[0]).toMatchObject({ name: expect.any(String), role: 'admin', link: `https://x.test/login#${demoToken(deps.secret, 'admin1')}` });
    expect(demoToken(deps.secret, 'prac1')).toBe(demoToken(deps.secret, 'prac1'));
    expect(demoToken(deps.secret, 'prac1')).not.toBe(demoToken('inny', 'prac1'));
    for (const l of links) {
      const cookie = await loginCookie(app, l.link.split('#')[1]!);
      expect(cookie).toContain('etner_s=');
    }
  });

  it('GET /api/demo/links tylko przy DEMO', async () => {
    const { deps } = await seeded();
    const off = createApp(deps, modules);
    expect((await off.request('/api/demo/links')).status).toBe(404);
    const on = createApp({ ...deps, demoLinks: (origin) => demoLinks(deps.db, deps.secret, origin) }, modules);
    const res = await on.request('http://demo.test/api/demo/links');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { name: string; role: string; ekipa: string | null; link: string }[];
    expect(body).toHaveLength(7);
    expect(body[0]!.link.startsWith('http://demo.test/login#')).toBe(true);
  });
});
