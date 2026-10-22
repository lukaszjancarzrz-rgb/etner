import { and, asc, eq, isNull, like, or, sql } from 'drizzle-orm';
import { newId, type ClientCreate, type ClientUpdate, type SiteInput, type SiteUpdate } from '@etner/shared';
import { recordChange } from '../../core/changes.js';
import type { Db } from '../../core/db.js';
import { defaultFirmaId } from '../../core/firma.js';
import { clients, sites } from './schema.js';

export type ClientRow = typeof clients.$inferSelect;
export type SiteRow = typeof sites.$inferSelect;
export type ClientHit = Pick<ClientRow, 'id' | 'nazwa' | 'typ' | 'telefony' | 'emaile'>;

/** Małe litery bez diakrytyków (ł nie rozkłada się w NFD). */
export const norm = (s: string): string =>
  s.toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim();

/** Telefon jako same cyfry, bez prefiksu +48 / 0048. */
export const phoneDigits = (s: string): string => {
  const d = s.replace(/\D/g, '').replace(/^00/, '');
  return d.length === 11 && d.startsWith('48') ? d.slice(2) : d;
};

const activeSites = (db: Db, clientId: string): SiteRow[] =>
  db.select().from(sites).where(and(eq(sites.clientId, clientId), isNull(sites.deletedAt))).orderBy(asc(sites.createdAt)).all();

const siteText = (s: Pick<SiteRow, 'nazwa' | 'adres' | 'miejscowosc'>) => norm(`${s.nazwa} ${s.adres} ${s.miejscowosc}`);

const clientText = (c: Pick<ClientRow, 'nazwa' | 'telefony' | 'emaile'>, ss: SiteRow[]) =>
  [norm(c.nazwa), ...c.telefony.map(phoneDigits), ...c.emaile.map((e) => e.toLowerCase()), ...ss.map(siteText)].join(' ');

const hit = (c: ClientRow): ClientHit => ({ id: c.id, nazwa: c.nazwa, typ: c.typ, telefony: c.telefony, emaile: c.emaile });

export const get = (db: Db, id: string): ClientRow | undefined =>
  db.select().from(clients).where(and(eq(clients.id, id), isNull(clients.deletedAt))).get();

export const getSite = (db: Db, id: string): SiteRow | undefined =>
  db.select().from(sites).where(and(eq(sites.id, id), isNull(sites.deletedAt))).get();

export const listSites = activeSites;

/** Przelicza `szukaj` klienta po zmianie jego obiektów (bez wpisu do changes: pole służy tylko wyszukiwaniu po stronie serwera). */
function refreshSzukaj(db: Db, clientId: string): void {
  const c = get(db, clientId);
  if (c) db.update(clients).set({ szukaj: clientText(c, activeSites(db, clientId)) }).where(eq(clients.id, clientId)).run();
}

const esc = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

export function search(db: Db, q: string): ClientHit[] {
  const t = norm(q);
  if (!t) return [];
  const digits = q.replace(/\s/g, '').replace(/\D/g, '');
  const pats = [t, ...(digits.length >= 3 && /^[\d\s+()-]+$/.test(q) ? [phoneDigits(q)] : [])];
  const cond = or(...pats.map((p) => sql`${clients.szukaj} LIKE ${'%' + esc(p) + '%'} ESCAPE '\\'`));
  return db.select().from(clients).where(and(isNull(clients.deletedAt), cond)).orderBy(asc(clients.nazwa)).limit(20).all().map(hit);
}

/** Inni klienci z tym samym telefonem lub e-mailem (ostrzeżenie, nie blokada). */
export function findDuplicates(db: Db, c: Pick<ClientRow, 'telefony' | 'emaile'>, exceptId?: string): ClientHit[] {
  const ph = new Set(c.telefony.map(phoneDigits).filter(Boolean));
  const em = new Set(c.emaile.map((e) => e.toLowerCase()));
  // shortcut: skan wszystkich klientów, przy tysiącach rekordów przejść na tabelę kontaktów z indeksem
  return db.select().from(clients).where(isNull(clients.deletedAt)).all()
    .filter((o) => o.id !== exceptId && (o.telefony.some((p) => ph.has(phoneDigits(p))) || o.emaile.some((e) => em.has(e.toLowerCase()))))
    .map(hit);
}

