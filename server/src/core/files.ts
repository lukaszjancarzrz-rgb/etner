import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import sharp from 'sharp';

export interface FileStore {
  readonly kind: 'r2' | 'disk';
  put(key: string, body: Buffer, type: string): Promise<void>;
  url(key: string, ttlSec?: number): Promise<string>;
  get(key: string): Promise<Buffer>;
}
/** Magazyn dyskowy sam obsługuje podpisane linki (`GET /api/files/*`). */
export interface DiskStore extends FileStore {
  readonly kind: 'disk';
  /** null = zły/wygasły podpis. */
  serve(key: string, exp: string | undefined, sig: string | undefined): Promise<{ body: Buffer; type: string } | null>;
}

const KEY_RE = /^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)*$/;
function checkKey(key: string): string {
  if (!KEY_RE.test(key) || key.split('/').some((p) => p === '.' || p === '..')) throw new Error(`Niepoprawny klucz pliku: ${key}`);
  return key;
}

const TYPES: Record<string, string> = { webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', pdf: 'application/pdf' };
const typeOf = (key: string) => TYPES[key.split('.').pop()!.toLowerCase()] ?? 'application/octet-stream';

export function diskStore(dir: string, secret: string): DiskStore {
  const sign = (key: string, exp: number) => createHmac('sha256', secret).update(`${key}\n${exp}`).digest('base64url');
  const path = (key: string) => join(dir, checkKey(key));
  return {
    kind: 'disk',
    async put(key, body) {
      const p = path(key);
      await mkdir(dirname(p), { recursive: true });
      await writeFile(p, body);
    },
    async get(key) {
      return readFile(path(key));
    },
    async url(key, ttlSec = 600) {
      const exp = Math.floor(Date.now() / 1000) + ttlSec;
      return `/api/files/${checkKey(key)}?exp=${exp}&sig=${sign(key, exp)}`;
    },
    async serve(key, exp, sig) {
      if (!exp || !sig || !KEY_RE.test(key) || !/^\d+$/.test(exp) || Number(exp) < Date.now() / 1000) return null;
      const want = Buffer.from(sign(key, Number(exp)));
      const got = Buffer.from(sig);
      if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
      return { body: await readFile(path(key)), type: typeOf(key) };
    },
  };
}

export interface R2Config { bucket: string; endpoint: string; key: string; secret: string }

export function r2Store(cfg: R2Config): FileStore {
  const s3 = new S3Client({
    region: 'auto', endpoint: cfg.endpoint, forcePathStyle: true,
    credentials: { accessKeyId: cfg.key, secretAccessKey: cfg.secret },
  });
  return {
    kind: 'r2',
    async put(key, body, type) {
      await s3.send(new PutObjectCommand({ Bucket: cfg.bucket, Key: checkKey(key), Body: body, ContentType: type }));
    },
    url: (key, ttlSec = 600) => getSignedUrl(s3, new GetObjectCommand({ Bucket: cfg.bucket, Key: checkKey(key) }), { expiresIn: ttlSec }),
    async get(key) {
      const r = await s3.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: checkKey(key) }));
      return Buffer.from(await r.Body!.transformToByteArray());
    },
  };
}

export function fileStoreFromEnv(env: Record<string, string | undefined>): FileStore {
  const { R2_BUCKET: bucket, R2_ENDPOINT: endpoint, R2_KEY: key, R2_SECRET: secret } = env;
  if (bucket && endpoint && key && secret) return r2Store({ bucket, endpoint, key, secret });
  return diskStore(join(env.DATA_DIR ?? './data', 'files'), env.APP_SECRET ?? '');
}

export async function makeVariants(input: Buffer): Promise<{ orig: Buffer; view: Buffer; thumb: Buffer; w: number; h: number }> {
  const base = () => sharp(input).rotate(); // EXIF
  const resize = (px: number, quality: number) =>
    base().resize(px, px, { fit: 'inside', withoutEnlargement: true }).webp({ quality }).toBuffer();
  const { info } = await base().toBuffer({ resolveWithObject: true });
  const [view, thumb] = await Promise.all([resize(1600, 80), resize(320, 70)]);
  return { orig: input, view, thumb, w: info.width, h: info.height };
}
