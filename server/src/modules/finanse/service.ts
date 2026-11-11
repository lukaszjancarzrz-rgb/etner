import { and, desc, eq, isNull } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { miesiacPrzychodu, newId, rozbij, SPOSOBY, type CostCreate, type CostUpdate, type KpirFile, type KpirMonth, type RevenueCreate, type RevenueUpdate, type Sposob } from '@etner/shared';
import { recordChange } from '../../core/changes.js';
import type { Db } from '../../core/db.js';
import { dictRefsFor } from '../../core/dict-refs.js';
import { settings } from '../../core/schema-base.js';
import * as slowniki from '../slowniki/service.js';
import { costs, kpirMonths, revenues } from './schema.js';

/** Słowniki: kategoria (przychody) i kategoria kosztu (koszty) – zmiana nazwy przenosi się (R36). */
export const dictRefs = {
  count: (db: Db, rodzaj: string, v: string) => revenuesRefs.count(db, rodzaj, v) + costsRefs.count(db, rodzaj, v),
  rename(db: Db, userId: string | null, rodzaj: string, from: string, to: string) {
    revenuesRefs.rename(db, userId, rodzaj, from, to);
    costsRefs.rename(db, userId, rodzaj, from, to);
  },
};
const revenuesRefs = dictRefsFor('revenues', revenues, { kategoria: revenues.kategoria });
const costsRefs = dictRefsFor('costs', costs, { kategoria_kosztu: costs.kategoria });

const now = () => new Date().toISOString();
const live = <T extends { deletedAt: unknown }>(t: T) => isNull(t.deletedAt as never);
type Opt<T> = Omit<T, 'opId'>;

/** Wiersz istnieje, ale jest już usunięty (powtórzone usunięcie z kolejki offline). */
const removedIn = (db: Db, t: typeof revenues | typeof costs, id: string): boolean => !!db.select({ d: t.deletedAt }).from(t).where(eq(t.id, id)).get()?.d;
export const revenueRemoved = (db: Db, id: string) => removedIn(db, revenues, id);
export const costRemoved = (db: Db, id: string) => removedIn(db, costs, id);

// ---------- przychody ----------
export const getRevenue = (db: Db, id: string) => db.select().from(revenues).where(and(eq(revenues.id, id), live(revenues))).get();
export const listRevenues = (db: Db) => db.select().from(revenues).where(live(revenues)).orderBy(desc(revenues.createdAt)).all();

/** netto, VAT i miesiąc z kwoty, sposobu i dat. */
const wylicz = (r: { kwotaGr: number; sposob: string; dzien?: string | null; innyMiesiac?: string | null }) => ({
  ...rozbij(r.kwotaGr, r.sposob as Sposob),
  miesiac: miesiacPrzychodu(r.dzien ?? null, r.innyMiesiac ?? null),
});

export function createRevenue(db: Db, userId: string, d: Opt<RevenueCreate>) {
  const t = now();
  const row = db.insert(revenues).values({ ...d, ...wylicz(d), id: newId(), by: userId, createdAt: t, createdBy: userId, updatedAt: t }).returning().get();
  recordChange(db, userId, 'revenues', row.id, 'create', null, row);
  return row;
}

export function updateRevenue(db: Db, userId: string, id: string, d: Opt<RevenueUpdate>) {
  const old = getRevenue(db, id);
  if (!old) return undefined;
  const set = Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined));
  const row = db.update(revenues).set({ ...set, ...wylicz({ ...old, ...set }), updatedAt: now() }).where(eq(revenues.id, id)).returning().get();
  recordChange(db, userId, 'revenues', id, 'update', old, row);
  return row;
}

export function removeRevenue(db: Db, userId: string, id: string): void {
  const old = getRevenue(db, id);
  if (!old) return;
  const t = now();
  const row = db.update(revenues).set({ deletedAt: t, updatedAt: t }).where(eq(revenues.id, id)).returning().get();
  recordChange(db, userId, 'revenues', id, 'delete', old, row);
}

