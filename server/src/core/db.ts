import { EventEmitter } from 'node:events';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate as drizzleMigrate } from 'drizzle-orm/better-sqlite3/migrator';
import { fileURLToPath } from 'node:url';
import * as schema from './schema-base.js';

export type Db = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

const buses = new WeakMap<Db, EventEmitter>();

/** Szyna zmian danej bazy: emituje `seq` dopiero po COMMIT (SSE w zadaniu 5). */
export function changeBusOf(db: Db): EventEmitter {
  let b = buses.get(db);
  if (!b) buses.set(db, (b = new EventEmitter().setMaxListeners(0)));
  return b;
}

export function emitChange(db: Db, seq: number): void {
  try {
    changeBusOf(db).emit('change', seq);
  } catch (e) {
    console.error('Błąd odbiorcy zmian (zapis już zatwierdzony)', e);
  }
}

export function openDb(file: string): Db {
  const client = new Database(file);
  client.pragma('journal_mode = WAL');
  client.pragma('foreign_keys = ON');
  return drizzle(client, { schema });
}

export function migrate(db: Db): void {
  // Ten sam katalog z src (tsx/vitest) i z dist: oba leżą dwa poziomy pod server/.
  drizzleMigrate(db, { migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)) });
}

const pending = new WeakMap<Db, number[]>();

/** Rejestruje seq zapisany w trwającej transakcji; zwraca false, gdy transakcji nie ma. */
export function deferEmit(db: Db, seq: number): boolean {
  const list = pending.get(db);
  list?.push(seq);
  return !!list;
}

/** Transakcja re-entrantna: zagnieżdżone wywołanie działa w zewnętrznej. */
export function tx<T>(db: Db, fn: (t: Db) => T): T {
  if (pending.has(db)) return fn(db);
  const seqs: number[] = [];
  pending.set(db, seqs);
  db.$client.exec('BEGIN IMMEDIATE');
  let out: T;
  try {
    out = fn(db);
    db.$client.exec('COMMIT');
  } catch (e) {
    pending.delete(db);
    if (db.$client.inTransaction) db.$client.exec('ROLLBACK');
    throw e;
  }
  pending.delete(db);
  for (const s of seqs) emitChange(db, s);
  return out;
}
