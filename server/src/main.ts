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
import { pumbleClient, type PumbleClient } from './core/pumble.js';
import { fakePumble } from './core/pumble-fake.js';
import { startPoll } from './modules/zlecenia/pumble.js';
import { modules } from './modules/index.js';
import { kopieCrons } from './scripts/kopie.js';
import { seedBase } from './modules/slowniki/seed.js';
import { demoAccounts, seedDemo } from './scripts/seed-demo.js';

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
seedBase(db);
const demo = process.env.DEMO === '1';
if (demo && (await seedDemo(db, files))) console.log('Dane demo załadowane.');

const vapid = vapidFromEnv(process.env, dataDir);
if (!vapid) console.warn('Push wyłączony: brak VAPID_PUBLIC / VAPID_PRIVATE.');
let pumble: PumbleClient | undefined = process.env.PUMBLE_API_KEY ? pumbleClient(process.env.PUMBLE_API_KEY) : undefined;
// Tylko wersja demo (DEMO=1, nie produkcja): atrapa Pumble w pamięci, żeby było widać sekcję na karcie zlecenia.
if (!pumble && demo && process.env.PUMBLE_FAKE === '1' && process.env.NODE_ENV !== 'production') {
  const f = fakePumble([{ id: 'pb-bartek', email: '', name: 'Bartek Gawlik' }]);
  const create = f.client.createChannel;
  f.client.createChannel = async (d) => {
    const ch = await create(d);
    const t = Date.now();
    f.post(ch.id, 'pb-bartek', 'Materiał na miejscu, zaczynamy jutro o 7:00.', new Date(t - 3_600_000));
    f.post(ch.id, 'bot', 'Tomasz Wrona: Dobrze, klient będzie od 8.', new Date(t - 1_800_000)).authorAppId = 'etner';
    return ch;
  };
  pumble = f.client;
  console.log('Pumble: atrapa w pamięci (PUMBLE_FAKE=1).');
}
const deps = {
  version: process.env.APP_VERSION ?? pkg.version, db, files, secret,
  demoAccounts: demo ? () => demoAccounts(db) : undefined,
  pumble,
  push: vapid ? webPushSender(vapid, process.env.VAPID_SUBJECT) : undefined, vapidPublic: vapid?.publicKey,
};
const app = createApp(deps, modules);
const stopPumble = pumble ? startPoll(deps) : () => {};
const stopCron = registerCron(deps, [...modulesOf(app).flatMap((m) => m.cron ?? []), ...kopieCrons(process.env, modules)]);

const server = serve({ fetch: app.fetch, port }, () => {
  console.log(`ETNER nasłuchuje na :${port}`);
  if (demo) for (const a of demoAccounts(db)) console.log(`DEMO ${a.role}${a.ekipa ? ` (${a.ekipa})` : ''} ${a.name}: login ${a.login}, hasło ${a.haslo}`);
});
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { stopCron(); stopPumble(); server.close(); });
