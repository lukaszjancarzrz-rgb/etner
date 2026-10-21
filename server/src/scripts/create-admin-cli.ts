import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { migrate, openDb } from '../core/db.js';
import { createAdmin } from './create-admin.js';

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };

async function readPassword(): Promise<string> {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  if (!process.stdin.isTTY) throw new Error('Ustaw ADMIN_PASSWORD albo uruchom w terminalu.');
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = () => {}; // bez echa
  process.stdout.write('Hasło (min. 8 znaków): ');
  return new Promise((res) => rl.question('', (a) => { rl.close(); process.stdout.write('\n'); res(a); }));
}

try {
  const dataDir = process.env.DATA_DIR ?? './data';
  const db = openDb(join(dataDir, 'etner.db'));
  migrate(db);
  const u = await createAdmin(db, { login: arg('login') ?? '', name: arg('name') ?? '', haslo: await readPassword() });
  console.log(`Utworzono administratora „${u.login}” (${u.name}).`);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
