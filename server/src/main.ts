import { readFileSync } from 'node:fs';
import { serve } from '@hono/node-server';
import { createApp } from './app.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
const port = Number(process.env.PORT ?? 3000);

serve({ fetch: createApp({ version: process.env.APP_VERSION ?? pkg.version }).fetch, port }, () => {
  console.log(`ETNER nasłuchuje na :${port}`);
});
