import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';
import type { Db } from './core/db.js';
import { mountAuth } from './core/auth.js';
import { logError } from './core/errors.js';
import type { FileStore } from './core/files.js';
import type { PumbleClient } from './core/pumble.js';
import type { Mailer } from './core/mail.js';
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
  /** Tryb demo (DEMO=1): konta do wyboru na ekranie logowania; brak = trasa /api/demo/konta nie istnieje. */
  demoAccounts?: () => { name: string; role: string; ekipa: string | null; login: string; haslo: string }[];
  /** Pumble (PUMBLE_API_KEY); brak = kanały zleceń wyłączone. */
  pumble?: PumbleClient;
  /** Wysyłka e-maili (SMTP_*; w testach atrapa); brak = e-maile pomijane. */
  mailer?: Mailer;
  /** Publiczny adres aplikacji do linków w e-mailach (BASE_URL / RENDER_EXTERNAL_URL). */
  baseUrl?: string;
  /** Cookie Secure; domyślnie włączone w produkcji. */
  secureCookie?: boolean;
}

const defaultWebDist = fileURLToPath(new URL('../../web/dist', import.meta.url));

/** Skróty sha256 skryptów wpisanych w index.html (motyw przed pierwszym malowaniem), do script-src. */
export const inlineScriptHashes = (html: string): string[] =>
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => `'sha256-${createHash('sha256').update(m[1]!).digest('base64')}'`);

export function createApp(deps: AppDeps, defs: ModuleDef[] = []): Hono {
  const app = new Hono();
  const webDist = deps.webDist ?? defaultWebDist;
  const hasWeb = existsSync(join(webDist, 'index.html'));
  const index = hasWeb ? readFileSync(join(webDist, 'index.html'), 'utf8') : '';

  // Nagłówki bezpieczeństwa. Zdjęcia z R2 to podpisane adresy https (img-src https:), podglądy przed wysłaniem to blob:,
  // czcionki z Google Fonts (też pobierane przez service worker, stąd connect-src). Style inline: Radix wstawia <style>.
  const fonts = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'];
  app.use(secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'", ...inlineScriptHashes(index)], styleSrc: ["'self'", "'unsafe-inline'", fonts[0]!],
      fontSrc: ["'self'", fonts[1]!], imgSrc: ["'self'", 'https:', 'data:', 'blob:'], connectSrc: ["'self'", ...fonts],
      workerSrc: ["'self'"], manifestSrc: ["'self'"], objectSrc: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"], frameAncestors: ["'none'"],
    },
  }));

  app.onError((err, c) => {
    if (err instanceof HTTPException && err.status < 500) return c.json({ error: err.message }, err.status);
    logError(deps.db, `${c.req.method} ${c.req.path}`, err);
    return c.json({ error: 'Błąd serwera – spróbuj ponownie.' }, 500);
  });

  app.get('/api/health', (c) => c.json({ ok: true, version: deps.version }));

  // Dane JSON najwyżej 1 MB; wysyłka plików (multipart) ma własne limity w trasach.
  const jsonLimit = bodyLimit({ maxSize: 1024 * 1024, onError: (c) => c.json({ error: 'Za dużo danych naraz (max 1 MB).' }, 413) });
  app.use('/api/*', (c, next) => (c.req.header('content-type')?.startsWith('multipart/form-data') ? next() : jsonLimit(c, next)));

  const demo = deps.demoAccounts;
  if (demo) app.get('/api/demo/konta', (c) => c.json(demo()));

  mountAuth(app, deps);
  mountSync(app, deps);
  mountFiles(app, deps);
  mountPush(app, deps);
  registerModules(app, deps, defs);

  if (hasWeb) {
    // serveStatic przyjmuje root względem cwd
    const root = relative(process.cwd(), webDist) || '.';
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
