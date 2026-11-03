import { and, asc, eq, isNull, like, or, sql } from 'drizzle-orm';
import { newId, norm, phoneDigits, type ClientCreate, type ClientUpdate, type SiteInput, type SiteUpdate } from '@etner/shared';
import { HTTPException } from 'hono/http-exception';
import { recordChange } from '../../core/changes.js';
import type { DictRefs } from '../../core/dict-refs.js';
import { tx, type Db } from '../../core/db.js';
import { defaultFirmaId } from '../../core/firma.js';
import { clients, sites } from './schema.js';

export type ClientRow = typeof clients.$inferSelect;
export type SiteRow = typeof sites.$inferSelect;
export type ClientHit = Pick<ClientRow, 'id' | 'nazwa' | 'typ' | 'telefony' | 'emaile'>;

export { norm, phoneDigits };

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

/**
 * Łączy duplikat `dupId` z klientem głównym `mainId` (R58): obiekty i odwołania innych modułów (`refs`, kolumna `clientId`)
 * przechodzą do głównego, puste pola głównego uzupełniane z duplikatu, telefony i e-maile sumowane, duplikat miękko usunięty.
 * Jedna transakcja, każdy zmieniony wiersz w changes. Duplikat już usunięty = bez zmian (powtórka).
 */
export function merge(db: Db, userId: string, mainId: string, dupId: string, refs: DictRefs[]): ClientRow | undefined {
  return tx(db, () => {
    const main = get(db, mainId);
    if (!main) return undefined;
    const dup = db.select().from(clients).where(eq(clients.id, dupId)).get();
    if (!dup || mainId === dupId) return undefined;
    if (dup.deletedAt) return main;
    const now = new Date().toISOString();
    for (const s of activeSites(db, dupId)) {
      const row = db.update(sites).set({ clientId: mainId, updatedAt: now }).where(eq(sites.id, s.id)).returning().get();
      recordChange(db, userId, 'sites', s.id, 'update', s, row);
    }
    // tylko żywe wiersze: usunięte (zlecenia, leady, zadania, obiekty) zostają przy starym id duplikatu
    for (const r of refs) r.rename(db, userId, 'clientId', dupId, mainId);
    const union = (a: string[], b: string[], key: (x: string) => string) => [...a, ...b.filter((x) => !a.some((y) => key(y) === key(x)))];
    const merged = {
      ...main,
      telefony: union(main.telefony, dup.telefony, phoneDigits),
      emaile: union(main.emaile, dup.emaile, (e) => e.toLowerCase()),
      nip: main.nip || dup.nip,
      notatki: main.notatki && dup.notatki && main.notatki !== dup.notatki ? `${main.notatki}\n${dup.notatki}` : main.notatki || dup.notatki,
    };
    // zawsze z wpisem w changes: pracownik dostaje głównego klienta, gdy właśnie przeszły do niego zlecenia
    const row = db.update(clients).set({ ...merged, szukaj: clientText(merged, activeSites(db, mainId)), updatedAt: now }).where(eq(clients.id, mainId)).returning().get();
    recordChange(db, userId, 'clients', mainId, 'update', main, row);
    const gone = db.update(clients).set({ deletedAt: now, updatedAt: now }).where(eq(clients.id, dupId)).returning().get();
    recordChange(db, userId, 'clients', dupId, 'delete', dup, gone);
    return row;
  });
}

/** Klucz duplikatu obiektu (R70): nazwa, adres i miejscowość jak `norm`, bez interpunkcji; '' = obiekt bez danych (nigdy nie łączony sam). */
export const siteKey = (s: Pick<SiteRow, 'nazwa' | 'adres' | 'miejscowosc'>): string =>
  [s.nazwa, s.adres, s.miejscowosc].map((x) => norm(x.replace(/[^\p{L}\p{N}\s]/gu, ' '))).join('|').replace(/^\|+$/, '');

/**
 * Łączy obiekt `dupId` z obiektem `keepId` tego samego klienta: odwołania innych modułów (`refs`, kolumna `siteId`: zlecenia, leady,
 * teczki i paszport) przechodzą do głównego, puste pola głównego z duplikatu, duplikat miękko usunięty. Jedna transakcja, każdy wiersz
 * w changes. Duplikat już usunięty = bez zmian (powtórka). `by` null = zadanie przy starcie.
 */
export function mergeSites(db: Db, by: string | null, keepId: string, dupId: string, refs: DictRefs[]): SiteRow | undefined {
  return tx(db, () => {
    const keep = getSite(db, keepId);
    const dup = db.select().from(sites).where(eq(sites.id, dupId)).get();
    if (!keep || !dup || keepId === dupId) return undefined;
    if (dup.deletedAt) return keep;
    if (dup.clientId !== keep.clientId) throw new HTTPException(400, { message: 'Obiekty różnych klientów – najpierw połącz klientów' });
    const now = new Date().toISOString();
    for (const r of refs) r.rename(db, by, 'siteId', dupId, keepId);
    const merged = {
      nazwa: keep.nazwa || dup.nazwa, adres: keep.adres || dup.adres, miejscowosc: keep.miejscowosc || dup.miejscowosc, mapa: keep.mapa || dup.mapa,
      opis: keep.opis && dup.opis && keep.opis !== dup.opis ? `${keep.opis}\n${dup.opis}` : keep.opis || dup.opis,
    };
    // zawsze z wpisem w changes: pracownik dostaje obiekt, gdy właśnie przeszły do niego zlecenia
    const row = db.update(sites).set({ ...merged, szukaj: siteText(merged), updatedAt: now }).where(eq(sites.id, keepId)).returning().get();
    recordChange(db, by, 'sites', keepId, 'update', keep, row);
    const gone = db.update(sites).set({ deletedAt: now, updatedAt: now }).where(eq(sites.id, dupId)).returning().get();
    recordChange(db, by, 'sites', dupId, 'delete', dup, gone);
    refreshSzukaj(db, keep.clientId);
    return row;
  });
}

/** R70: jednorazowo przy starcie – obiekty klienta o tym samym `siteKey` łączone z najstarszym, każda para w osobnej transakcji. Zwraca liczbę połączonych. */
export function mergeDuplicateSites(db: Db, refs: DictRefs[]): number {
  const seen = new Map<string, string>();
  let n = 0;
  for (const s of db.select().from(sites).where(isNull(sites.deletedAt)).orderBy(asc(sites.createdAt), asc(sites.id)).all()) {
    const k = siteKey(s);
    if (!k) continue;
    const keepId = seen.get(`${s.clientId}|${k}`);
    if (!keepId) { seen.set(`${s.clientId}|${k}`, s.id); continue; }
    mergeSites(db, null, keepId, s.id, refs);
    n++;
  }
  return n;
}

/** Obiekt identyczny (siteKey) z istniejącym obiektem klienta zwraca istniejący (R70). */
export function addSite(db: Db, userId: string, clientId: string, input: Partial<SiteInput>): SiteRow | undefined {
  if (!get(db, clientId)) return undefined;
  const now = new Date().toISOString();
  const v = { nazwa: '', adres: '', miejscowosc: '', mapa: '', opis: '', ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) };
  const k = siteKey(v);
  const same = k && activeSites(db, clientId).find((s) => siteKey(s) === k);
  if (same) return same;
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
