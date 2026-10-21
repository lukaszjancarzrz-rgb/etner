import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Db } from './core/db.js';
import { mountAuth } from './core/auth.js';
import { logError } from './core/errors.js';
import type { FileStore } from './core/files.js';
import { mountFiles } from './core/files-route.js';
import { mountPush, type PushSender } from './core/notify.js';
import { registerModules, type ModuleDef } from './core/registry.js';
import { mountSync } from './core/sync.js';

/** Dziennik (zadanie 12); brak = wpisy systemowe pomijane. Musi być bezpieczny w transakcji. */
export interface Diary { addSystem(owner: { type: 'job' | 'lead'; id: string }, tekst: string): void }

export interface AppDeps {
  /** Zegar; domyślnie `new Date()` (testy podstawiają stały). */
  now?: () => Date;
  diary?: Diary;
  /** Harmonogram (zadanie 14): osoby przypisane do zlecenia (id użytkowników); brak = nikt. */
  schedule?: { peopleForJob?(jobId: string): string[] };
  version: string;
  db: Db;
  files: FileStore;
  /** APP_SECRET – podpisy linków do plików. */
  secret: string;
  /** Wysyłka web-push (w testach atrapa); brak = push wyłączony. */
  push?: PushSender;
  /** Publiczny klucz VAPID; brak = push wyłączony. */
  vapidPublic?: string;
  /** Katalog zbudowanego frontendu; domyślnie web/dist (sprawdzany względem pakietu serwera). */
  webDist?: string;
  /** Czy klient ma nieusunięte zlecenie (dostarcza moduł zleceń); brak = nikt, więc pracownik nie widzi klientów. */
  clientHasJobs?: (clientId: string) => boolean;
  /** Tryb demo (DEMO=1): lista linków logowania dla podanego adresu; brak = trasa /api/demo/links nie istnieje. */
  demoLinks?: (origin: string) => { name: string; role: string; ekipa: string | null; link: string }[];
  /** Cookie Secure; domyślnie włączone w produkcji. */
  secureCookie?: boolean;
}

const defaultWebDist = fileURLToPath(new URL('../../web/dist', import.meta.url));

export function createApp(deps: AppDeps, defs: ModuleDef[] = []): Hono {
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof HTTPException && err.status < 500) return c.json({ error: err.message }, err.status);
    logError(deps.db, `${c.req.method} ${c.req.path}`, err);
    return c.json({ error: 'Błąd serwera – spróbuj ponownie.' }, 500);
  });

  app.get('/api/health', (c) => c.json({ ok: true, version: deps.version }));

  const demo = deps.demoLinks;
  if (demo) app.get('/api/demo/links', (c) => c.json(demo(new URL(c.req.url).origin)));

  mountAuth(app, deps);
  mountSync(app, deps);
  mountFiles(app, deps);
  mountPush(app, deps);
  registerModules(app, deps, defs);

  const webDist = deps.webDist ?? defaultWebDist;
  const hasWeb = existsSync(join(webDist, 'index.html'));
  if (hasWeb) {
    // serveStatic przyjmuje root względem cwd
    const root = relative(process.cwd(), webDist) || '.';
    const index = readFileSync(join(webDist, 'index.html'), 'utf8');
    const files = serveStatic({ root });
    app.use('/*', (c, next) => (c.req.path.startsWith('/api/') ? next() : files(c, next)));
    // Fallback SPA tylko dla GET/HEAD poza /api i bez rozszerzenia (brakujący plik to 404)
    app.notFound((c) =>
      c.req.path.startsWith('/api/') || !['GET', 'HEAD'].includes(c.req.method) || /\.[^/]+$/.test(c.req.path)
        ? c.json({ error: 'Nie znaleziono' }, 404)
        : c.html(index),
    );
  } else {
    app.notFound((c) => c.json({ error: 'Nie znaleziono' }, 404));
  }

  return app;
}
