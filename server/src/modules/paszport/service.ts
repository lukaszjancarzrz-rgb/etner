import { and, eq, isNull } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { newId, type DeviceCreate, type DeviceUpdate, type FolderFile, type FolderUpdate, type ServiceEntryCreate, type ServiceEntryUpdate, type User } from '@etner/shared';
import { recordChange } from '../../core/changes.js';
import { tx, type Db } from '../../core/db.js';
import { can } from '../../core/permissions.js';
import type { DictRefs } from '../../core/dict-refs.js';
import * as dziennik from '../dziennik/service.js';
import * as klienci from '../klienci/service.js';
import * as slowniki from '../slowniki/service.js';
import * as zlecenia from '../zlecenia/service.js';
import { devices, passportFolders, passports, serviceEntries } from './schema.js';

/** Domyślny cykl serwisu kategorii w miesiącach ze słownika (R67); null = bez cyklu. */
export const defaultCycle = (db: Db, kategoria: string): number | null =>
  slowniki.list(db, 'kategoria').find((d) => d.wartosc === kategoria)?.cyklMies ?? null;

/**
 * Słowniki: zmiana nazwy kategorii zmienia nazwę teczki (P2, R36). Gdy obiekt ma już teczkę kategorii docelowej („Zamień na…”),
 * teczki się scalają: urządzenia, wpisy i pliki przechodzą do docelowej, puste pola serwisu dostają wartości źródłowej
 * (wcześniejszy termin), notatki się łączą, a źródłowa jest usuwana miękko.
 */
export const dictRefs: DictRefs = {
  count: (db, rodzaj, value) => (rodzaj === 'kategoria' ? db.select({ id: passportFolders.id }).from(passportFolders).where(and(eq(passportFolders.kategoria, value), isNull(passportFolders.deletedAt))).all().length : 0),
  rename(db, userId, rodzaj, from, to) {
    if (rodzaj !== 'kategoria') return;
    const now = NOW();
    for (const old of db.select().from(passportFolders).where(and(eq(passportFolders.kategoria, from), isNull(passportFolders.deletedAt))).all()) {
      const target = findFolder(db, old.siteId, to);
      if (!target) {
        const row = db.update(passportFolders).set({ kategoria: to, updatedAt: now }).where(eq(passportFolders.id, old.id)).returning().get();
        recordChange(db, userId, 'passport_folders', old.id, 'update', old, row);
        continue;
      }
      mergeFolder(db, userId, old, target);
    }
  },
};

/** R68: urządzenia, wpisy i pliki teczki `old` przechodzą do `target`; puste pola serwisu z `old` (wcześniejszy termin), notatki łączone, `old` usunięta miękko. Wywołuj w transakcji. */
function mergeFolder(db: Db, userId: string | null, old: FolderRow, target: FolderRow): void {
  const now = NOW();
  for (const t of [devices, serviceEntries]) {
    const entity = t === devices ? 'devices' : 'service_entries';
    for (const r of db.select().from(t).where(and(eq(t.folderId, old.id), isNull(t.deletedAt))).all()) {
      const row = db.update(t).set({ folderId: target.id, updatedAt: now }).where(eq(t.id, r.id)).returning().get();
      recordChange(db, userId, entity, r.id, 'update', r, row);
    }
  }
  dziennik.moveAttachments(db, userId, 'teczka', old.id, target.id);
  const terms = [target.nastepnySerwis, old.nastepnySerwis].filter((d): d is string => !!d).sort();
  const merged = db.update(passportFolders).set({
    nastepnySerwis: terms[0] ?? null,
    cyklMies: target.cyklMies ?? old.cyklMies,
    notatkaRozliczenie: [target.notatkaRozliczenie, old.notatkaRozliczenie].filter(Boolean).join('\n\n'),
    updatedAt: now,
  }).where(eq(passportFolders.id, target.id)).returning().get();
  recordChange(db, userId, 'passport_folders', target.id, 'update', target, merged);
  const gone = db.update(passportFolders).set({ deletedAt: now, updatedAt: now }).where(eq(passportFolders.id, old.id)).returning().get();
  recordChange(db, userId, 'passport_folders', old.id, 'delete', old, gone);
}

/**
 * Łączenie obiektów (klienci.mergeSites): teczki duplikatu przechodzą do obiektu głównego, a teczki tej samej kategorii się scalają (R68).
 * Paszport duplikatu przechodzi, gdy główny go nie ma; gdy oba mają – zostaje paszport głównego, drugi usunięty miękko. Wywołuj w transakcji.
 */
