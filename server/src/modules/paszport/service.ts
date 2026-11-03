import { and, eq, isNull } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { defaultCycle, newId } from '@etner/shared';
import { recordChange } from '../../core/changes.js';
import type { Db } from '../../core/db.js';
import { dictRefsFor } from '../../core/dict-refs.js';
import * as klienci from '../klienci/service.js';
import * as slowniki from '../slowniki/service.js';
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
