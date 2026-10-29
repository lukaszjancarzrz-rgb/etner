import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { desc, eq } from 'drizzle-orm';
import { addUser, loginCookie, testDeps } from '../test-utils.js';
import { recordChange } from './changes.js';
import { revokeUser } from './auth.js';
import { registerModules } from './registry.js';
import { errors, firmy, settings, users } from './schema-base.js';
import { dbIdOf } from './sync.js';

// 'firmy': tylko admin; 'users': widoczne dla wszystkich, bez pola `tajne`. Encja 'nikt' nie ma właściciela.
async function setup() {
  const deps = testDeps();
  const app = createApp(deps);
  registerModules(app, deps, [{
    name: 'test', routes() {}, tables: { firmy, users },
    visibleTo: (u, ch) => {
      if (ch.entity === 'users') return { ...ch, after: ch.after && { ...ch.after, tajne: undefined } };
      return u.role === 'admin';
    },
  }]);
  const a = addUser(deps, { role: 'admin' });
  const w = addUser(deps);
  return { deps, app, admin: await loginCookie(app, a.login), worker: await loginCookie(app, w.login) };
}
const get = (app: Awaited<ReturnType<typeof setup>>['app'], url: string, cookie: string) =>
  app.request(url, { headers: { cookie } });

describe('GET /api/changes', () => {
  it('wymaga sesji', async () => {
    const { app } = await setup();
    expect((await app.request('/api/changes?since=0')).status).toBe(401);
    expect((await app.request('/api/snapshot')).status).toBe(401);
    expect((await app.request('/api/stream?since=0')).status).toBe(401);
  });

  it('pracownik nie dostaje zmiany tylko dla admina ani encji bez właściciela; admin dostaje (encja bez właściciela też)', async () => {
    const { deps, app, admin, worker } = await setup();
    recordChange(deps.db, null, 'firmy', 'f1', 'create', null, { id: 'f1' });
    recordChange(deps.db, null, 'nikt', 'n1', 'create', null, { id: 'n1' });
    const ids = async (c: string) => ((await (await get(app, '/api/changes?since=0', c)).json()) as any).changes.map((x: any) => x.entity);
    expect(await ids(admin)).toEqual(['firmy', 'nikt']);
    expect(await ids(worker)).toEqual([]);
  });

  it('przycina pola, nie zwraca before, delete niesie after', async () => {
    const { deps, app, worker } = await setup();
    recordChange(deps.db, null, 'users', 'u1', 'update', { a: 0, tajne: 'x' }, { a: 1, tajne: 'x' });
    recordChange(deps.db, null, 'users', 'u1', 'delete', { a: 1 }, { a: 1, deletedAt: 'z' });
    const body = (await (await get(app, '/api/changes?since=0', worker)).json()) as any;
    expect(body.changes[0]).toEqual({ seq: 1, entity: 'users', id: 'u1', action: 'update', data: { a: 1 }, by: null });
    expect(body.changes[0].data).not.toHaveProperty('tajne');
    expect(body.changes[1].data).toEqual({ a: 1, deletedAt: 'z' });
    expect(JSON.stringify(body)).not.toContain('before');
    expect(body.last).toBe(2);
  });

  it('since większy niż ostatni (baza odtworzona) → reset; since = ostatni → zwykła pusta strona', async () => {
    const { deps, app, admin } = await setup();
    recordChange(deps.db, null, 'firmy', 'f1', 'create', null, {});
    const body = (await (await get(app, '/api/changes?since=99', admin)).json()) as any;
    expect(body).toMatchObject({ changes: [], reset: true });
    const same = (await (await get(app, '/api/changes?since=1', admin)).json()) as any;
    expect(same).toMatchObject({ changes: [], last: 1, more: false });
    expect(same.reset).toBeUndefined();
  });

  it('db: ten sam identyfikator bazy w changes i snapshot, zapisany w settings; nowy po skasowaniu (odtworzenie)', async () => {
    const { deps, app, admin } = await setup();
    const a = ((await (await get(app, '/api/changes?since=0', admin)).json()) as any).db;
    expect(a).toMatch(/^[\w-]{8,}$/);
    expect(((await (await get(app, '/api/snapshot', admin)).json()) as any).db).toBe(a);
    expect(dbIdOf(deps.db)).toBe(a);
    deps.db.delete(settings).run();
    expect(dbIdOf(deps.db)).not.toBe(a);
  });

  it('600 zmian → 500 i more, potem reszta', async () => {
    const { deps, app, admin } = await setup();
    for (let i = 0; i < 600; i++) recordChange(deps.db, null, 'firmy', `f${i}`, 'create', null, {});
    const p1 = (await (await get(app, '/api/changes?since=0', admin)).json()) as any;
    expect(p1.changes).toHaveLength(500);
    expect(p1).toMatchObject({ more: true, last: 500 });
    const p2 = (await (await get(app, `/api/changes?since=${p1.last}`, admin)).json()) as any;
    expect(p2.changes).toHaveLength(100);
    expect(p2.more).toBe(false);
  });
});

