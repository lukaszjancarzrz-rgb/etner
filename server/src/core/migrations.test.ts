import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate as drizzleMigrate } from 'drizzle-orm/better-sqlite3/migrator';
import { getTableColumns } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { dict as dictT } from '../modules/slowniki/schema.js';
import { leads } from '../modules/leady/schema.js';
import { jobs } from '../modules/zlecenia/schema.js';
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
    [['d1', 'status_zakupu', 'Do kupienia', 0], ['d2', 'status_zakupu', 'Zamówione', 1], ['d3', 'status_zakupu', 'Kupione', 2], ['d4', 'grupa_zakupow', 'Materiały', 0], ['d5', 'grupa_zakupow', 'Biuro', 1]]
      .forEach(([id, r, w, k]) => dict.run(id, T, T, r, w, k));
    c.prepare("update dict set deleted_at = ? where id = 'd5'").run(T); // usunięty wcześniej: bez ponownego wpisu
    const sh = c.prepare('insert into shopping (id, created_at, updated_at, co, sklep, grupa, status, kwota_gr, uwagi, by) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    sh.run('s1', T, T, 'Taśma', 'OBI', 'Materiały', 'Zamówione', 1250, '', 'u1');
    sh.run('s2', T, T, 'Kołki', '', '', 'Kupione', null, '', 'u1');
    sh.run('s3', T, T, 'Wiertła', 'Castorama', '', 'Kupione', null, '8 mm', 'u1');
    migrate(db);
    expect(c.prepare('select id, status, uwagi from shopping order by id').all()).toEqual([
      { id: 's1', status: 'Do kupienia', uwagi: 'sklep: OBI' }, { id: 's2', status: 'Kupione', uwagi: '' }, { id: 's3', status: 'Kupione', uwagi: '8 mm · sklep: Castorama' }]);
    const cols = (c.prepare('pragma table_info(shopping)').all() as { name: string }[]).map((x) => x.name);
    for (const x of ['sklep', 'grupa', 'kwota_gr']) expect(cols).not.toContain(x);
    expect(c.prepare('select wartosc from dict where deleted_at is null order by rodzaj, kolejnosc').all()).toEqual([{ wartosc: 'Do kupienia' }, { wartosc: 'Kupione' }]);
    const ch = c.prepare('select entity, entity_id, action, after from changes order by seq').all() as { entity: string; entity_id: string; action: string; after: string }[];
    expect(ch.map((x) => `${x.entity}:${x.entity_id}:${x.action}`).sort()).toEqual(['dict:d2:delete', 'dict:d4:delete', 'shopping:s1:update', 'shopping:s3:update']);
    expect(JSON.parse(ch.find((x) => x.entity_id === 's1')!.after)).toMatchObject({ id: 's1', status: 'Do kupienia', co: 'Taśma', uwagi: 'sklep: OBI', deletedAt: null });
    expect(JSON.parse(ch.find((x) => x.entity_id === 's3')!.after)).toMatchObject({ status: 'Kupione', uwagi: '8 mm · sklep: Castorama' });
    expect(JSON.parse(ch.find((x) => x.entity_id === 'd2')!.after).deletedAt).toBeTruthy();
  });

  it('0011: niepusty zakres zlecenia staje się punktem 1 (z wpisem w changes)', () => {
    const db = dbUpTo('0010_good_ted_forrester');
    const c = db.$client;
    c.prepare('insert into firmy (id, created_at, updated_at, nazwa, skrot) values (?, ?, ?, ?, ?)').run('f', T, T, 'F', 'F');
    c.prepare('insert into clients (id, created_at, updated_at, firma_id, typ, nazwa) values (?, ?, ?, ?, ?, ?)').run('k', T, T, 'f', 'osoba', 'K');
    const job = c.prepare('insert into jobs (id, created_at, updated_at, firma_id, numer, client_id, status, zakres) values (?, ?, ?, ?, ?, ?, ?, ?)');
    const job2 = c.prepare('insert into jobs (id, created_at, created_by, updated_at, firma_id, numer, client_id, status, zakres) values (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    job2.run('j1', T, 'adm', '2026-10-05T08:00:00.000Z', 'f', 'Z0001', 'k', 'Nowe', ' Montaż centrali ');
    job.run('j2', T, T, 'f', 'Z0002', 'k', 'Nowe', '  ');
    migrate(db);
    const items = c.prepare('select id, job_id, kolejnosc, tekst, created_at, created_by, updated_at from job_scope_items').all() as any[];
    // czas i autor zlecenia: punkt nie wygląda na „nowy” na telefonach
    expect(items).toEqual([{ id: expect.stringMatching(/^[0-9A-Z]{26}$/), job_id: 'j1', kolejnosc: 1, tekst: 'Montaż centrali', created_at: T, created_by: 'adm', updated_at: '2026-10-05T08:00:00.000Z' }]);
    const ch = c.prepare("select entity_id, after from changes where entity = 'job_scope_items'").all() as any[];
    expect(ch.map((x) => ({ id: x.entity_id, ...JSON.parse(x.after) }))).toEqual([expect.objectContaining({ id: items[0].id, jobId: 'j1', kolejnosc: 1, tekst: 'Montaż centrali', createdAt: T, createdBy: 'adm', updatedAt: '2026-10-05T08:00:00.000Z' })]);
  });

  it('0012: kategorie i rodzaje zleceń, zlecenia i leady przeniesione do Inne/inne, wpisy w changes', () => {
    const db = dbUpTo('0011_worthless_solo');
    const c = db.$client;
    const dict = c.prepare('insert into dict (id, created_at, updated_at, rodzaj, wartosc, kolejnosc, kolor) values (?, ?, ?, ?, ?, ?, ?)');
    [['k1', 'kategoria', 'Rekuperacja', 0], ['k2', 'kategoria', 'Klimatyzacja', 1], ['k3', 'kategoria', 'Pompa ciepła', 2], ['k4', 'kategoria', 'Serwis', 3], ['k5', 'kategoria', 'Inne', 4], ['k6', 'kategoria', 'Wentylacja', 5],
      ['r1', 'rodzaj_zlecenia', 'montaż', 0], ['r2', 'rodzaj_zlecenia', 'serwis', 1], ['r3', 'rodzaj_zlecenia', 'gwarancja', 2], ['r4', 'rodzaj_zlecenia', 'inne', 3], ['e1', 'ekipa', 'A', 0]]
      .forEach(([id, r, w, k]) => dict.run(id, T, T, r, w, k, null));
    c.prepare('insert into firmy (id, created_at, updated_at, nazwa, skrot) values (?, ?, ?, ?, ?)').run('f', T, T, 'F', 'F');
    c.prepare('insert into clients (id, created_at, updated_at, firma_id, typ, nazwa) values (?, ?, ?, ?, ?, ?)').run('k', T, T, 'f', 'osoba', 'K');
    const job = c.prepare('insert into jobs (id, created_at, updated_at, firma_id, numer, client_id, status, rodzaj, kategoria, uwagi_admin) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    job.run('j1', T, T, 'f', 'Z1', 'k', 'Nowe', 'montaż', 'Pompa ciepła', 'tajne');
    job.run('j2', T, T, 'f', 'Z2', 'k', 'Nowe', 'gwarancja', 'Rekuperacja', '');
    job.run('j3', T, T, 'f', 'Z3', 'k', 'Nowe', 'serwis', 'Klimatyzacja', '');
    const lead = c.prepare('insert into leads (id, created_at, updated_at, firma_id, numer, status, kategoria, temat) values (?, ?, ?, ?, ?, ?, ?, ?)');
    lead.run('l1', T, T, 'f', 'L1', 'Nowy', 'Serwis', 'T'); lead.run('l2', T, T, 'f', 'L2', 'Nowy', 'Rekuperacja', 'T');
    migrate(db);
    const live = (r: string) => (c.prepare('select wartosc, kolor from dict where rodzaj = ? and deleted_at is null order by kolejnosc').all(r) as any[]);
    expect(live('kategoria')).toEqual([
      { wartosc: 'Elektryka', kolor: '#0070ab' }, { wartosc: 'Fotowoltaika', kolor: '#c62828' }, { wartosc: 'Rekuperacja', kolor: '#2e7d32' },
      { wartosc: 'Klimatyzacja', kolor: '#7b1fa2' }, { wartosc: 'Inne', kolor: '#f9a825' }, { wartosc: 'Wentylacja', kolor: null }]);
    expect(live('rodzaj_zlecenia').map((x) => x.wartosc)).toEqual(['montaż', 'przygotówka', 'serwis', 'inne']);
    expect(c.prepare('select id, rodzaj, kategoria, updated_at from jobs order by id').all()).toEqual([
      { id: 'j1', rodzaj: 'montaż', kategoria: 'Inne', updated_at: T }, { id: 'j2', rodzaj: 'inne', kategoria: 'Rekuperacja', updated_at: T }, { id: 'j3', rodzaj: 'serwis', kategoria: 'Klimatyzacja', updated_at: T }]);
    expect(c.prepare('select id, kategoria from leads order by id').all()).toEqual([{ id: 'l1', kategoria: 'Inne' }, { id: 'l2', kategoria: 'Rekuperacja' }]);
    const ch = c.prepare('select entity, entity_id, action, after from changes order by seq').all() as { entity: string; entity_id: string; action: string; after: string }[];
    const key = (x: { entity: string; entity_id: string; action: string }) => `${x.entity}:${x.entity_id}:${x.action}`;
    const ids = (c.prepare("select id from dict where rodzaj in ('kategoria', 'rodzaj_zlecenia') and deleted_at is null").all() as any[]).map((x) => `dict:${x.id}:update`);
    expect(ch.map(key).sort()).toEqual(['dict:k3:delete', 'dict:k4:delete', 'dict:r3:delete', 'jobs:j1:update', 'jobs:j2:update', 'leads:l1:update', ...ids].sort());
    // pełny wiersz w kształcie Drizzle (telefon podmienia cały rekord)
    const after = (id: string) => JSON.parse(ch.find((x) => x.entity_id === id && x.action === 'update')!.after);
    expect(Object.keys(after('j1')).sort()).toEqual(Object.keys(getTableColumns(jobs)).sort());
    expect(after('j1')).toMatchObject({ kategoria: 'Inne', rodzaj: 'montaż', uwagiAdmin: 'tajne', updatedAt: T });
    expect(after('j2')).toMatchObject({ rodzaj: 'inne' });
    expect(Object.keys(after('l1')).sort()).toEqual(Object.keys(getTableColumns(leads)).sort());
    const k1 = after('k1');
    expect(Object.keys(k1).sort()).toEqual(Object.keys(getTableColumns(dictT)).sort());
    expect(k1).toMatchObject({ wartosc: 'Rekuperacja', kolejnosc: 2, kolor: '#2e7d32', platne: null });
    expect(after(ids.map((x) => x.split(':')[1]!).find((id) => after(id).wartosc === 'przygotówka')!)).toMatchObject({ rodzaj: 'rodzaj_zlecenia', kolejnosc: 1, deletedAt: null });
  });

  it('0012 na pustej bazie nic nie wstawia (słowniki wypełnia seedBase)', () => {
    const db = dbUpTo('0011_worthless_solo');
    migrate(db);
    expect(db.$client.prepare('select count(*) n from dict').get()).toEqual({ n: 0 });
  });
});
