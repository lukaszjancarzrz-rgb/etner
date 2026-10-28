import { closeSync, existsSync, openSync, readSync, renameSync } from 'node:fs';
import { join } from 'node:path';

const SQLITE_HEADER = 'SQLite format 3\0';

function isSqlite(path: string): boolean {
  const buf = Buffer.alloc(16);
  const fd = openSync(path, 'r');
  try { return readSync(fd, buf, 0, 16, 0) === 16 && buf.toString('latin1') === SQLITE_HEADER; } finally { closeSync(fd); }
}

/**
 * Odtworzona baza `DATA_DIR/restore.db` (np. z `litestream restore -o`) wchodzi na miejsce `etner.db` przed otwarciem bazy.
 * Stara baza zostaje obok jako `etner.db.przed-odtworzeniem-<czas>` (z -wal/-shm), więc kolejne odtworzenie jej nie nadpisze.
 * Plik, który nie jest bazą SQLite, zostaje odłożony jako `restore.db.niepoprawny` (bieżąca baza bez zmian). Zwraca true, gdy podmieniono.
 */
export function swapRestored(dataDir: string, now = new Date()): boolean {
  const src = join(dataDir, 'restore.db');
  const db = join(dataDir, 'etner.db');
  if (!existsSync(src)) return false;
  if (!isSqlite(src)) {
    renameSync(src, `${src}.niepoprawny`);
    console.error('restore.db nie jest bazą SQLite – pominięto (odłożony jako restore.db.niepoprawny).');
    return false;
  }
  const aside = `${db}.przed-odtworzeniem-${now.toISOString().replace(/[:.]/g, '-')}`;
  for (const ext of ['', '-wal', '-shm']) if (existsSync(db + ext)) renameSync(db + ext, aside + ext);
  renameSync(src, db);
  return true;
}
