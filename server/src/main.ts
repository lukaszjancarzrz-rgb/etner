import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { migrate, openDb } from './core/db.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
const port = Number(process.env.PORT ?? 3000);
const dataDir = process.env.DATA_DIR ?? './data';
mkdirSync(dataDir, { recursive: true });
const db = openDb(join(dataDir, 'etner.db'));
migrate(db);

serve({ fetch: createApp({ version: process.env.APP_VERSION ?? pkg.version, db }).fetch, port }, () => {
  console.log(`ETNER nasłuchuje na :${port}`);
});
