import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { migrate as migrateDb, openDb } from '../../core/db.js';
import { seedBase } from '../../modules/slowniki/seed.js';
import { readOld } from './read-xlsx.js';
import { reportText, reviewCsv } from './report.js';
import { migrate } from './run.js';

// pnpm --filter @etner/server migrate-old --xlsx Firma_2026.xlsx [--dry-run] [--csv plik.csv]
const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };

try {
  const xlsx = arg('xlsx');
  if (!xlsx) throw new Error('Podaj plik arkusza: --xlsx Firma_2026.xlsx [--dry-run] [--csv do-przejrzenia.csv]');
  const dryRun = process.argv.includes('--dry-run');
  const dataDir = process.env.DATA_DIR ?? './data';
  mkdirSync(dataDir, { recursive: true });
  const db = openDb(join(dataDir, 'etner.db'));
  migrateDb(db);
  seedBase(db);

  const { report, konta } = await migrate(db, await readOld(resolve(xlsx)), { dryRun });
  const csv = resolve(arg('csv') ?? join(dataDir, 'przeniesienie-do-przejrzenia.csv'));
  writeFileSync(csv, reviewCsv(report.doPrzejrzenia), { mode: 0o600 });

  console.log(dryRun ? 'Próba (--dry-run): baza bez zmian.\n' : `Przeniesiono do ${join(dataDir, 'etner.db')}.\n`);
  console.log(reportText(report));
  const bad = report.wiersze.filter((w) => w.roznica !== 0);
  console.log(`\nDo przejrzenia: ${report.doPrzejrzenia.length} pozycji → ${csv}`);
  if (bad.length) console.log(`Uwaga: różnica źródło – baza w: ${bad.map((w) => w.co).join(', ')}.`);
  if (konta.length) {
    console.log(dryRun ? '\nKonta do założenia (login):' : '\nKonta pracowników – hasła startowe pokazane tylko teraz, przekaż je osobiście:');
    for (const k of konta) console.log(`  ${k.nazwa}: ${k.login}${k.haslo ? `  ${k.haslo}` : ''}`);
  }
  if (bad.length) process.exitCode = 2;
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
