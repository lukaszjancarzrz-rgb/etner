import { and, asc, count, desc, eq, gte, isNull, lte } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { newId, type CarCreate, type CarUpdate } from '@etner/shared';
import { recordChange } from '../../core/changes.js';
import type { Db } from '../../core/db.js';
import { dictRefsFor } from '../../core/dict-refs.js';
import * as slowniki from '../slowniki/service.js';
import { carFaults, cars } from './schema.js';

/** Słowniki: ekipa przypisana do auta (R36). */
export const dictRefs = dictRefsFor('cars', cars, { ekipa: cars.ekipa });

export type CarRow = typeof cars.$inferSelect;
export type FaultRow = typeof carFaults.$inferSelect;

export const getCar = (db: Db, id: string): CarRow | undefined =>
  db.select().from(cars).where(and(eq(cars.id, id), isNull(cars.deletedAt))).get();
export const listCars = (db: Db): CarRow[] =>
  db.select().from(cars).where(isNull(cars.deletedAt)).orderBy(asc(cars.kolejnosc), asc(cars.createdAt)).all();

const checkEkipa = (db: Db, ekipa: string | null | undefined) => {
  if (ekipa && !slowniki.list(db, 'ekipa').some((d) => d.wartosc === ekipa)) throw new HTTPException(400, { message: 'Nieznana ekipa' });
};

export function createCar(db: Db, userId: string | null, d: Omit<CarCreate, 'opId'> & { kolejnosc?: number }): CarRow {
  checkEkipa(db, d.ekipa);
  const now = new Date().toISOString();
  const kolejnosc = d.kolejnosc ?? db.select({ n: count() }).from(cars).get()!.n;
  const row = db.insert(cars).values({ id: newId(), nazwa: d.nazwa, ekipa: d.ekipa ?? null, kolejnosc, createdAt: now, createdBy: userId, updatedAt: now }).returning().get();
  recordChange(db, userId, 'cars', row.id, 'create', null, row);
  return row;
}

export function updateCar(db: Db, userId: string, id: string, d: Omit<CarUpdate, 'opId'>): CarRow | undefined {
  const old = getCar(db, id);
  if (!old) return undefined;
  checkEkipa(db, d.ekipa);
  const set = Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined));
  const row = db.update(cars).set({ ...set, updatedAt: new Date().toISOString() }).where(eq(cars.id, id)).returning().get();
  recordChange(db, userId, 'cars', id, 'update', old, row);
  return row;
}

const SEED = ['Nowa Duża Toyota', 'Mała Toyota', 'Stary Ducato'];
/** Idempotentne: trzy auta właściciela tylko do pustej tabeli (usunięte też się liczą), z wpisem w changes. */
export function seedCars(db: Db): void {
  if (db.select({ n: count() }).from(cars).get()!.n > 0) return;
  SEED.forEach((nazwa, kolejnosc) => createCar(db, null, { nazwa, kolejnosc }));
}

export const getFault = (db: Db, id: string): FaultRow | undefined =>
  db.select().from(carFaults).where(and(eq(carFaults.id, id), isNull(carFaults.deletedAt))).get();
export const listFaults = (db: Db): FaultRow[] =>
  db.select().from(carFaults).where(isNull(carFaults.deletedAt)).orderBy(desc(carFaults.createdAt)).all();
/** Wiersz istnieje, ale jest już usunięty (powtórzone usunięcie z kolejki offline). */
export const faultRemoved = (db: Db, id: string): boolean => !!db.select({ d: carFaults.deletedAt }).from(carFaults).where(eq(carFaults.id, id)).get()?.d;

export function createFault(db: Db, userId: string, d: { carId: string; opis: string }): FaultRow {
  if (!getCar(db, d.carId)) throw new HTTPException(400, { message: 'Nie znaleziono samochodu' });
  const now = new Date().toISOString();
  const row = db.insert(carFaults).values({ id: newId(), carId: d.carId, opis: d.opis, by: userId, createdAt: now, createdBy: userId, updatedAt: now }).returning().get();
  recordChange(db, userId, 'car_faults', row.id, 'create', null, row);
  return row;
}

export function setRepair(db: Db, userId: string, id: string, naprawaDzien: string | null): FaultRow | undefined {
  const old = getFault(db, id);
  if (!old) return undefined;
  const row = db.update(carFaults).set({ naprawaDzien, updatedAt: new Date().toISOString() }).where(eq(carFaults.id, id)).returning().get();
  recordChange(db, userId, 'car_faults', id, 'update', old, row);
  return row;
}

/** „Naprawione” (R44): ustawia albo czyści chwilę naprawy; usterka zostaje w historii (bez usuwania). */
export function setFixed(db: Db, userId: string, id: string, naprawione: boolean): FaultRow | undefined {
  const old = getFault(db, id);
  if (!old) return undefined;
  const now = new Date().toISOString();
  const row = db.update(carFaults).set({ naprawioneAt: naprawione ? old.naprawioneAt ?? now : null, updatedAt: now }).where(eq(carFaults.id, id)).returning().get();
  recordChange(db, userId, 'car_faults', id, 'update', old, row);
  return row;
}

export function removeFault(db: Db, userId: string, id: string): void {
  const old = getFault(db, id);
  if (!old) return;
  const now = new Date().toISOString();
  const row = db.update(carFaults).set({ deletedAt: now, updatedAt: now }).where(eq(carFaults.id, id)).returning().get();
  recordChange(db, userId, 'car_faults', id, 'delete', old, row);
}

/** Naprawy w dniach [from, to] aut z ekipą (nakładka harmonogramu, R41: ekipa auta w chwili odczytu). */
export function repairsIn(db: Db, from: string, to: string): { dzien: string; ekipa: string; auto: string; faultId: string }[] {
  return db.select({ dzien: carFaults.naprawaDzien, ekipa: cars.ekipa, auto: cars.nazwa, faultId: carFaults.id }).from(carFaults)
    .innerJoin(cars, eq(cars.id, carFaults.carId))
    .where(and(isNull(carFaults.deletedAt), isNull(cars.deletedAt), gte(carFaults.naprawaDzien, from), lte(carFaults.naprawaDzien, to)))
    .all().filter((r): r is { dzien: string; ekipa: string; auto: string; faultId: string } => !!r.dzien && !!r.ekipa);
}