// ---------- koszty ----------
export const getCost = (db: Db, id: string) => db.select().from(costs).where(and(eq(costs.id, id), live(costs))).get();
export const listCosts = (db: Db) => db.select().from(costs).where(live(costs)).orderBy(desc(costs.dzien), desc(costs.createdAt)).all();

export function createCost(db: Db, userId: string, d: Opt<CostCreate>) {
  const t = now();
  const row = db.insert(costs).values({ ...d, id: newId(), by: userId, createdAt: t, createdBy: userId, updatedAt: t }).returning().get();
  recordChange(db, userId, 'costs', row.id, 'create', null, row);
  return row;
}

export function updateCost(db: Db, userId: string, id: string, d: Opt<CostUpdate>) {
  const old = getCost(db, id);
  if (!old) return undefined;
  const set = Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined));
  const row = db.update(costs).set({ ...set, updatedAt: now() }).where(eq(costs.id, id)).returning().get();
  recordChange(db, userId, 'costs', id, 'update', old, row);
  return row;
}

export function removeCost(db: Db, userId: string, id: string): void {
  const old = getCost(db, id);
  if (!old) return;
  const t = now();
  const row = db.update(costs).set({ deletedAt: t, updatedAt: t }).where(eq(costs.id, id)).returning().get();
  recordChange(db, userId, 'costs', id, 'delete', old, row);
}

// ---------- KPiR ----------
export const listKpir = (db: Db) => db.select().from(kpirMonths).where(live(kpirMonths)).orderBy(desc(kpirMonths.miesiac)).all();

export function setKpirMonth(db: Db, userId: string, miesiac: string, d: Opt<KpirMonth>) {
  const old = db.select().from(kpirMonths).where(eq(kpirMonths.miesiac, miesiac)).get();
  const t = now();
  if (!old) {
    const row = db.insert(kpirMonths).values({ ...d, miesiac, id: newId(), createdAt: t, createdBy: userId, updatedAt: t }).returning().get();
    recordChange(db, userId, 'kpir_months', row.id, 'create', null, row);
    return row;
  }
  const row = db.update(kpirMonths).set({ ...d, deletedAt: null, updatedAt: t }).where(eq(kpirMonths.id, old.id)).returning().get();
  recordChange(db, userId, 'kpir_months', old.id, 'update', old, row);
  return row;
}

const toGr = (zl: number) => Math.round(zl * 100);
const zero = () => ({ 12: 0, 13: 0, 14: 0, 15: 0 });

export interface KpirImportResult {
  dodane: number;
  duplikaty: number;
  /** sumy kolumn z pliku */
  sumy: Record<12 | 13 | 14 | 15, number>;
  /** sumy zapisanych (nieusuniętych) kosztów miesiąca po imporcie */
  zapisane: Record<12 | 13 | 14 | 15, number>;
  kpir: { przychod: number; towary: number; uboczne: number; wynagrodzenia: number; pozostale: number };
  /** zapisane − KPiR (pominięty duplikat albo koszt dodany ręcznie widać tutaj) */
  roznice: { towary: number; uboczne: number; wynagrodzenia: number; pozostale: number };
}

const kluczKosztu = (nr: string, dzien: string, netto: number) => `${nr.trim().replace(/\s+/g, ' ').toUpperCase()}|${dzien}|${netto}`;
const kosztyMiesiaca = (db: Db, miesiac: string) => db.select().from(costs).where(and(eq(costs.miesiac, miesiac), live(costs))).all();

/** Import miesiąca z KPiR. Duplikat = pozycja pliku, która ma odpowiednik wśród nieusuniętych kosztów miesiąca w bazie
 * (nr dokumentu bez spacji na brzegach i wielkości liter, dzień, netto); każdy koszt w bazie pasuje do jednej pozycji pliku,
 * identyczne pozycje w samym pliku są wszystkie dodawane. Wywołuj w transakcji. */