describe('GET /api/snapshot', () => {
  it('ten sam filtr: admin widzi wiersze, pracownik nie; usunięte pominięte; last = max seq', async () => {
    const { deps, app, admin, worker } = await setup();
    const row = { id: 'f1', createdAt: 't', createdBy: null, updatedAt: 't', deletedAt: null, nazwa: 'A', skrot: 'A', prefiksZ: 'Z', prefiksL: 'L' };
    deps.db.insert(firmy).values(row).run();
    deps.db.insert(firmy).values({ ...row, id: 'f2', deletedAt: 'x' }).run();
    recordChange(deps.db, null, 'firmy', 'f1', 'create', null, row);
    const a = (await (await get(app, '/api/snapshot', admin)).json()) as any;
    expect(a.records.filter((r: any) => r.entity === 'firmy')).toEqual([{ entity: 'firmy', id: 'f1', data: row }]);
    expect(a.last).toBe(1);
    const w = (await (await get(app, '/api/snapshot', worker)).json()) as any;
    expect(w.records.filter((r: any) => r.entity === 'firmy')).toEqual([]);
  });
});

async function open(app: Awaited<ReturnType<typeof setup>>['app'], cookie: string) {
  const res = await get(app, '/api/stream?since=0', cookie);
  expect(res.headers.get('content-type')).toContain('text/event-stream');
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';
  return {
    async next(): Promise<{ id: string; data: any }> {
      for (;;) {
        const m = buf.match(/event: change\nid: (\d+)\ndata: (.*)\n\n|event: change\ndata: (.*)\nid: (\d+)\n\n/);
        if (m) { buf = buf.slice(m.index! + m[0].length); return { id: m[1] ?? m[4]!, data: JSON.parse(m[2] ?? m[3]!) }; }
        const { value, done } = await reader.read();
        if (done) throw new Error('koniec strumienia');
        buf += dec.decode(value);
      }
    },
    close: () => reader.cancel(),
  };
}

describe('GET /api/stream', () => {
  it('backlog i zmiany na żywo, filtrowane per użytkownik', async () => {
    const { deps, app, admin, worker } = await setup();
    recordChange(deps.db, null, 'firmy', 'f0', 'create', null, { id: 'f0' }); // backlog
    const sa = await open(app, admin);
    const sw = await open(app, worker);
    expect((await sa.next()).data).toMatchObject({ entity: 'firmy', id: 'f0' });
    recordChange(deps.db, null, 'firmy', 'f1', 'create', null, { id: 'f1' }); // tylko admin
    recordChange(deps.db, null, 'nikt', 'n1', 'create', null, {}); // tylko admin
    recordChange(deps.db, null, 'users', 'u1', 'update', null, { a: 1, tajne: 's' }); // wszyscy
    expect((await sa.next()).data).toMatchObject({ id: 'f1' });
    expect((await sa.next()).data).toMatchObject({ id: 'n1' });
    const last = await sa.next();
    expect(last).toMatchObject({ id: '4', data: { seq: 4, entity: 'users', data: { a: 1 } } });
    // pracownik: pierwsze, co dostaje, to zmiana publiczna (nic z admina po drodze)
    const w = await sw.next();
    expect(w).toMatchObject({ id: '4', data: { entity: 'users' } });
    expect(JSON.stringify(w)).not.toContain('tajne');
    await sa.close();
    await sw.close();
  });
});

