import { and, count, eq, isNull } from 'drizzle-orm';
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';
import { recordChange } from './changes.js';
import type { Db } from './db.js';

type Row = Record<string, any>;
type Table = SQLiteTable & { id: SQLiteColumn; deletedAt: SQLiteColumn; updatedAt: SQLiteColumn };

/** Kolumny tabeli modułu, które przechowują wartości słowników (rodzaj → kolumna). */
export interface DictRefs {
  /** Ile nieusuniętych rekordów ma tę wartość. */
  count(db: Db, rodzaj: string, value: string): number;
  /** Zmiana nazwy wartości we wszystkich rekordach (z wpisem w changes). Wywołuj w transakcji. */
  rename(db: Db, userId: string, rodzaj: string, from: string, to: string): void;
}

/** `clean` = co trafia do changes (np. bez password_hash). */
export function dictRefsFor<T extends Table>(entity: string, table: T, cols: Partial<Record<string, SQLiteColumn>>, clean: (r: Row) => Row = (r) => r): DictRefs {
  const where = (col: SQLiteColumn, v: string) => and(eq(col, v), isNull(table.deletedAt));
  return {
    count(db, rodzaj, value) {
      const col = cols[rodzaj];
      return col ? db.select({ n: count() }).from(table as SQLiteTable).where(where(col, value)).get()!.n : 0;
    },
    rename(db, userId, rodzaj, from, to) {
      const col = cols[rodzaj];
      if (!col) return;
      const key = Object.entries(table).find(([, c]) => c === col)![0];
      const now = new Date().toISOString();
      for (const old of db.select().from(table as SQLiteTable).where(where(col, from)).all() as Row[]) {
        const row = db.update(table).set({ [key]: to, updatedAt: now } as never).where(eq(table.id, old.id)).returning().get() as Row;
        recordChange(db, userId, entity, old.id, 'update', clean(old), clean(row));
      }
    },
  };
}
