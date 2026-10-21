import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';

export interface AppDeps {
  version: string;
  /** Katalog zbudowanego frontendu; domyślnie web/dist (sprawdzany względem pakietu serwera). */
  webDist?: string;
}

const defaultWebDist = fileURLToPath(new URL('../../web/dist', import.meta.url));

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();

  app.get('/api/health', (c) => c.json({ ok: true, version: deps.version }));

  const webDist = deps.webDist ?? defaultWebDist;
  const hasWeb = existsSync(join(webDist, 'index.html'));
  if (hasWeb) {
    // serveStatic przyjmuje root względem cwd
    const root = relative(process.cwd(), webDist) || '.';
    const index = readFileSync(join(webDist, 'index.html'), 'utf8');
    app.use('/*', async (c, next) => (c.req.path.startsWith('/api/') ? next() : serveStatic({ root })(c, next)));
    // Fallback SPA tylko dla GET/HEAD poza /api
    app.notFound((c) =>
      c.req.path.startsWith('/api/') || !['GET', 'HEAD'].includes(c.req.method)
        ? c.json({ error: 'Nie znaleziono' }, 404)
        : c.html(index),
    );
  } else {
    app.notFound((c) => c.json({ error: 'Nie znaleziono' }, 404));
  }

  return app;
}
