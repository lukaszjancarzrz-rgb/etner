import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { newId } from '@etner/shared';
import { testDeps, addUser } from '../test-utils.js';
import { modules } from '../modules/index.js';
import { errors, settings } from '../core/schema-base.js';
import { attachments } from '../modules/dziennik/schema.js';
import { exportToSheets, tablesForExport, type SheetsClient } from './export-sheets.js';
import { kopieCrons, keysToCopy, copyPhotos } from './kopie.js';

type Data = { range: string; values: unknown[][] };
function fake() {
  const calls = { ensured: [] as string[], cleared: [] as string[], data: [] as Data[] };
  const client: SheetsClient = {
    async ensureSheets(_id, titles) { calls.ensured.push(...titles); },
    async clear(_id, ranges) { calls.cleared.push(...ranges); },
    async batchUpdate(_id, data) { calls.data.push(...data); },
  };
  return { client, calls, sheet: (t: string) => calls.data.find((d) => d.range.startsWith(`'${t}'`))!.values };
}
const att = (over: Record<string, unknown> = {}) => ({
  id: newId(), createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-01T10:00:00.000Z', rodzaj: 'zdjecie' as const,
  keyOrig: 'o1', keyView: 'v1', keyThumb: 't1', nazwa: 'a.jpg', mime: 'image/jpeg', bajty: 10, authorId: 'u', ...over });

describe('eksport do arkusza', () => {
  it('każda tabela z listy ma kartę, a lista wyklucza techniczne', async () => {
    const deps = testDeps(); const f = fake();
    const names = Object.keys(tablesForExport(modules));
    expect(names).toEqual(expect.arrayContaining(['firmy', 'users', 'clients', 'jobs', 'leads', 'attachments']));
    for (const x of ['sessions', 'op_ids', 'push_subscriptions', 'changes', 'errors', 'settings']) expect(names).not.toContain(x);
    await exportToSheets(deps.db, f.client, 'sid', tablesForExport(modules));
    expect(f.calls.ensured).toEqual(expect.arrayContaining([...names, '_info']));
    expect(f.calls.cleared.length).toBe(names.length + 1);
  });

  it('liczba wierszy = rekordy z usuniętymi; kwoty w zł; users bez token_hash', async () => {
    const deps = testDeps(); const f = fake();
    addUser(deps, { name: 'Jan' });
    deps.db.insert(attachments).values([att(), att({ deletedAt: '2026-10-02T00:00:00.000Z', dlaKlienta: true })]).run();
    const info = await exportToSheets(deps.db, f.client, 'sid', tablesForExport(modules));
    expect(info.attachments).toBe(2);
    expect(f.sheet('attachments').length).toBe(3); // nagłówek + 2
    const h = f.sheet('attachments')[0]!;
    expect(h).toContain('deleted_at');
    expect(f.sheet('attachments').map((r) => r[h.indexOf('dla_klienta')])).toEqual(['dla_klienta', 'FALSE', 'TRUE']);
    const uh = f.sheet('users')[0]!;
    expect(uh).not.toContain('token_hash');
    expect(uh).toContain('name');
    const inf = f.sheet('_info');
    expect(inf.find((r) => r[0] === 'attachments')![1]).toBe(2);
  });

  it('kolumny _gr jako liczba zł z dwoma miejscami', async () => {
    const { tbl } = await import('./export-sheets.js').then((m) => ({ tbl: m }));
    const { sqliteTable, text, integer } = await import('drizzle-orm/sqlite-core');
    const t = sqliteTable('kwoty', { id: text('id').primaryKey(), netto_gr: integer('netto_gr') });
    const deps = testDeps(); const f = fake();
    deps.db.$client.exec('create table kwoty (id text primary key, netto_gr integer)');
    deps.db.$client.exec("insert into kwoty values ('a', 123456), ('b', NULL)");
    await tbl.exportToSheets(deps.db, f.client, 'sid', { kwoty: t });
    expect(f.sheet('kwoty')).toEqual([['id', 'netto_gr'], ['a', 1234.56], ['b', '']]);
  });
});

describe('zadania kopii', () => {
  it('brak konfiguracji Sheets: pomija i zapisuje ostrzeżenie', async () => {
    const deps = testDeps();
    await kopieCrons({}, modules).find((c) => c.name === 'eksport')!.run(deps);
    expect(deps.db.select().from(errors).where(eq(errors.where, 'eksport')).all().length).toBe(1);
    expect(deps.db.select().from(settings).where(eq(settings.key, 'kopia_eksport_at')).all()).toHaveLength(0);
  });

  it('kopia-zdjec: wybiera klucze załączników nowszych niż kopia_zdjec_at', async () => {
    const deps = testDeps();
    deps.db.insert(attachments).values([
      att({ createdAt: '2026-09-01T00:00:00.000Z' }),
      att({ keyOrig: 'o2', keyView: 'v2', keyThumb: 't2', createdAt: '2026-10-05T00:00:00.000Z' }),
      att({ keyOrig: 'o3', keyView: null, keyThumb: null, createdAt: '2026-10-06T00:00:00.000Z' }),
    ]).run();
    expect(keysToCopy(deps.db, '2026-10-01T00:00:00.000Z').sort()).toEqual(['o2', 'o3', 't2', 'v2']);
    const copied: string[] = [];
    const def = kopieCrons({}, modules).find((c) => c.name === 'kopia-zdjec')!;
    expect(def.schedule).toBe('0 3 * * *');
    await copyPhotos(deps.db, async (k) => { copied.push(k); }, '2026-10-01T00:00:00.000Z');
    expect(copied.sort()).toEqual(['o2', 'o3', 't2', 'v2']);
    expect(deps.db.select().from(settings).where(eq(settings.key, 'kopia_zdjec_at')).get()).toBeTruthy();
  });
});