export const siteRefs: DictRefs = {
  count: () => 0,
  rename(db, userId, rodzaj, from, to) {
    if (rodzaj !== 'siteId') return;
    const now = NOW();
    for (const old of foldersOf(db, from)) {
      const target = findFolder(db, to, old.kategoria);
      if (target) { mergeFolder(db, userId, old, target); continue; }
      const row = db.update(passportFolders).set({ siteId: to, updatedAt: now }).where(eq(passportFolders.id, old.id)).returning().get();
      recordChange(db, userId, 'passport_folders', old.id, 'update', old, row);
    }
    const p = passportOf(db, from);
    if (!p) return;
    const keep = passportOf(db, to);
    const row = db.update(passports).set(keep ? { deletedAt: now, updatedAt: now } : { siteId: to, updatedAt: now }).where(eq(passports.id, p.id)).returning().get();
    recordChange(db, userId, 'passports', p.id, keep ? 'delete' : 'update', p, row);
  },
};
const passportOf = (db: Db, siteId: string): PassportRow | undefined =>
  db.select().from(passports).where(and(eq(passports.siteId, siteId), isNull(passports.deletedAt))).get();

export type PassportRow = typeof passports.$inferSelect;
export type FolderRow = typeof passportFolders.$inferSelect;
export type DeviceRow = typeof devices.$inferSelect;
export type ServiceEntryRow = typeof serviceEntries.$inferSelect;

const NOW = () => new Date().toISOString();
const bad = (m: string) => new HTTPException(400, { message: m });
const notFound = () => new HTTPException(404, { message: 'Nie znaleziono' });
/** Teczka urządzenia / wpisu (404, gdy jej już nie ma). */
function parentOf(db: Db, folderId: string): FolderRow {
  const f = getFolder(db, folderId);
  if (!f) throw notFound();
  return f;
}

export const getFolder = (db: Db, id: string): FolderRow | undefined =>
  db.select().from(passportFolders).where(and(eq(passportFolders.id, id), isNull(passportFolders.deletedAt))).get();
export const findFolder = (db: Db, siteId: string, kategoria: string): FolderRow | undefined =>
  db.select().from(passportFolders).where(and(eq(passportFolders.siteId, siteId), eq(passportFolders.kategoria, kategoria), isNull(passportFolders.deletedAt))).get();

/** Teczka (obiekt, kategoria): istniejąca albo nowa z domyślnym cyklem. Wywołuj w runOp – wiersz powstaje w tej samej transakcji co zapis. */
export function ensureFolder(db: Db, by: string, siteId: string, kategoria: string): FolderRow {
  const had = findFolder(db, siteId, kategoria);
  if (had) return had;
  if (!klienci.getSite(db, siteId)) throw bad('Nie znaleziono obiektu');
  if (!slowniki.list(db, 'kategoria').some((d) => d.wartosc === kategoria)) throw bad('Nieznana kategoria');
  const now = new Date().toISOString();
  const row = db.insert(passportFolders).values({ id: newId(), siteId, kategoria, cyklMies: defaultCycle(db, kategoria), createdAt: now, createdBy: by, updatedAt: now }).returning().get();
  recordChange(db, by, 'passport_folders', row.id, 'create', null, row);
  return row;
}

/** Teczka bez notatki z rozliczeniem (P6). */
export const folderForWorker = <T extends Record<string, any>>(f: T): Omit<T, 'notatkaRozliczenie'> => {
  const { notatkaRozliczenie: _, ...r } = f;
  return r;
};

export const foldersOf = (db: Db, siteId: string): FolderRow[] =>
  db.select().from(passportFolders).where(and(eq(passportFolders.siteId, siteId), isNull(passportFolders.deletedAt))).all();
const idsOf = (db: Db, table: typeof devices | typeof serviceEntries, folderId: string): string[] =>
  db.select({ id: table.id }).from(table).where(and(eq(table.folderId, folderId), isNull(table.deletedAt))).all().map((r) => r.id);

