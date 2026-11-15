import { and, desc, eq, isNull, ne } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { dayOf, MAX_WPIS_H, newId, type TimeEntryCreate, type TimeEntryUpdate, type TimeStop } from '@etner/shared';
import { recordChange } from '../../core/changes.js';
import type { Db } from '../../core/db.js';
import * as users from '../uzytkownicy/service.js';
import * as zlecenia from '../zlecenia/service.js';
import { timeEntries } from './schema.js';

export type TimeRow = typeof timeEntries.$inferSelect;
const bad = (message: string) => new HTTPException(400, { message });
const live = isNull(timeEntries.deletedAt);

export const get = (db: Db, id: string): TimeRow | undefined => db.select().from(timeEntries).where(and(eq(timeEntries.id, id), live)).get();
export const removed = (db: Db, id: string): boolean => !!db.select({ d: timeEntries.deletedAt }).from(timeEntries).where(eq(timeEntries.id, id)).get()?.d;
export const runningAll = (db: Db): TimeRow[] => db.select().from(timeEntries).where(and(isNull(timeEntries.do), live)).all();
const running = (db: Db, userId: string) => db.select().from(timeEntries).where(and(eq(timeEntries.userId, userId), isNull(timeEntries.do), live)).get();

/** Kolumna harmonogramu użytkownika (czas liczy się osobie z Płac). */
export function personOf(db: Db, userId: string): string {
  const p = users.listPeople(db).find((x) => x.userId === userId);
  if (!p) throw bad('Nie masz kolumny w harmonogramie – poproś biuro o dodanie.');
  return p.id;
}

/** Czas z zegara telefonu: najwyżej 5 min w przód (przycinany do teraz), nie starszy niż 48 h (kolejka offline). */
export function clampAt(at: string, now: Date): string {
  const t = Date.parse(at), n = now.getTime();
  if (t > n + 5 * 60_000 || t < n - 48 * 3_600_000) throw bad('Zegar telefonu wskazuje złą godzinę – sprawdź datę i godzinę w telefonie.');
  return new Date(Math.min(t, n)).toISOString();
}

function checkJob(db: Db, jobId: string | null | undefined) {
  if (jobId && !zlecenia.get(db, jobId)) throw bad('Nie ma takiego zlecenia');
}

/** od < do, najwyżej 16 h, bez nakładania się na inne wpisy tej osoby (trwający = do teraz). */
function checkRange(db: Db, personId: string, od: string, doo: string, now: Date, skipId?: string) {
  if (Date.parse(doo) <= Date.parse(od)) throw bad('Godzina zakończenia musi być późniejsza niż rozpoczęcia');
  if (Date.parse(doo) - Date.parse(od) > MAX_WPIS_H * 3_600_000) throw bad(`Wpis może mieć najwyżej ${MAX_WPIS_H} h`);
  if (Date.parse(doo) > now.getTime() + 5 * 60_000) throw bad('Godzina zakończenia jest w przyszłości');
  if (kolizja(db, personId, od, doo, now, skipId)) throw bad('Te godziny nakładają się na inny wpis');
}

/** Czy [od, do) nachodzi na inny wpis tej osoby (trwający = do teraz). */
function kolizja(db: Db, personId: string, od: string, doo: string, now: Date, skipId?: string): boolean {
  const inne = db.select().from(timeEntries).where(and(eq(timeEntries.personId, personId), live, skipId ? ne(timeEntries.id, skipId) : undefined)).all();
  return inne.some((e) => Date.parse(e.od) < Date.parse(doo) && Date.parse(e.do ?? now.toISOString()) > Date.parse(od));
}

/** Ostatni wpis zatrzymany automatycznie, w który trafia `at` (spóźniony zapis z kolejki offline). */
function autoStoppedAt(db: Db, userId: string, at: string): TimeRow | undefined {
  const last = db.select().from(timeEntries).where(and(eq(timeEntries.userId, userId), live)).orderBy(desc(timeEntries.od)).get();
  return last?.autoStop && last.doCz && Date.parse(at) < Date.parse(last.doCz) && Date.parse(at) > Date.parse(last.od) ? last : undefined;
}

function insert(db: Db, by: string, v: Omit<typeof timeEntries.$inferInsert, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'dzien'>): TimeRow {
  const now = new Date().toISOString();
  const row = db.insert(timeEntries).values({ ...v, dzien: dayOf(v.od), id: newId(), createdAt: now, createdBy: by, updatedAt: now }).returning().get();
  recordChange(db, by, 'time_entries', row.id, 'create', null, row);
  return row;
}

function patch(db: Db, by: string | null, old: TimeRow, set: Partial<typeof timeEntries.$inferInsert>): TimeRow {
  const row = db.update(timeEntries).set({ ...set, ...(set.od ? { dzien: dayOf(set.od) } : {}), updatedAt: new Date().toISOString() }).where(eq(timeEntries.id, old.id)).returning().get();
  recordChange(db, by, 'time_entries', old.id, 'update', old, row);
  return row;
}

