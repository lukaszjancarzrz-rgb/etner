import { CopyObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { and, eq, gt, isNotNull } from 'drizzle-orm';
import type { AppDeps } from '../app.js';
import type { Db } from '../core/db.js';
import { logError } from '../core/errors.js';
import type { CronDef, ModuleDef } from '../core/registry.js';
import { settings, users } from '../core/schema-base.js';
import { attachments } from '../modules/dziennik/schema.js';
import { exportToSheets, googleSheets, tablesForExport, type SheetsClient } from './export-sheets.js';

type Env = Record<string, string | undefined>;

function stamp(db: Db, key: string, at = new Date().toISOString()) {
  db.insert(settings).values({ key, value: at, updatedAt: at }).onConflictDoUpdate({ target: settings.key, set: { value: at, updatedAt: at } }).run();
}
const stamped = (db: Db, key: string) => db.select().from(settings).where(eq(settings.key, key)).get()?.value ?? '';

/** Klucze (oryginał, podgląd, miniatura) załączników utworzonych po `since` (ISO) i zdjęcia osób zmienionych po `avatarSince`. */
export function keysToCopy(db: Db, since: string, avatarSince = since): string[] {
  const rows = db.select().from(attachments).where(gt(attachments.createdAt, since)).all();
  const avatars = db.select({ k: users.avatarKey }).from(users).where(and(gt(users.updatedAt, avatarSince), isNotNull(users.avatarKey))).all();
  return [...rows.flatMap((r) => [r.keyOrig, r.keyView, r.keyThumb]), ...avatars.map((a) => a.k)].filter((k): k is string => !!k);
}

/**
 * Kopiuje nowe klucze; ustawia `kopia_zdjec_at` i `kopia_avatarow_at` dopiero po sukcesie całości (błąd = ponowienie następnej nocy).
 * Zdjęcia osób mają własny kursor (pusty = wszystkie), bo doszły do kopii później niż załączniki.
 */
export async function copyPhotos(db: Db, copy: (key: string) => Promise<void>, since: string, avatarSince = stamped(db, 'kopia_avatarow_at')): Promise<number> {
  const started = new Date().toISOString();
  const keys = keysToCopy(db, since, avatarSince);
  for (const k of keys) {
    try { await copy(k); } catch (e) {
      // brak pliku źródłowego nie może blokować kopii na zawsze; inne błędy przerywają (kursor stoi)
      if ((e as { name?: string })?.name !== 'NoSuchKey') throw e;
      logError(db, 'kopia-zdjec', new Error(`Brak pliku źródłowego: ${k}`));
    }
  }
  stamp(db, 'kopia_zdjec_at', started);
  stamp(db, 'kopia_avatarow_at', started);
  return keys.length;
}

/** Zadania nocne: eksport do arkusza 02:30 i kopia zdjęć 03:00 (brak konfiguracji = pominięcie z wpisem w dzienniku błędów). */
export function kopieCrons(env: Env, defs: ModuleDef[], sheets?: SheetsClient): CronDef[] {
  return [
    {
      name: 'eksport', schedule: '30 2 * * *',
      async run(deps: AppDeps) {
        if (!env.GOOGLE_SA_JSON || !env.SHEETS_ID) {
          console.warn('Eksport do arkusza pominięty: brak GOOGLE_SA_JSON / SHEETS_ID.');
          logError(deps.db, 'eksport', new Error('Eksport do arkusza pominięty: brak GOOGLE_SA_JSON / SHEETS_ID.'));
          return;
        }
        await exportToSheets(deps.db, sheets ?? googleSheets(env.GOOGLE_SA_JSON), env.SHEETS_ID, tablesForExport(defs));
        stamp(deps.db, 'kopia_eksport_at');
      },
    },
    {
      name: 'kopia-zdjec', schedule: '0 3 * * *',
      async run(deps: AppDeps) {
        const { R2_BUCKET: from, R2_BACKUP_BUCKET: to, R2_ENDPOINT: endpoint, R2_KEY: accessKeyId, R2_SECRET: secretAccessKey } = env;
        if (!from || !to || !endpoint || !accessKeyId || !secretAccessKey) {
          console.warn('Kopia zdjęć pominięta: brak R2_BUCKET / R2_BACKUP_BUCKET / R2_ENDPOINT / R2_KEY / R2_SECRET.');
          logError(deps.db, 'kopia-zdjec', new Error('Kopia zdjęć pominięta: brak konfiguracji R2 lub R2_BACKUP_BUCKET.'));
          return;
        }
        const s3 = new S3Client({ region: 'auto', endpoint, credentials: { accessKeyId, secretAccessKey } });
        await copyPhotos(deps.db, async (key) => {
          await s3.send(new CopyObjectCommand({ Bucket: to, CopySource: `${from}/${key}`, Key: `files/${key}` }));
        }, stamped(deps.db, 'kopia_zdjec_at'));
      },
    },
  ];
}