export function addSite(db: Db, userId: string, clientId: string, input: Partial<SiteInput>): SiteRow | undefined {
  if (!get(db, clientId)) return undefined;
  const now = new Date().toISOString();
  const v = { nazwa: '', adres: '', miejscowosc: '', mapa: '', opis: '', ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) };
  const row = db.insert(sites).values({ id: newId(), clientId, ...v, szukaj: siteText(v), createdAt: now, createdBy: userId, updatedAt: now }).returning().get();
  recordChange(db, userId, 'sites', row.id, 'create', null, row);
  refreshSzukaj(db, clientId);
  return row;
}

export function create(db: Db, userId: string, input: ClientCreate): { client: ClientRow; site?: SiteRow; duplicates: ClientHit[] } {
  const now = new Date().toISOString();
  const { site: siteIn, ...c } = input;
  const duplicates = findDuplicates(db, c);
  const client = db.insert(clients).values({ id: newId(), firmaId: defaultFirmaId(db), ...c, szukaj: clientText(c, []), createdAt: now, createdBy: userId, updatedAt: now }).returning().get();
  recordChange(db, userId, 'clients', client.id, 'create', null, client);
  const site = siteIn ? addSite(db, userId, client.id, siteIn) : undefined;
  return { client: get(db, client.id)!, site, duplicates };
}

export function update(db: Db, userId: string, id: string, patch: Omit<ClientUpdate, 'opId'>): ClientRow | undefined {
  const old = get(db, id);
  if (!old) return undefined;
  const merged = { ...old, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) } as ClientRow;
  const row = db.update(clients).set({ ...merged, szukaj: clientText(merged, activeSites(db, id)), updatedAt: new Date().toISOString() }).where(eq(clients.id, id)).returning().get();
  recordChange(db, userId, 'clients', id, 'update', old, row);
  return row;
}

export function updateSite(db: Db, userId: string, id: string, patch: Omit<SiteUpdate, 'opId'>): SiteRow | undefined {
  const old = getSite(db, id);
  if (!old) return undefined;
  const merged = { ...old, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) } as SiteRow;
  const row = db.update(sites).set({ ...merged, szukaj: siteText(merged), updatedAt: new Date().toISOString() }).where(eq(sites.id, id)).returning().get();
  recordChange(db, userId, 'sites', id, 'update', old, row);
  refreshSzukaj(db, old.clientId);
  return row;
}

export type SiteWorker = Pick<SiteRow, 'id' | 'clientId' | 'nazwa' | 'adres' | 'miejscowosc' | 'mapa' | 'opis'>;
export const siteForWorker = (s: Record<string, any>): SiteWorker => ({
  id: s.id, clientId: s.clientId, nazwa: s.nazwa, adres: s.adres, miejscowosc: s.miejscowosc, mapa: s.mapa, opis: s.opis,
});
export const clientForWorker = (c: Record<string, any>): Pick<ClientRow, 'id' | 'nazwa' | 'telefony'> => ({ id: c.id, nazwa: c.nazwa, telefony: c.telefony });

/** Widok pracownika: bez NIP i notatek. `site` = wskazany obiekt albo pierwszy. */
export function forWorker(db: Db, id: string, siteId?: string) {
  const c = get(db, id);
  if (!c) return undefined;
  const ss = activeSites(db, id);
  const s = (siteId ? ss.find((x) => x.id === siteId) : ss[0]) ?? null;
  return { nazwa: c.nazwa, telefony: c.telefony, site: s && siteForWorker(s) };
}