/** Start (C1): trwający wpis zatrzymany o `at` (zmiana zlecenia), potem nowy. */
export function start(db: Db, userId: string, jobId: string | null, at: string): TimeRow {
  checkJob(db, jobId);
  const personId = personOf(db, userId);
  const r = running(db, userId);
  if (r) {
    const doo = new Date(Math.max(Date.parse(at), Date.parse(r.od))).toISOString();
    patch(db, userId, r, { do: doo, doCz: doo });
    at = doo;
  } else {
    // zmiana zlecenia z kolejki offline po auto-stopie: poprzedni wpis kończy się o `at`
    const auto = autoStoppedAt(db, userId, at);
    if (auto) patch(db, userId, auto, { do: at, doCz: at, autoStop: false });
    if (kolizja(db, personId, at, new Date(Date.parse(at) + 1).toISOString(), new Date(at))) throw bad('W tym czasie masz już inny wpis');
  }
  return insert(db, userId, { userId, personId, jobId, od: at, odCz: at, zrodlo: 'czasomierz' });
}

/** Stop (C2) z ewentualną poprawką godzin. Brak trwającego: spóźniony stop z kolejki poprawia wpis zatrzymany automatycznie; inaczej nic. */
export function stop(db: Db, userId: string, d: Omit<TimeStop, 'opId'> & { at: string }, now: Date): TimeRow | null {
  let r = running(db, userId);
  if (!r) {
    r = autoStoppedAt(db, userId, d.at);
    if (!r) return null;
  }
  const doCz = new Date(Math.max(Date.parse(d.at), Date.parse(r.od) + 1000)).toISOString(); // najmniej 1 s (od < do); nie więcej – Start zaraz po Stop nie może nachodzić na ten wpis
  const od = d.od ?? r.od, doo = d.do ?? doCz;
  checkRange(db, r.personId, od, doo, now, r.id);
  const zmiana = od !== r.odCz || doo !== doCz;
  return patch(db, userId, r, {
    od, do: doo, doCz, autoStop: false,
    ...(zmiana ? { edytowal: userId, edytowalAt: now.toISOString() } : {}),
    ...(d.komentarz !== undefined ? { komentarz: d.komentarz } : {}),
  });
}

/** Wpis ręczny: własny albo (admin) dla wskazanej osoby. */
export function create(db: Db, by: string, d: Omit<TimeEntryCreate, 'opId'>, now: Date, forPerson?: { id: string; userId: string | null }): TimeRow {
  checkJob(db, d.jobId);
  const personId = forPerson?.id ?? personOf(db, by);
  checkRange(db, personId, d.od, d.do, now);
  return insert(db, by, { userId: forPerson ? forPerson.userId : by, personId, jobId: d.jobId, od: d.od, do: d.do, zrodlo: 'reczny', komentarz: d.komentarz, edytowal: by, edytowalAt: now.toISOString() });
}

/** Poprawka: każda zapisuje kto i kiedy (też bez zmiany godzin – „sprawdzone”). Trwającego wpisu nie da się zakończyć poprawką. */
export function update(db: Db, by: string, old: TimeRow, d: Omit<TimeEntryUpdate, 'opId'>, now: Date): TimeRow {
  if (d.jobId !== undefined) checkJob(db, d.jobId);
  if (!old.do && d.do !== undefined) throw bad('Wpis trwa – zakończ go przyciskiem Stop');
  const od = d.od ?? old.od, doo = d.do ?? old.do;
  if (doo) checkRange(db, old.personId, od, doo, now, old.id);
  else if (Date.parse(od) > now.getTime()) throw bad('Godzina rozpoczęcia jest w przyszłości');
  else if (kolizja(db, old.personId, od, now.toISOString(), now, old.id)) throw bad('Te godziny nakładają się na inny wpis');
  const set = Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)) as Partial<typeof timeEntries.$inferInsert>;
  return patch(db, by, old, { ...set, edytowal: by, edytowalAt: now.toISOString() });
}

export function remove(db: Db, by: string, old: TimeRow): void {
  const now = new Date().toISOString();
  const row = db.update(timeEntries).set({ deletedAt: now, updatedAt: now }).where(eq(timeEntries.id, old.id)).returning().get();
  recordChange(db, by, 'time_entries', old.id, 'delete', old, row);
}

export const markReminded = (db: Db, r: TimeRow, now: Date): TimeRow => patch(db, null, r, { przypomnianoAt: now.toISOString() });
/** Auto-stop tylko wpisu, który nadal trwa (Stop wysłany w trakcie tiku crona wygrywa). */
export function autoStop(db: Db, r: TimeRow, at: string): TimeRow | undefined {
  const row = db.update(timeEntries).set({ do: at, doCz: at, autoStop: true, updatedAt: new Date().toISOString() }).where(and(eq(timeEntries.id, r.id), isNull(timeEntries.do), live)).returning().get();
  if (row) recordChange(db, null, 'time_entries', r.id, 'update', r, row);
  return row;
}
