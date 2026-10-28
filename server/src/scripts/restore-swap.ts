import { existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Odtworzona baza `DATA_DIR/restore.db` (np. z `litestream restore -o`) wchodzi na miejsce `etner.db` przed otwarciem bazy.
 * Stara baza zostaje obok jako `etner.db.przed-odtworzeniem` (z -wal/-shm). Zwraca true, gdy podmieniono.
 */
export function swapRestored(dataDir: string): boolean {
  const src = join(dataDir, 'restore.db');
  const db = join(dataDir, 'etner.db');
  if (!existsSync(src)) return false;
  for (const ext of ['', '-wal', '-shm']) if (existsSync(db + ext)) renameSync(db + ext, `${db}.przed-odtworzeniem${ext}`);
  renameSync(src, db);
  return true;
}
