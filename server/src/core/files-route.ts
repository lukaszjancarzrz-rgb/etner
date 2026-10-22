import type { Hono } from 'hono';
import type { AppDeps } from '../app.js';
import type { DiskStore } from './files.js';

/** Link podpisany jest „bearer” – bez sesji; krótki TTL. Tylko dla magazynu dyskowego. */
export function mountFiles(app: Hono, deps: AppDeps): void {
  if (deps.files.kind !== 'disk') return;
  const store = deps.files as DiskStore;
  app.get('/api/files/*', async (c) => {
    const bad = () => c.json({ error: 'Link do pliku jest nieprawidłowy lub wygasł.' }, 403);
    let key: string;
    try {
      key = decodeURIComponent(c.req.path.slice('/api/files/'.length));
    } catch {
      return bad();
    }
    const exp = c.req.query('exp');
    let f;
    try {
      f = await store.serve(key, exp, c.req.query('sig'));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return c.json({ error: 'Nie znaleziono pliku.' }, 404);
      throw e;
    }
    if (!f) return bad();
    const ttl = Math.max(0, Number(exp) - Math.floor(Date.now() / 1000));
    return c.body(new Uint8Array(f.body), 200, { 'content-type': f.type, 'cache-control': `private, max-age=${ttl}` });
  });
}
