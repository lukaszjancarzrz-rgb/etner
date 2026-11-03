import { and, eq, isNull } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { defaultCycle, newId, type DeviceCreate, type DeviceUpdate, type FolderFile, type FolderUpdate, type ServiceEntryCreate, type ServiceEntryUpdate, type User } from '@etner/shared';
import { recordChange } from '../../core/changes.js';
import { tx, type Db } from '../../core/db.js';
import { can } from '../../core/permissions.js';
import { dictRefsFor } from '../../core/dict-refs.js';
import * as dziennik from '../dziennik/service.js';
import * as klienci from '../klienci/service.js';
import * as slowniki from '../slowniki/service.js';
import * as zlecenia from '../zlecenia/service.js';
import { devices, passportFolders, passports, serviceEntries } from './schema.js';

export { defaultCycle };

/** Słowniki: zmiana nazwy kategorii zmienia nazwę teczki (P2, R36). */
export const dictRefs = dictRefsFor('passport_folders', passportFolders, { kategoria: passportFolders.kategoria });

export type PassportRow = typeof passports.$inferSelect;
export type FolderRow = typeof passportFolders.$inferSelect;
export type DeviceRow = typeof devices.$inferSelect;
export type ServiceEntryRow = typeof serviceEntries.$inferSelect;

const bad = (m: string) => new HTTPException(400, { message: m });

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
  const row = db.insert(passportFolders).values({ id: newId(), siteId, kategoria, cyklMies: defaultCycle(kategoria), createdAt: now, createdBy: by, updatedAt: now }).returning().get();
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

const NOW = () => new Date().toISOString();
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

/** Wywołuj w runOp. */
export function createDevice(db: Db, by: string, d: Omit<DeviceCreate, 'opId'>): DeviceRow {
  const { siteId, kategoria, ...f } = d;
  checkJob(db, siteId, f.jobId);
  const folder = ensureFolder(db, by, siteId, kategoria);
  const now = NOW();
  const row = db.insert(devices).values({ ...clean(f), nazwa: f.nazwa, dlaKlienta: f.dlaKlienta, id: newId(), folderId: folder.id, createdAt: now, createdBy: by, updatedAt: now }).returning().get();
  recordChange(db, by, 'devices', row.id, 'create', null, row);
  return row;
}

export function updateDevice(db: Db, by: string, old: DeviceRow, d: Omit<DeviceUpdate, 'opId'>): DeviceRow {
  checkJob(db, getFolder(db, old.folderId)!.siteId, d.jobId);
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
  const { siteId, kategoria, uploadIds, nastepnySerwis, ...f } = d;
  checkJob(db, siteId, f.jobId);
  const ups = dziennik.checkUploads(db, by, uploadIds);
  const folder = ensureFolder(db, by, siteId, kategoria);
  const now = NOW();
  const row = db.insert(serviceEntries).values({ ...clean(f), dzien: f.dzien, dlaKlienta: f.dlaKlienta, id: newId(), folderId: folder.id, authorId: by, createdAt: now, createdBy: by, updatedAt: now }).returning().get();
  recordChange(db, by, 'service_entries', row.id, 'create', null, row);
  dziennik.attach(db, by, ups, 'service', row.id);
  if (nastepnySerwis !== undefined && nastepnySerwis !== folder.nastepnySerwis) updateFolder(db, by, folder.id, { nastepnySerwis });
  return row;
}

export function updateEntry(db: Db, by: string, old: ServiceEntryRow, d: Omit<ServiceEntryUpdate, 'opId'>): ServiceEntryRow {
  const { uploadIds, ...f } = d;
  checkJob(db, getFolder(db, old.folderId)!.siteId, f.jobId);
  const ups = dziennik.checkUploads(db, by, uploadIds ?? []);
  const row = db.update(serviceEntries).set({ ...clean(f), updatedAt: NOW() }).where(eq(serviceEntries.id, old.id)).returning().get();
  recordChange(db, by, 'service_entries', old.id, 'update', old, row);
  dziennik.attach(db, by, ups, 'service', old.id);
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
  const folder = ensureFolder(db, by, d.siteId, d.kategoria);
  return dziennik.attach(db, by, ups, 'teczka', folder.id, { typDok: d.typDok, dlaKlienta: d.dlaKlienta })[0]!;
}
