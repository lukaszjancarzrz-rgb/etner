import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { testDeps } from '../test-utils.js';
import { diskStore, fileStoreFromEnv, makeVariants } from './files.js';

const tmp = () => mkdtempSync(join(tmpdir(), 'etner-files-'));

describe('makeVariants', () => {
  it('obraca wg EXIF i skaluje podgląd i miniaturę', async () => {
    const jpg = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: '#468' } })
      .jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const v = await makeVariants(jpg);
    expect([v.w, v.h]).toEqual([3000, 4000]);
    expect(v.orig.equals(jpg)).toBe(true);
    const view = await sharp(v.view).metadata();
    const thumb = await sharp(v.thumb).metadata();
    expect([view.format, view.height, view.width]).toEqual(['webp', 1600, 1200]);
    expect([thumb.format, thumb.height, thumb.width]).toEqual(['webp', 320, 240]);
  });

  it('kilka zdjęć naraz idzie po kolei; zły plik nie blokuje kolejki', async () => {
    const jpg = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#468' } }).jpeg().toBuffer();
    const r = await Promise.allSettled([makeVariants(jpg), makeVariants(Buffer.from('to nie zdjęcie')), makeVariants(jpg)]);
    expect(r.map((x) => x.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
  });

  it('PNG z przezroczystością nie wywala się', async () => {
    const png = await sharp({ create: { width: 50, height: 40, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 0.5 } } }).png().toBuffer();
    const v = await makeVariants(png);
    expect([v.w, v.h]).toEqual([50, 40]);
    expect((await sharp(v.view).metadata()).width).toBe(50); // bez powiększania
  });
});

describe('diskStore', () => {
  it('put + url + trasa zwraca te same bajty; zły podpis, wygasły link i zmieniony klucz to 403', async () => {
    const deps = testDeps();
    const app = createApp(deps);
    const body = Buffer.from('abc');
    await deps.files.put('a/b.webp', body, 'image/webp');
    const url = await deps.files.url('a/b.webp');
    const ok = await app.request(url);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('image/webp');
    expect(Buffer.from(await ok.arrayBuffer()).equals(body)).toBe(true);
    const last = url.slice(-1);
    expect((await app.request(url.slice(0, -1) + (last === 'A' ? 'B' : 'A'))).status).toBe(403);
    expect((await app.request(url.replace(/exp=(\d+)/, (_, n) => `exp=${Number(n) + 1000}`))).status).toBe(403);
    expect((await app.request('/api/files/a%ZZ?exp=1&sig=x')).status).toBe(403);
    expect((await app.request(await deps.files.url('nie/ma.webp'))).status).toBe(404);
    expect((await app.request(url.replace('a/b.webp', 'a/c.webp'))).status).toBe(403);
    const expired = await deps.files.url('a/b.webp', -10);
    expect((await app.request(expired)).status).toBe(403);
  });

  it('odrzuca klucze z path traversal', async () => {
    const s = diskStore(tmp(), 'sekret');
    for (const k of ['../x', 'a/../x', '/etc/passwd', 'a\\b', 'a b', 'db/generations/x']) {
      await expect(s.put(k, Buffer.from('x'), 'text/plain')).rejects.toThrow();
      await expect(s.get(k)).rejects.toThrow();
    }
  });
});

describe('fileStoreFromEnv', () => {
  it('bez sekretu rzuca', () => {
    expect(() => fileStoreFromEnv({ DATA_DIR: tmp() })).toThrow();
    expect(() => fileStoreFromEnv({ DATA_DIR: tmp(), APP_SECRET: '' })).toThrow();
    expect(() => diskStore(tmp(), '')).toThrow();
  });

  it('R2 gdy komplet zmiennych, inaczej dysk', () => {
    const r2 = { R2_BUCKET: 'b', R2_ENDPOINT: 'https://x.r2.cloudflarestorage.com', R2_KEY: 'k', R2_SECRET: 's' };
    expect(fileStoreFromEnv({ ...r2, APP_SECRET: 's', DATA_DIR: tmp() }).kind).toBe('r2');
    expect(fileStoreFromEnv({ ...r2, R2_KEY: undefined, APP_SECRET: 's', DATA_DIR: tmp() }).kind).toBe('disk');
  });
});
