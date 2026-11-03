import { and, eq, isNull } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { defaultCycle, newId, type FolderUpdate } from '@etner/shared';
import { recordChange } from '../../core/changes.js';
import type { Db } from '../../core/db.js';
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
