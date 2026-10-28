import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { swapRestored } from './restore-swap.js';

describe('swapRestored', () => {
  it('restore.db zastępuje etner.db, stara baza (z -wal) zostaje obok; bez restore.db nic', () => {
    const d = mkdtempSync(join(tmpdir(), 'etner-restore-'));
    expect(swapRestored(d)).toBe(false);
    writeFileSync(join(d, 'etner.db'), 'stara');
    writeFileSync(join(d, 'etner.db-wal'), 'wal');
    expect(swapRestored(d)).toBe(false);
    writeFileSync(join(d, 'restore.db'), 'nowa');
    expect(swapRestored(d)).toBe(true);
    expect(readFileSync(join(d, 'etner.db'), 'utf8')).toBe('nowa');
    expect(readFileSync(join(d, 'etner.db.przed-odtworzeniem'), 'utf8')).toBe('stara');
    expect(readFileSync(join(d, 'etner.db.przed-odtworzeniem-wal'), 'utf8')).toBe('wal');
    expect([existsSync(join(d, 'restore.db')), existsSync(join(d, 'etner.db-wal'))]).toEqual([false, false]);
  });
});
