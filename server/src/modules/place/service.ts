import { and, eq, isNull } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { newId, type Parametry, type PayrollEntryCreate, type PayrollEntryUpdate, type PayrollMonth, type PayrollPerson, type PayrollRateCreate, type PayrollRateUpdate } from '@etner/shared';
import { recordChange } from '../../core/changes.js';
import type { Db } from '../../core/db.js';
import { settings } from '../../core/schema-base.js';
import { schedulePeople } from '../uzytkownicy/schema.js';
import { payrollEntries, payrollMonths, payrollPeople, payrollRates } from './schema.js';

const now = () => new Date().toISOString();
type Opt<T> = Omit<T, 'opId'>;
type Tab = typeof payrollRates | typeof payrollEntries;
const NAZWA = new Map<Tab, string>([[payrollRates, 'payroll_rates'], [payrollEntries, 'payroll_entries']]);

export const notFound = () => new HTTPException(404, { message: 'Nie znaleziono' });
export const personExists = (db: Db, id: string) => !!db.select({ id: schedulePeople.id }).from(schedulePeople).where(and(eq(schedulePeople.id, id), isNull(schedulePeople.deletedAt))).get();

// ---------- wspólne: stawki i wpisy (create / update / usunięcie miękkie) ----------
const get = <T extends Tab>(db: Db, t: T, id: string) => db.select().from(t as Tab).where(and(eq(t.id, id), isNull(t.deletedAt))).get() as T['$inferSelect'] | undefined;
const removedIn = (db: Db, t: Tab, id: string): boolean => !!db.select({ d: t.deletedAt }).from(t).where(eq(t.id, id)).get()?.d;

function create<T extends Tab>(db: Db, userId: string, t: T, d: object): T['$inferSelect'] {
  const at = now();
  const row = db.insert(t as Tab).values({ ...d, id: newId(), createdAt: at, createdBy: userId, updatedAt: at } as never).returning().get() as T['$inferSelect'];
  recordChange(db, userId, NAZWA.get(t)!, row.id, 'create', null, row);
  return row;
}
function update<T extends Tab>(db: Db, userId: string, t: T, id: string, d: object): T['$inferSelect'] | undefined {
  const old = get(db, t, id);
  if (!old) return undefined;
  const set = Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined));
  const row = db.update(t as Tab).set({ ...set, updatedAt: now() } as never).where(eq(t.id, id)).returning().get() as T['$inferSelect'];
  recordChange(db, userId, NAZWA.get(t)!, id, 'update', old, row);
  return row;
}
/** Usunięcie miękkie; powtórzone usunięcie z kolejki offline = ok, nieznane id = 404. */
function remove(db: Db, userId: string, t: Tab, id: string): void {
  const old = get(db, t, id);
  if (!old) { if (removedIn(db, t, id)) return; throw notFound(); }
  const at = now();
  const row = db.update(t).set({ deletedAt: at, updatedAt: at }).where(eq(t.id, id)).returning().get();
  recordChange(db, userId, NAZWA.get(t)!, id, 'delete', old, row);
}

export const createRate = (db: Db, userId: string, d: Opt<PayrollRateCreate>) => create(db, userId, payrollRates, d);
export const updateRate = (db: Db, userId: string, id: string, d: Opt<PayrollRateUpdate>) => update(db, userId, payrollRates, id, d);
export const removeRate = (db: Db, userId: string, id: string) => remove(db, userId, payrollRates, id);
export const createEntry = (db: Db, userId: string, d: Opt<PayrollEntryCreate>) => create(db, userId, payrollEntries, d);
export const updateEntry = (db: Db, userId: string, id: string, d: Opt<PayrollEntryUpdate>) => update(db, userId, payrollEntries, id, d);
export const removeEntry = (db: Db, userId: string, id: string) => remove(db, userId, payrollEntries, id);

// ---------- osoby i miesiące (upsert po kluczu) ----------
export function setPerson(db: Db, userId: string, personId: string, d: Opt<PayrollPerson>) {
  const old = db.select().from(payrollPeople).where(and(eq(payrollPeople.personId, personId), isNull(payrollPeople.deletedAt))).get();
  const at = now();
  if (!old) {
    const row = db.insert(payrollPeople).values({ ...d, personId, id: newId(), createdAt: at, createdBy: userId, updatedAt: at }).returning().get();
    recordChange(db, userId, 'payroll_people', row.id, 'create', null, row);
    return row;
  }
  const row = db.update(payrollPeople).set({ ...d, updatedAt: at }).where(eq(payrollPeople.id, old.id)).returning().get();
  recordChange(db, userId, 'payroll_people', old.id, 'update', old, row);
  return row;
}

/** Oba pola null = wiersz usunięty (zwraca null). */
export function setMonth(db: Db, userId: string, personId: string, miesiac: string, d: Opt<PayrollMonth>) {
  const old = db.select().from(payrollMonths).where(and(eq(payrollMonths.personId, personId), eq(payrollMonths.miesiac, miesiac), isNull(payrollMonths.deletedAt))).get();
  const at = now();
  if (d.godziny === null && d.kosztUmowyGr === null) {
    if (old) {
      const row = db.update(payrollMonths).set({ deletedAt: at, updatedAt: at }).where(eq(payrollMonths.id, old.id)).returning().get();
      recordChange(db, userId, 'payroll_months', old.id, 'delete', old, row);
    }
    return null;
  }
  if (!old) {
    const row = db.insert(payrollMonths).values({ ...d, personId, miesiac, id: newId(), createdAt: at, createdBy: userId, updatedAt: at }).returning().get();
    recordChange(db, userId, 'payroll_months', row.id, 'create', null, row);
    return row;
  }
  const row = db.update(payrollMonths).set({ ...d, updatedAt: at }).where(eq(payrollMonths.id, old.id)).returning().get();
  recordChange(db, userId, 'payroll_months', old.id, 'update', old, row);
  return row;
}

// ---------- parametry ----------
export const getParametry = (db: Db): Record<string, Parametry> => JSON.parse(db.select().from(settings).where(eq(settings.key, 'place_parametry')).get()?.value ?? '{}') as Record<string, Parametry>;
export function setParametry(db: Db, v: Record<string, Parametry>): Record<string, Parametry> {
  const value = JSON.stringify(v), t = now();
  db.insert(settings).values({ key: 'place_parametry', value, updatedAt: t }).onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: t } }).run();
  return v;
}
