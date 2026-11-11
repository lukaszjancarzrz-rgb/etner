import { and, asc, eq, isNull } from 'drizzle-orm';
import { newId } from '@etner/shared';
import { recordChange } from '../../core/changes.js';
import type { Db } from '../../core/db.js';
import { migrationReview } from './schema.js';

export type ReviewRow = typeof migrationReview.$inferSelect;
export type ReviewInput = Pick<ReviewRow, 'co' | 'arkusz' | 'wiersz' | 'dzien' | 'osoba' | 'tekst' | 'opis' | 'ile' | 'pominiete'>;

export const list = (db: Db): ReviewRow[] =>
  db.select().from(migrationReview).where(isNull(migrationReview.deletedAt)).orderBy(asc(migrationReview.createdAt)).all();

/** Wywołuj w tx (przeniesienie zapisuje pozycje razem z danymi). */
export function add(db: Db, userId: string, items: ReviewInput[]): void {
  const now = new Date().toISOString();
  for (const it of items) {
    const row = db.insert(migrationReview).values({ ...it, id: newId(), createdAt: now, createdBy: userId, updatedAt: now }).returning().get();
    recordChange(db, userId, 'migration_review', row.id, 'create', null, row);
  }
}

export function setPrzejrzane(db: Db, userId: string, id: string, przejrzane: boolean): ReviewRow | undefined {
  const old = db.select().from(migrationReview).where(and(eq(migrationReview.id, id), isNull(migrationReview.deletedAt))).get();
  if (!old) return undefined;
  if (old.przejrzane === przejrzane) return old;
  const row = db.update(migrationReview).set({ przejrzane, updatedAt: new Date().toISOString() }).where(eq(migrationReview.id, id)).returning().get();
  recordChange(db, userId, 'migration_review', id, 'update', old, row);
  return row;
}