export function importKpir(db: Db, userId: string, f: KpirFile): KpirImportResult {
  const znane = new Set(slowniki.list(db, 'kategoria_kosztu').map((s) => s.wartosc));
  const wBazie = new Map<string, number>();
  for (const c of kosztyMiesiaca(db, f.miesiac)) { const k = kluczKosztu(c.nrDokumentu, c.dzien, c.nettoGr); wBazie.set(k, (wBazie.get(k) ?? 0) + 1); }
  const sumy = zero();
  let dodane = 0, duplikaty = 0;
  for (const k of f.koszty) {
    const netto = toGr(k.netto);
    sumy[k.kolumnaKpir] += netto;
    const key = kluczKosztu(k.nrDokumentu, k.data, netto);
    const n = wBazie.get(key) ?? 0;
    if (n > 0) { wBazie.set(key, n - 1); duplikaty++; continue; }
    const znana = znane.has(k.kategoria);
    createCost(db, userId, {
      dzien: k.data, miesiac: f.miesiac, nrDokumentu: k.nrDokumentu, kontrahent: k.kontrahent, nip: k.nip, opis: k.opis,
      kategoria: znana ? k.kategoria : 'Inne', nettoGr: netto, kolumnaKpir: k.kolumnaKpir, doWyniku: k.doWyniku,
      uwagi: znana ? k.uwagi : [k.uwagi, `kategoria z pliku: ${k.kategoria}`].filter(Boolean).join('; '),
    });
    dodane++;
  }
  const zapisane = zero();
  for (const c of kosztyMiesiaca(db, f.miesiac)) zapisane[c.kolumnaKpir as 12 | 13 | 14 | 15] += c.nettoGr;
  const kpir = { przychod: toGr(f.kpir.przychod), towary: toGr(f.kpir.towary), uboczne: toGr(f.kpir.uboczne), wynagrodzenia: toGr(f.kpir.wynagrodzenia), pozostale: toGr(f.kpir.pozostale) };
  setKpirMonth(db, userId, f.miesiac, { przychodGr: kpir.przychod, towaryGr: kpir.towary, uboczneGr: kpir.uboczne, wynagrodzeniaGr: kpir.wynagrodzenia, pozostaleGr: kpir.pozostale });
  return {
    dodane, duplikaty, sumy, zapisane, kpir,
    roznice: { towary: zapisane[12] - kpir.towary, uboczne: zapisane[13] - kpir.uboczne, wynagrodzenia: zapisane[14] - kpir.wynagrodzenia, pozostale: zapisane[15] - kpir.pozostale },
  };
}

// ---------- ustawienia ----------
export interface FinanseSettings { autoPrzychod: boolean; domyslnySposob: Sposob }
const setting = (db: Db, key: string) => db.select().from(settings).where(eq(settings.key, key)).get()?.value;

export function getSettings(db: Db): FinanseSettings {
  const s = setting(db, 'finanse_domyslny_sposob') as Sposob | undefined;
  return { autoPrzychod: setting(db, 'finanse_auto_przychod') === '1', domyslnySposob: s && SPOSOBY.includes(s) ? s : 'vat8' };
}

/** Koszty pracowników na miesiąc (gr, RRRR-MM → kwota), wpisywane ręcznie do czasu modułu Płace. */
export const getPlace = (db: Db): Record<string, number> => JSON.parse(setting(db, 'finanse_place') ?? '{}') as Record<string, number>;
export function setPlace(db: Db, miesiac: string, gr: number | null): Record<string, number> {
  const v = getPlace(db);
  if (gr === null) delete v[miesiac]; else v[miesiac] = gr;
  const value = JSON.stringify(v), t = now();
  db.insert(settings).values({ key: 'finanse_place', value, updatedAt: t }).onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: t } }).run();
  return v;
}

export function setSettings(db: Db, v: FinanseSettings): FinanseSettings {
  const t = now();
  for (const [key, value] of [['finanse_auto_przychod', v.autoPrzychod ? '1' : '0'], ['finanse_domyslny_sposob', v.domyslnySposob]] as const) {
    db.insert(settings).values({ key, value, updatedAt: t }).onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: t } }).run();
  }
  return getSettings(db);
}

export const notFound = () => new HTTPException(404, { message: 'Nie znaleziono' });
