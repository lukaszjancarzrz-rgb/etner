import { and, asc, eq, isNull } from 'drizzle-orm';
import { newId } from '@etner/shared';
import { revokeUser } from '../../core/auth.js';
import { recordChange } from '../../core/changes.js';
import type { Db } from '../../core/db.js';
import { users } from '../../core/schema-base.js';
import { dictRefsFor } from '../../core/dict-refs.js';
import { schedulePeople } from './schema.js';

export type UserRow = typeof users.$inferSelect;
export type PublicUser = Omit<UserRow, 'passwordHash'>;
export type SchedulePerson = typeof schedulePeople.$inferSelect;

/** password_hash nigdy nie opuszcza modułu: ani w odpowiedziach, ani w changes. */
export const strip = <T extends { passwordHash?: unknown }>(r: T): Omit<T, 'passwordHash'> => {
  const { passwordHash: _, ...rest } = r;
  return rest;
};
/** Co pracownik widzi o innych: tylko imię i zdjęcie (bez loginu, e-maila, roli, ekipy). */
export const pub = (r: Record<string, unknown>) => ({ id: r.id, name: r.name, avatarKey: r.avatarKey ?? null, updatedAt: r.updatedAt, deletedAt: r.deletedAt ?? null });

/** Zdjęcie użytkownika (ścieżka w magazynie plików); null usuwa. */
export function setAvatar(db: Db, by: string, id: string, avatarKey: string | null): PublicUser | null {
  const old = get(db, id);
  if (!old || old.deletedAt) return null;
  const row = db.update(users).set({ avatarKey, updatedAt: new Date().toISOString() }).where(eq(users.id, id)).returning().get();
  recordChange(db, by, 'users', id, 'update', strip(old), strip(row));
  return strip(row);
}

/** Słowniki: ekipa użytkownika (changes bez password_hash). */
export const dictRefs = dictRefsFor('users', users, { ekipa: users.ekipa }, strip);

const loginTaken = (db: Db, login: string, except?: string) => {
  const o = db.select({ id: users.id }).from(users).where(eq(users.login, login)).get();
  return !!o && o.id !== except;
};
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
/** Id wszystkich aktywnych użytkowników. */
export const activeIds = (db: Db): string[] => db.select({ id: users.id }).from(users).where(active).all().map((r) => r.id);
/** Id aktywnych adminów. */
export const admins = (db: Db): string[] =>
  db.select({ id: users.id }).from(users).where(and(active, eq(users.role, 'admin'))).all().map((r) => r.id);

export class LoginTakenError extends Error {}

type NewUser = { login: string; name: string; role: 'pracownik' | 'admin'; perms: string[]; ekipa?: string | null; scheduleCol?: string | null; email?: string | null };
export function create(db: Db, by: string, d: NewUser & { passwordHash: string }): PublicUser {
  if (loginTaken(db, d.login)) throw new LoginTakenError();
  const { passwordHash, ...rest } = d;
  const now = new Date().toISOString();
  const row = db.insert(users).values({ id: newId(), ...rest, ekipa: d.ekipa ?? null, scheduleCol: d.scheduleCol ?? null, passwordHash, createdAt: now, createdBy: by, updatedAt: now }).returning().get();
  recordChange(db, by, 'users', row.id, 'create', null, strip(row));
  return strip(row);
}

export function update(db: Db, by: string, id: string, d: Partial<NewUser> & { active?: boolean }): PublicUser | null {
  const old = get(db, id);
  if (!old || old.deletedAt) return null;
  if (d.login && loginTaken(db, d.login, id)) throw new LoginTakenError();
  const row = db.update(users).set({ ...d, updatedAt: new Date().toISOString() }).where(eq(users.id, id)).returning().get();
  if (d.active === false) revokeUser(db, id);
  recordChange(db, by, 'users', id, 'update', strip(old), strip(row));
  // kolumna harmonogramu nazwana jak konto idzie za zmianą nazwy (inaczej nadaną nazwę zostawiamy)
  if (d.name && d.name !== old.name) for (const p of listPeople(db)) if (p.userId === id && p.nazwa === old.name) updatePerson(db, by, p.id, { nazwa: d.name });
  return strip(row);
}

/** Nowe hasło (reset przez admina), wszystkie sesje użytkownika kończą się. */
export function setPassword(db: Db, by: string, id: string, passwordHash: string): PublicUser | null {
  const old = get(db, id);
  if (!old || old.deletedAt) return null;
  const row = db.update(users).set({ passwordHash, updatedAt: new Date().toISOString() }).where(eq(users.id, id)).returning().get();
  revokeUser(db, id);
  recordChange(db, by, 'users', id, 'update', strip(old), strip(row));
  return strip(row);
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
