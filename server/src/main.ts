import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { fileStoreFromEnv } from './core/files.js';
import { migrate, openDb } from './core/db.js';
import { registerCron } from './core/cron.js';
import { vapidFromEnv, webPushSender } from './core/notify.js';
import { modulesOf } from './core/registry.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
const port = Number(process.env.PORT ?? 3000);
const dataDir = process.env.DATA_DIR ?? './data';
mkdirSync(dataDir, { recursive: true });
const secretFile = join(dataDir, 'app-secret');
let secret = process.env.APP_SECRET;
if (!secret) {
  if (process.env.NODE_ENV === 'production') {
    console.error('Brak APP_SECRET – ustaw go w środowisku produkcyjnym (podpisy linków do plików).');
    process.exit(1);
  }
  if (!existsSync(secretFile)) writeFileSync(secretFile, randomBytes(32).toString('base64url'), { mode: 0o600 });
  secret = readFileSync(secretFile, 'utf8').trim();
}
const files = fileStoreFromEnv({ ...process.env, DATA_DIR: dataDir, APP_SECRET: secret });
const db = openDb(join(dataDir, 'etner.db'));
migrate(db);

const vapid = vapidFromEnv(process.env, dataDir);
if (!vapid) console.warn('Push wyłączony: brak VAPID_PUBLIC / VAPID_PRIVATE.');
const deps = {
  version: process.env.APP_VERSION ?? pkg.version, db, files, secret,
  push: vapid ? webPushSender(vapid, process.env.VAPID_SUBJECT) : undefined, vapidPublic: vapid?.publicKey,
};
const app = createApp(deps);
const stopCron = registerCron(deps, modulesOf(app).flatMap((m) => m.cron ?? []));

const server = serve({ fetch: app.fetch, port }, () => {
  console.log(`ETNER nasłuchuje na :${port}`);
});
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { stopCron(); server.close(); });
