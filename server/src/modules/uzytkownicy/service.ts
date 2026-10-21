import { randomBytes } from 'node:crypto';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { newId } from '@etner/shared';
import { hashToken, revokeUser } from '../../core/auth.js';
import { recordChange } from '../../core/changes.js';
import type { Db } from '../../core/db.js';
import { users } from '../../core/schema-base.js';
import { schedulePeople } from './schema.js';

export type UserRow = typeof users.$inferSelect;
export type PublicUser = Omit<UserRow, 'tokenHash'>;
export type SchedulePerson = typeof schedulePeople.$inferSelect;

/** token_hash nigdy nie opuszcza modułu: ani w odpowiedziach, ani w changes. */
export const strip = <T extends { tokenHash?: unknown }>(r: T): Omit<T, 'tokenHash'> => {
  const { tokenHash: _, ...rest } = r;
  return rest;
};
const newToken = () => randomBytes(32).toString('base64url');
const active = and(isNull(users.deletedAt), eq(users.active, true));

export const list = (db: Db): PublicUser[] =>
  db.select().from(users).where(isNull(users.deletedAt)).orderBy(asc(users.name)).all().map(strip);
export const get = (db: Db, id: string): UserRow | undefined => db.select().from(users).where(eq(users.id, id)).get();

/** Aktywni użytkownicy z kolumną w harmonogramie, kluczem jest schedule_col. */
export const byScheduleCol = (db: Db): Record<string, PublicUser> =>
  Object.fromEntries(db.select().from(users).where(active).all().filter((u) => u.scheduleCol).map((u) => [u.scheduleCol!, strip(u)]));
/** Id aktywnych członków ekipy. */
export const crewMembers = (db: Db, ekipa: string): string[] =>
  db.select({ id: users.id }).from(users).where(and(active, eq(users.ekipa, ekipa))).all().map((r) => r.id);
/** Id aktywnych adminów. */
export const admins = (db: Db): string[] =>
  db.select({ id: users.id }).from(users).where(and(active, eq(users.role, 'admin'))).all().map((r) => r.id);

type NewUser = { name: string; role: 'pracownik' | 'admin'; perms: string[]; ekipa?: string | null; scheduleCol?: string | null };
export function create(db: Db, by: string, d: NewUser): { user: PublicUser; token: string } {
  const token = newToken();
  const now = new Date().toISOString();
  const row = db.insert(users).values({ id: newId(), ...d, ekipa: d.ekipa ?? null, scheduleCol: d.scheduleCol ?? null, tokenHash: hashToken(token), createdAt: now, createdBy: by, updatedAt: now }).returning().get();
  recordChange(db, by, 'users', row.id, 'create', null, strip(row));
  return { user: strip(row), token };
}

export function update(db: Db, by: string, id: string, d: Partial<NewUser> & { active?: boolean }): PublicUser | null {
  const old = get(db, id);
  if (!old || old.deletedAt) return null;
  const row = db.update(users).set({ ...d, updatedAt: new Date().toISOString() }).where(eq(users.id, id)).returning().get();
  if (d.active === false) revokeUser(db, id);
  recordChange(db, by, 'users', id, 'update', strip(old), strip(row));
  return strip(row);
}

/** Nowy token zastępuje stary, wszystkie sesje użytkownika kończą się. */
export function newLink(db: Db, by: string, id: string): { user: PublicUser; token: string } | null {
  const old = get(db, id);
  if (!old || old.deletedAt) return null;
  const token = newToken();
  const row = db.update(users).set({ tokenHash: hashToken(token), updatedAt: new Date().toISOString() }).where(eq(users.id, id)).returning().get();
  revokeUser(db, id);
  recordChange(db, by, 'users', id, 'update', strip(old), strip(row));
  return { user: strip(row), token };
}

export const listPeople = (db: Db): SchedulePerson[] =>
  db.select().from(schedulePeople).where(isNull(schedulePeople.deletedAt)).orderBy(asc(schedulePeople.kolejnosc), asc(schedulePeople.nazwa)).all();

export function createPerson(db: Db, by: string, d: { nazwa: string; kolejnosc?: number; userId?: string | null }): SchedulePerson {
  const now = new Date().toISOString();
  const row = db.insert(schedulePeople).values({ id: newId(), nazwa: d.nazwa, kolejnosc: d.kolejnosc ?? listPeople(db).length, userId: d.userId ?? null, createdAt: now, createdBy: by, updatedAt: now }).returning().get();
  recordChange(db, by, 'schedule_people', row.id, 'create', null, row);
  return row;
}

export function updatePerson(db: Db, by: string, id: string, d: Partial<{ nazwa: string; kolejnosc: number; userId: string | null }>): SchedulePerson | null {
  const old = db.select().from(schedulePeople).where(and(eq(schedulePeople.id, id), isNull(schedulePeople.deletedAt))).get();
  if (!old) return null;
  const row = db.update(schedulePeople).set({ ...d, updatedAt: new Date().toISOString() }).where(eq(schedulePeople.id, id)).returning().get();
  recordChange(db, by, 'schedule_people', id, 'update', old, row);
  return row;
}

export function deletePerson(db: Db, by: string, id: string): boolean {
  const now = new Date().toISOString();
  const old = db.select().from(schedulePeople).where(and(eq(schedulePeople.id, id), isNull(schedulePeople.deletedAt))).get();
  if (!old) return false;
  const row = db.update(schedulePeople).set({ deletedAt: now, updatedAt: now }).where(eq(schedulePeople.id, id)).returning().get();
  recordChange(db, by, 'schedule_people', id, 'delete', old, row);
  return true;
}
