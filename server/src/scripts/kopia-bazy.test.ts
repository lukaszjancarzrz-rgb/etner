import Database from 'better-sqlite3';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { testDeps } from '../test-utils.js';
import { doUsuniecia, kluczKopii, kopiaBazy, ostatniaKopia } from './kopia-bazy.js';

describe('kopia bazy', () => {
  it('zostają: 30 dni i 1. dzień miesiąca przez rok; obce pliki nietknięte', () => {
    const k = (d: string) => kluczKopii(d);
    const keys = [k('2026-11-14'), k('2026-10-15'), k('2026-10-14'), k('2026-10-01'), k('2026-09-30'), k('2025-11-01'), k('2025-11-30'), 'kopie-bazy/notatka.txt'];
    expect(doUsuniecia(keys, '2026-11-14')).toEqual([k('2026-10-14'), k('2026-09-30'), k('2025-11-01'), k('2025-11-30')]); // 10-14 = 31 dni temu
  });

  it('pełna, działająca baza w gzip; stare kopie usunięte; znacznik i rozmiar zapisane', async () => {
    const { db } = testDeps();
    const put: Record<string, Buffer> = {};
    let usuniete: string[] = [];
    const m = { put: async (k: string, b: Buffer) => { put[k] = b; }, list: async () => [...Object.keys(put), kluczKopii('2026-01-02')], del: async (k: string[]) => { usuniete = k; } };
    const r = await kopiaBazy(db, m, '2026-11-14');
    expect(r.key).toBe('kopie-bazy/etner-2026-11-14.db.gz');
    expect(usuniete).toEqual([kluczKopii('2026-01-02')]);
    const f = join(mkdtempSync(join(tmpdir(), 'kopia-')), 'x.db');
    writeFileSync(f, gunzipSync(put[r.key]!));
    const c = new Database(f, { readonly: true });
    expect(c.prepare("select count(*) n from sqlite_master where type='table' and name='settings'").get()).toEqual({ n: 1 });
    c.close();
    expect(ostatniaKopia(db)).toMatchObject({ rozmiar: r.rozmiar });
    expect(ostatniaKopia(db).at).toBeTruthy();
  });
});
