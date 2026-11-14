import { DeleteObjectsCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { eq } from 'drizzle-orm';
import type { Db } from '../core/db.js';
import { settings } from '../core/schema-base.js';

/**
 * Codzienna pełna kopia bazy (niezależna od Litestream): spójna kopia SQLite, gzip, plik `kopie-bazy/etner-RRRR-MM-DD.db.gz`
 * w buckecie kopii (R2_BACKUP_BUCKET, a bez niego w buckecie zdjęć – osobny katalog, aplikacja kasuje tylko swoje pliki).
 * Zostają kopie z ostatnich 30 dni i z 1. dnia każdego miesiąca przez rok.
 */
export const KOPIA_PREFIX = 'kopie-bazy/';
export const kluczKopii = (dzien: string) => `${KOPIA_PREFIX}etner-${dzien}.db.gz`;

export interface Magazyn { put(key: string, body: Buffer): Promise<void>; list(prefix: string): Promise<string[]>; del(keys: string[]): Promise<void> }

/** Kopie do usunięcia: starsze niż 30 dni, poza kopiami z 1. dnia miesiąca młodszymi niż rok. */
export function doUsuniecia(keys: string[], dzis: string): string[] {
  const t = Date.parse(dzis);
  return keys.filter((k) => {
    const d = /etner-(\d{4}-\d{2}-\d{2})\.db\.gz$/.exec(k)?.[1];
    if (!d) return false; // obce pliki w katalogu zostają
    const dni = (t - Date.parse(d)) / 86_400_000;
    return dni > 30 && !(d.endsWith('-01') && dni <= 366);
  });
}

function stamp(db: Db, key: string, value: string) {
  const at = new Date().toISOString();
  db.insert(settings).values({ key, value, updatedAt: at }).onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: at } }).run();
}

/** Kopia teraz: zwraca klucz i rozmiar (bajty, po kompresji); znacznik `kopia_bazy_at` dopiero po udanym zapisie. */
export async function kopiaBazy(db: Db, m: Magazyn, dzis: string): Promise<{ key: string; rozmiar: number }> {
  const tmp = join(tmpdir(), `etner-kopia-${process.pid}-${Date.now()}.db`);
  try {
    await db.$client.backup(tmp); // spójna kopia przy działającej aplikacji
    const body = gzipSync(readFileSync(tmp));
    const key = kluczKopii(dzis);
    await m.put(key, body);
    const stare = doUsuniecia(await m.list(KOPIA_PREFIX), dzis);
    if (stare.length) await m.del(stare);
    stamp(db, 'kopia_bazy_at', new Date().toISOString());
    stamp(db, 'kopia_bazy_rozmiar', String(body.length));
    return { key, rozmiar: body.length };
  } finally {
    rmSync(tmp, { force: true });
  }
}

export const ostatniaKopia = (db: Db) => ({
  at: db.select().from(settings).where(eq(settings.key, 'kopia_bazy_at')).get()?.value ?? null,
  rozmiar: Number(db.select().from(settings).where(eq(settings.key, 'kopia_bazy_rozmiar')).get()?.value ?? 0) || null,
});

type Env = Record<string, string | undefined>;
/** Magazyn R2 z env; brak konfiguracji = null (kopia pominięta z komunikatem). */
export function magazynR2(env: Env): (Magazyn & { get(key: string): Promise<Buffer> }) | null {
  const { R2_BACKUP_BUCKET, R2_BUCKET, R2_ENDPOINT: endpoint, R2_KEY: accessKeyId, R2_SECRET: secretAccessKey } = env;
  const Bucket = R2_BACKUP_BUCKET || R2_BUCKET;
  if (!Bucket || !endpoint || !accessKeyId || !secretAccessKey) return null;
  const s3 = new S3Client({ region: 'auto', endpoint, credentials: { accessKeyId, secretAccessKey } });
  return {
    async put(Key, Body) { await s3.send(new PutObjectCommand({ Bucket, Key, Body, ContentType: 'application/gzip' })); },
    async list(Prefix) {
      const out: string[] = [];
      let ContinuationToken: string | undefined;
      do {
        const r = await s3.send(new ListObjectsV2Command({ Bucket, Prefix, ContinuationToken }));
        out.push(...(r.Contents ?? []).map((o) => o.Key!).filter(Boolean));
        ContinuationToken = r.IsTruncated ? r.NextContinuationToken : undefined;
      } while (ContinuationToken);
      return out;
    },
    async del(keys) { await s3.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: keys.map((Key) => ({ Key })) } })); },
    async get(Key) { const r = await s3.send(new GetObjectCommand({ Bucket, Key })); return Buffer.from(await r.Body!.transformToByteArray()); },
  };
}
