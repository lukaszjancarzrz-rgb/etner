import { newId } from '@etner/shared';
import { and, asc, eq, gt, inArray, isNull } from 'drizzle-orm';
import { recordChange, type ChangeRow } from '../../core/changes.js';
import { tx, type Db } from '../../core/db.js';
import { changes } from '../../core/schema-base.js';
import { jobSeen, jobs } from './schema.js';

/** `job_id` bazy użytkownika: „widziane” zleceń, których nigdy nie otworzył. */
export const BASE = '*';
/** Baza bez podpowiedzi z urządzenia: zmiany innych z ostatnich dni są „nowe” (jak R61). */
const FIRST_DAYS = 3;
const iso = (s: string) => new Date(s).toISOString();
/** Krótsze przesunięcie niż minuta nie jest zapisywane (mniej wierszy w `changes`). */
const MIN_STEP_MS = 60_000;

function put(db: Db, userId: string, jobId: string, at: string, onlyNew = false): void {
  const old = db.select().from(jobSeen).where(and(eq(jobSeen.userId, userId), eq(jobSeen.jobId, jobId))).get();
  const now = new Date().toISOString();
  if (!old) {
    const row = db.insert(jobSeen).values({ id: newId(), userId, jobId, seenAt: at, createdAt: now, createdBy: userId, updatedAt: now }).returning().get();
    recordChange(db, userId, 'job_seen', row.id, 'create', null, row);
  } else if (!onlyNew && Date.parse(at) - Date.parse(old.seenAt) >= MIN_STEP_MS) {
    const row = db.update(jobSeen).set({ seenAt: at, updatedAt: now }).where(eq(jobSeen.id, old.id)).returning().get();
    recordChange(db, userId, 'job_seen', row.id, 'update', old, row);
  }
}

/** Zapisuje „widziane” użytkownika: tylko rośnie (co najmniej o minutę), nie później niż teraz, tylko nieusunięte zlecenia; baza zapisywana raz. */
export function saveSeen(db: Db, userId: string, input: Record<string, string>, base?: string): void {
  const now = new Date().toISOString();
  const cap = (s: string) => (iso(s) > now ? now : iso(s));
  tx(db, () => {
    const ids = Object.keys(input);
    const known = ids.length ? new Set(db.select({ id: jobs.id }).from(jobs).where(and(inArray(jobs.id, ids), isNull(jobs.deletedAt))).all().map((r) => r.id)) : new Set<string>();
    for (const id of ids) if (known.has(id)) put(db, userId, id, cap(input[id]!));
    put(db, userId, BASE, base ? cap(base) : new Date(Date.now() - FIRST_DAYS * 864e5).toISOString(), true);
  });
}

export type View = (ch: ChangeRow) => { before: Record<string, unknown> | null; after: Record<string, unknown> | null } | null;
const SKIP = new Set(['updatedAt', 'szukaj']);
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Pola rekordu zmienione od `since` przez inne osoby (zmiany systemu i własne nie), z wersji widocznych dla pytającego (`view`:
 * ten sam filtr co synchronizacja). Pole zmienione potem przeze mnie albo przywrócone do wartości sprzed `since` nie jest nowe.
 * Utworzenie rekordu po `since` nie zaznacza pól (cały rekord jest nowy).
 */
export function changedFields(db: Db, view: View, meId: string, entity: string, id: string, since: string): string[] {
  const rows = db.select().from(changes).where(and(eq(changes.entity, entity), eq(changes.entityId, id), gt(changes.at, since))).orderBy(asc(changes.seq)).all() as ChangeRow[];
  const first = new Map<string, unknown>();
  const last = new Map<string, unknown>();
  const by = new Map<string, string | null>();
  for (const r of rows) {
    if (r.action !== 'update') continue;
    const v = view(r);
    if (!v?.before || !v.after) continue;
    for (const k of new Set([...Object.keys(v.before), ...Object.keys(v.after)])) {
      if (SKIP.has(k) || same(v.before[k], v.after[k])) continue;
      if (!first.has(k)) first.set(k, v.before[k]);
      last.set(k, v.after[k]);
      by.set(k, r.userId);
    }
  }
  return [...by].filter(([k, u]) => !!u && u !== meId && !same(first.get(k), last.get(k))).map(([k]) => k);
}

/** Własne „widziane” zlecenia z serwera (bez zegara telefonu); brak = undefined. */
export const seenAt = (db: Db, userId: string, jobId: string): string | undefined =>
  db.select({ at: jobSeen.seenAt }).from(jobSeen).where(and(eq(jobSeen.userId, userId), eq(jobSeen.jobId, jobId))).get()?.at;
