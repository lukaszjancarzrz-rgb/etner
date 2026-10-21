import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate as drizzleMigrate } from 'drizzle-orm/better-sqlite3/migrator';
import { describe, expect, it } from 'vitest';
import { migrate, openDb } from './db.js';

const SRC = fileURLToPath(new URL('../../drizzle', import.meta.url));
/** Baza po migracjach do `tag` włącznie (kopia katalogu z przyciętym dziennikiem). */
function dbUpTo(tag: string) {
  const dir = mkdtempSync(join(tmpdir(), 'etner-mig-'));
  cpSync(SRC, dir, { recursive: true });
  const jf = join(dir, 'meta', '_journal.json');
  const j = JSON.parse(readFileSync(jf, 'utf8'));
  j.entries = j.entries.slice(0, j.entries.findIndex((e: { tag: string }) => e.tag === tag) + 1);
  writeFileSync(jf, JSON.stringify(j));
  const db = openDb(':memory:');
  drizzleMigrate(db, { migrationsFolder: dir });
  return db;
}
const T = '2026-10-01T10:00:00.000Z';

describe('migracje z danymi', () => {
  it('0010: zakupy bez kwoty/sklepu/grupy, Zamówione -> Do kupienia, słowniki miękko usunięte z wpisem w changes', () => {
    const db = dbUpTo('0009_cute_grey_gargoyle');
    const c = db.$client;
    const dict = c.prepare('insert into dict (id, created_at, updated_at, rodzaj, wartosc, kolejnosc) values (?, ?, ?, ?, ?, ?)');
    [['d1', 'status_zakupu', 'Do kupienia', 0], ['d2', 'status_zakupu', 'Zamówione', 1], ['d3', 'status_zakupu', 'Kupione', 2], ['d4', 'grupa_zakupow', 'Materiały', 0]]
      .forEach(([id, r, w, k]) => dict.run(id, T, T, r, w, k));
    const sh = c.prepare('insert into shopping (id, created_at, updated_at, co, sklep, grupa, status, kwota_gr, uwagi, by) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    sh.run('s1', T, T, 'Taśma', 'OBI', 'Materiały', 'Zamówione', 1250, '', 'u1');
    sh.run('s2', T, T, 'Kołki', '', '', 'Kupione', null, '', 'u1');
    migrate(db);
    expect(c.prepare('select id, status from shopping order by id').all()).toEqual([{ id: 's1', status: 'Do kupienia' }, { id: 's2', status: 'Kupione' }]);
    const cols = (c.prepare('pragma table_info(shopping)').all() as { name: string }[]).map((x) => x.name);
    for (const x of ['sklep', 'grupa', 'kwota_gr']) expect(cols).not.toContain(x);
    expect(c.prepare('select wartosc from dict where deleted_at is null order by rodzaj, kolejnosc').all()).toEqual([{ wartosc: 'Do kupienia' }, { wartosc: 'Kupione' }]);
    const ch = c.prepare('select entity, entity_id, action, after from changes order by seq').all() as { entity: string; entity_id: string; action: string; after: string }[];
    expect(ch.map((x) => `${x.entity}:${x.entity_id}:${x.action}`).sort()).toEqual(['dict:d2:delete', 'dict:d4:delete', 'shopping:s1:update']);
    expect(JSON.parse(ch.find((x) => x.entity === 'shopping')!.after)).toMatchObject({ id: 's1', status: 'Do kupienia', co: 'Taśma', deletedAt: null });
  });

  it('0011: niepusty zakres zlecenia staje się punktem 1 (z wpisem w changes)', () => {
    const db = dbUpTo('0010_good_ted_forrester');
    const c = db.$client;
    c.prepare('insert into firmy (id, created_at, updated_at, nazwa, skrot) values (?, ?, ?, ?, ?)').run('f', T, T, 'F', 'F');
    c.prepare('insert into clients (id, created_at, updated_at, firma_id, typ, nazwa) values (?, ?, ?, ?, ?, ?)').run('k', T, T, 'f', 'osoba', 'K');
    const job = c.prepare('insert into jobs (id, created_at, updated_at, firma_id, numer, client_id, status, zakres) values (?, ?, ?, ?, ?, ?, ?, ?)');
    job.run('j1', T, T, 'f', 'Z0001', 'k', 'Nowe', ' Montaż centrali ');
    job.run('j2', T, T, 'f', 'Z0002', 'k', 'Nowe', '  ');
    migrate(db);
    const items = c.prepare('select id, job_id, kolejnosc, tekst from job_scope_items').all() as any[];
    expect(items).toEqual([{ id: expect.stringMatching(/^[0-9A-Z]{26}$/), job_id: 'j1', kolejnosc: 1, tekst: 'Montaż centrali' }]);
    const ch = c.prepare("select entity_id, after from changes where entity = 'job_scope_items'").all() as any[];
    expect(ch.map((x) => ({ id: x.entity_id, ...JSON.parse(x.after) }))).toEqual([expect.objectContaining({ id: items[0].id, jobId: 'j1', kolejnosc: 1, tekst: 'Montaż centrali' })]);
  });
});