/** Zdjęcia i pliki teczki: z dzienników i zakresu prac jej zleceń, dodane w teczce, przy wpisach serwisowych i urządzeniach (P4, P5). */
export function filesOf(db: Db, jobIds: string[], folder: FolderRow | undefined): dziennik.AttachmentRow[] {
  const scope = jobIds.flatMap((id) => zlecenia.scopeItemsOf(db, id).map((i) => i.id));
  return [
    ...dziennik.attachmentsFor(db, 'entry', dziennik.jobEntryIds(db, jobIds)),
    ...dziennik.attachmentsFor(db, 'scope', scope),
    ...(folder ? [
      ...dziennik.attachmentsFor(db, 'teczka', [folder.id]),
      ...dziennik.attachmentsFor(db, 'service', idsOf(db, serviceEntries, folder.id)),
      ...dziennik.attachmentsFor(db, 'device', idsOf(db, devices, folder.id)),
    ] : []),
  ];
}

export type Teczka = { kategoria: string; folder?: FolderRow | Omit<FolderRow, 'notatkaRozliczenie'>; jobIds: string[]; photos: number; docs: number; nastepnySerwis?: string };

/** Teczki obiektu: kategorie jego nieusuniętych zleceń ∪ istniejące wiersze teczek, w kolejności słownika (P1, P2). Pracownik bez faktur i rozliczenia. */
export function teczki(db: Db, siteId: string, admin: boolean): Teczka[] {
  const jobs = zlecenia.forSite(db, siteId).filter((j) => j.kategoria);
  const folders = foldersOf(db, siteId);
  const order = slowniki.list(db, 'kategoria').map((d) => d.wartosc);
  const pos = (k: string) => (order.includes(k) ? order.indexOf(k) : order.length);
  const kats = [...new Set([...jobs.map((j) => j.kategoria), ...folders.map((f) => f.kategoria)])].sort((a, b) => pos(a) - pos(b));
  return kats.map((kategoria) => {
    const jobIds = jobs.filter((j) => j.kategoria === kategoria).map((j) => j.id);
    const folder = folders.find((f) => f.kategoria === kategoria);
    const files = filesOf(db, jobIds, folder).filter((a) => admin || a.typDok !== 'faktura');
    return {
      kategoria, jobIds,
      ...(folder && { folder: admin ? folder : folderForWorker(folder) }),
      photos: files.filter((a) => a.rodzaj === 'zdjecie').length,
      docs: files.filter((a) => a.rodzaj === 'plik').length,
      ...(folder?.nastepnySerwis && { nastepnySerwis: folder.nastepnySerwis }),
    };
  });
}

export function updateFolder(db: Db, by: string, id: string, d: Omit<FolderUpdate, 'opId'>): FolderRow | undefined {
  const old = getFolder(db, id);
  if (!old) return undefined;
  const set = Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined));
  const row = db.update(passportFolders).set({ ...set, updatedAt: new Date().toISOString() }).where(eq(passportFolders.id, id)).returning().get();
  recordChange(db, by, 'passport_folders', id, 'update', old, row);
  return row;
}

const clean = <T extends Record<string, unknown>>(d: T) => Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)) as Partial<T>;
/** Zlecenie przy urządzeniu / wpisie musi być z obiektu teczki. */
const checkJob = (db: Db, siteId: string, jobId: string | null | undefined) => {
  if (jobId && zlecenia.get(db, jobId)?.siteId !== siteId) throw bad('Zlecenie nie należy do tego obiektu');
};
/** Edycja i usuwanie urządzenia lub wpisu: admin albo autor (P10). */
export const canEdit = (user: User, authorId: string | null): boolean => can(user, 'admin') || authorId === user.id;

export const getDevice = (db: Db, id: string): DeviceRow | undefined =>
  db.select().from(devices).where(and(eq(devices.id, id), isNull(devices.deletedAt))).get();
export const anyDevice = (db: Db, id: string): DeviceRow | undefined => db.select().from(devices).where(eq(devices.id, id)).get();
export const getEntry = (db: Db, id: string): ServiceEntryRow | undefined =>
  db.select().from(serviceEntries).where(and(eq(serviceEntries.id, id), isNull(serviceEntries.deletedAt))).get();
export const anyEntry = (db: Db, id: string): ServiceEntryRow | undefined => db.select().from(serviceEntries).where(eq(serviceEntries.id, id)).get();

type DoTeczki = { folderId?: string; siteId?: string; kategoria?: string };
/** Teczka zapisu: po id (404, gdy jej nie ma) albo (obiekt, kategoria) – tworzona, gdy jej nie ma. */
const folderFor = (db: Db, by: string, d: DoTeczki): FolderRow => (d.folderId ? parentOf(db, d.folderId) : ensureFolder(db, by, d.siteId!, d.kategoria!));