describe('strumień: błędy i sesja', () => {
  const drained = async (res: Response) => {
    const r = res.body!.getReader();
    let s = '';
    for (;;) { const { value, done } = await r.read(); if (done) return s; s += new TextDecoder().decode(value); }
  };

  it('błąd visibleTo jest logowany, a strumień się kończy', async () => {
    const deps = testDeps();
    const app = createApp(deps);
    registerModules(app, deps, [{ name: 'zly', routes() {}, tables: { firmy }, visibleTo: () => { throw new Error('boom'); } }]);
    const { login } = addUser(deps, { role: 'admin' });
    recordChange(deps.db, null, 'firmy', 'f1', 'create', null, {});
    await drained(await get(app, '/api/stream?since=0', await loginCookie(app, login)));
    expect(deps.db.select().from(errors).orderBy(desc(errors.id)).get()?.message).toContain('boom');
  });

  it('unieważniona sesja: session-expired i koniec strumienia', async () => {
    const { deps, app } = await setup();
    const w = addUser(deps);
    const cookie = await loginCookie(app, w.login);
    const res = await get(app, '/api/stream?since=0', cookie);
    revokeUser(deps.db, w.user.id);
    recordChange(deps.db, null, 'users', 'u1', 'update', null, { a: 1 });
    const body = await drained(res);
    expect(body).toContain('event: session-expired');
    expect(body).not.toContain('event: change');
  });

  it('admin zdegradowany przy otwartym strumieniu: resync, koniec strumienia, żadnej zmiany tylko dla admina', async () => {
    const { deps, app } = await setup();
    const a = addUser(deps, { role: 'admin' });
    const res = await get(app, '/api/stream?since=0', await loginCookie(app, a.login));
    deps.db.update(users).set({ role: 'pracownik' }).where(eq(users.id, a.user.id)).run();
    recordChange(deps.db, null, 'firmy', 'f1', 'create', null, { id: 'f1' });
    const body = await drained(res);
    expect(body).toContain('event: resync');
    expect(body).not.toContain('event: change');
  });

  it('zmiana uprawnień też kończy strumień; zmiana nazwy nie', async () => {
    const { deps, app } = await setup();
    const w = addUser(deps, { ekipa: 'A' });
    const s = await open(app, await loginCookie(app, w.login));
    deps.db.update(users).set({ name: 'Inny' }).where(eq(users.id, w.user.id)).run();
    recordChange(deps.db, null, 'users', 'u1', 'update', null, { a: 1 });
    expect((await s.next()).data).toMatchObject({ data: { a: 1 } });
    deps.db.update(users).set({ perms: ['finanse'] }).where(eq(users.id, w.user.id)).run();
    recordChange(deps.db, null, 'users', 'u1', 'update', null, { a: 2 });
    await expect(s.next()).rejects.toThrow('koniec strumienia');
  });

  it('Last-Event-ID wyprzedza since', async () => {
    const { deps, app, admin } = await setup();
    for (let i = 0; i < 3; i++) recordChange(deps.db, null, 'firmy', `f${i}`, 'create', null, {});
    const res = await app.request('/api/stream?since=0', { headers: { cookie: admin, 'last-event-id': '2' } });
    const reader = res.body!.getReader();
    const { value } = await reader.read();
    const txt = new TextDecoder().decode(value);
    await reader.cancel();
    expect(txt).toContain('id: 3');
    expect(txt).not.toContain('id: 2');
  });

  it('moduł z tables bez visibleTo: tylko admin', async () => {
    const deps = testDeps();
    const app = createApp(deps);
    registerModules(app, deps, [{ name: 'gol', routes() {}, tables: { firmy } }]);
    recordChange(deps.db, null, 'firmy', 'f1', 'create', null, {});
    const a = await loginCookie(app, addUser(deps, { role: 'admin' }).login);
    const w = await loginCookie(app, addUser(deps).login);
    expect(((await (await get(app, '/api/changes?since=0', a)).json()) as any).changes).toHaveLength(1);
    expect(((await (await get(app, '/api/changes?since=0', w)).json()) as any).changes).toHaveLength(0);
  });
});
