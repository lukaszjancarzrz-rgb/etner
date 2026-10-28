import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { swapRestored } from './restore-swap.js';

const sqlite = (s: string) => 'SQLite format 3\0' + s;

describe('swapRestored', () => {
  it('restore.db zastępuje etner.db, stara baza (z -wal) zostaje obok; bez restore.db nic', () => {
    const d = mkdtempSync(join(tmpdir(), 'etner-restore-'));
    expect(swapRestored(d)).toBe(false);
    writeFileSync(join(d, 'etner.db'), sqlite('stara'));
    writeFileSync(join(d, 'etner.db-wal'), 'wal');
    expect(swapRestored(d)).toBe(false);
    writeFileSync(join(d, 'restore.db'), sqlite('nowa'));
    expect(swapRestored(d, new Date('2026-10-28T10:00:00Z'))).toBe(true);
    const aside = join(d, 'etner.db.przed-odtworzeniem-2026-10-28T10-00-00-000Z');
    expect(readFileSync(join(d, 'etner.db'), 'utf8')).toBe(sqlite('nowa'));
    expect(readFileSync(aside, 'utf8')).toBe(sqlite('stara'));
    expect(readFileSync(aside + '-wal', 'utf8')).toBe('wal');
    expect([existsSync(join(d, 'restore.db')), existsSync(join(d, 'etner.db-wal'))]).toEqual([false, false]);
  });

  it('drugie odtworzenie nie nadpisuje pierwszej kopii; plik, który nie jest bazą, nie wchodzi na miejsce', () => {
    const d = mkdtempSync(join(tmpdir(), 'etner-restore-'));
    writeFileSync(join(d, 'etner.db'), sqlite('a'));
    writeFileSync(join(d, 'restore.db'), sqlite('b'));
    swapRestored(d, new Date('2026-10-28T10:00:00Z'));
    writeFileSync(join(d, 'restore.db'), sqlite('c'));
    swapRestored(d, new Date('2026-10-28T11:00:00Z'));
    expect(readdirSync(d).filter((f) => f.includes('przed-odtworzeniem')).length).toBe(2);
    writeFileSync(join(d, 'restore.db'), '');
    expect(swapRestored(d)).toBe(false);
    expect(readFileSync(join(d, 'etner.db'), 'utf8')).toBe(sqlite('c'));
    expect(existsSync(join(d, 'restore.db.niepoprawny'))).toBe(true);
  });
});