/** Wywołuj w runOp. */
export function createDevice(db: Db, by: string, d: Omit<DeviceCreate, 'opId'>): DeviceRow {
  const { siteId: _s, kategoria: _k, folderId: _f, ...f } = d;
  const folder = folderFor(db, by, d);
  checkJob(db, folder.siteId, f.jobId);
  const now = NOW();
  const row = db.insert(devices).values({ ...clean(f), nazwa: f.nazwa, dlaKlienta: f.dlaKlienta, id: newId(), folderId: folder.id, createdAt: now, createdBy: by, updatedAt: now }).returning().get();
  recordChange(db, by, 'devices', row.id, 'create', null, row);
  return row;
}

export function updateDevice(db: Db, by: string, old: DeviceRow, d: Omit<DeviceUpdate, 'opId'>): DeviceRow {
  checkJob(db, parentOf(db, old.folderId).siteId, d.jobId);
  const row = db.update(devices).set({ ...clean(d), updatedAt: NOW() }).where(eq(devices.id, old.id)).returning().get();
  recordChange(db, by, 'devices', old.id, 'update', old, row);
  return row;
}

export function removeDevice(db: Db, by: string, old: DeviceRow): void {
  tx(db, () => {
    dziennik.removeAttachmentsOf(db, by, 'device', old.id);
    const now = NOW();
    const row = db.update(devices).set({ deletedAt: now, updatedAt: now }).where(eq(devices.id, old.id)).returning().get();
    recordChange(db, by, 'devices', old.id, 'delete', old, row);
  });
}

/** Wywołuj w runOp: teczka (gdy jej nie ma), wpis, zdjęcia i następny serwis w jednej transakcji (RF #3). */
export function createEntry(db: Db, by: string, d: Omit<ServiceEntryCreate, 'opId'>): ServiceEntryRow {
  const { siteId: _s, kategoria: _k, folderId: _f, uploadIds, nastepnySerwis, ...f } = d;
  const folder = folderFor(db, by, d);
  checkJob(db, folder.siteId, f.jobId);
  const ups = dziennik.checkUploads(db, by, uploadIds);
  const now = NOW();
  const row = db.insert(serviceEntries).values({ ...clean(f), dzien: f.dzien, dlaKlienta: f.dlaKlienta, id: newId(), folderId: folder.id, authorId: by, createdAt: now, createdBy: by, updatedAt: now }).returning().get();
  recordChange(db, by, 'service_entries', row.id, 'create', null, row);
  dziennik.attach(db, by, ups, 'service', row.id, { dlaKlienta: true }); // zdjęcia dodane w teczce: domyślnie w paszporcie
  if (nastepnySerwis !== undefined && nastepnySerwis !== folder.nastepnySerwis) updateFolder(db, by, folder.id, { nastepnySerwis });
  return row;
}

export function updateEntry(db: Db, by: string, old: ServiceEntryRow, d: Omit<ServiceEntryUpdate, 'opId'>): ServiceEntryRow {
  const { uploadIds, ...f } = d;
  checkJob(db, parentOf(db, old.folderId).siteId, f.jobId);
  const ups = dziennik.checkUploads(db, by, uploadIds ?? []);
  const row = db.update(serviceEntries).set({ ...clean(f), updatedAt: NOW() }).where(eq(serviceEntries.id, old.id)).returning().get();
  recordChange(db, by, 'service_entries', old.id, 'update', old, row);
  dziennik.attach(db, by, ups, 'service', old.id, { dlaKlienta: true });
  return row;
}

export function removeEntry(db: Db, by: string, old: ServiceEntryRow): void {
  tx(db, () => {
    dziennik.removeAttachmentsOf(db, by, 'service', old.id);
    const now = NOW();
    const row = db.update(serviceEntries).set({ deletedAt: now, updatedAt: now }).where(eq(serviceEntries.id, old.id)).returning().get();
    recordChange(db, by, 'service_entries', old.id, 'delete', old, row);
  });
}

/** Wywołuj w runOp: plik z POST /api/uploads podpięty do teczki (P5). Fakturę sprawdza trasa (tylko admin). */
export function addFolderFile(db: Db, by: string, d: Omit<FolderFile, 'opId'>): dziennik.AttachmentRow {
  const ups = dziennik.checkUploads(db, by, [d.uploadId]);
  const folder = folderFor(db, by, d);
  return dziennik.attach(db, by, ups, 'teczka', folder.id, { typDok: d.typDok, dlaKlienta: d.typDok !== 'faktura' && (d.dlaKlienta ?? true) })[0]!;
}
