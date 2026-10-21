import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { testDeps } from '../test-utils.js';
import { changeBus, changesSince, recordChange } from './changes.js';
import { openDb, migrate, tx } from './db.js';
import { runOp } from './ops.js';
import { registerModules } from './registry.js';
import { HTTPException } from 'hono/http-exception';
import { changes, errors, opIds } from './schema-base.js';

const fresh = () => {
  const db = openDb(':memory:');
  migrate(db);
  return db;
};

describe('dziennik zmian', () => {
  it('seq rośnie, changesSince zwraca tylko późniejsze', () => {
    const db = fresh();
    const a = recordChange(db, 'u1', 'client', 'c1', 'create', null, { x: 1 });
    const b = recordChange(db, null, 'client', 'c1', 'update', { x: 1 }, { x: 2 });
    expect(b).toBeGreaterThan(a);
    const rows = changesSince(db, a, 100);
    expect(rows.map((r) => r.seq)).toEqual([b]);
    expect(rows[0]).toMatchObject({ before: { x: 1 }, after: { x: 2 }, userId: null });
  });

  it('changeBus emituje dopiero po commit, nie po rollbacku', () => {
    const db = fresh();
    const seen: number[] = [];
    const on = (s: number) => seen.push(s);
    changeBus.on('change', on);
    tx(db, (t) => {
      const s = recordChange(t, 'u', 'e', '1', 'create', null, {});
      expect(seen).toEqual([]);
      return s;
    });
    expect(seen).toHaveLength(1);
    expect(() => tx(db, (t) => { recordChange(t, 'u', 'e', '2', 'create', null, {}); throw new Error('x'); })).toThrow();
    expect(seen).toHaveLength(1);
    expect(db.select().from(changes).all()).toHaveLength(1);
    changeBus.off('change', on);
  });

  it('tx jest re-entrantna', () => {
    const db = fresh();
    expect(tx(db, () => tx(db, () => 5))).toBe(5);
  });
});

describe('runOp', () => {
  it('ten sam opId: fn raz, drugi raz dup z tym samym wynikiem', () => {
    const db = fresh();
    let n = 0;
    const fn = () => ({ n: ++n });
    const a = runOp(db, 'op1', 'u', fn);
    const b = runOp(db, 'op1', 'u', fn);
    expect(a).toEqual({ result: { n: 1 }, dup: false });
    expect(b).toEqual({ result: { n: 1 }, dup: true });
    expect(n).toBe(1);
  });

  it('wyjątek: brak op_ids i brak zmian', () => {
    const db = fresh();
    expect(() =>
      runOp(db, 'op2', 'u', () => {
        recordChange(db, 'u', 'e', '1', 'create', null, {});
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(db.select().from(opIds).all()).toHaveLength(0);
    expect(db.select().from(changes).all()).toHaveLength(0);
  });
});

describe('onError i rejestr', () => {
  it('5xx zapisuje w errors i zwraca polski komunikat; HTTPException zostaje', async () => {
    const deps = testDeps();
    const app = createApp(deps);
    registerModules(app, deps, [
      {
        name: 't',
        routes(a) {
          a.get('/api/boom', () => { throw new Error('kaboom'); });
          a.get('/api/teapot', () => { throw new HTTPException(403, { message: 'Brak uprawnień' }); });
        },
      },
    ]);
    const r = await app.request('/api/boom');
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ error: 'Błąd serwera – spróbuj ponownie.' });
    const rows = deps.db.select().from(errors).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.message).toContain('kaboom');
    const h = await app.request('/api/teapot');
    expect(h.status).toBe(403);
    expect(await h.json()).toEqual({ error: 'Brak uprawnień' });
    expect(deps.db.select().from(errors).all()).toHaveLength(1);
  });
});
