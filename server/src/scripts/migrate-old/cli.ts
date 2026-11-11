import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { migrate as migrateDb, openDb } from '../../core/db.js';
import { seedBase } from '../../modules/slowniki/seed.js';
import { readOld } from './read-xlsx.js';
import { reportText, reviewCsv } from './report.js';
import { migrate } from './run.js';

// pnpm --filter @etner/server migrate-old --xlsx Firma_2026.xlsx [--dry-run] [--csv plik.csv]
const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };

let tmp: string | undefined;
try {
  const xlsx = arg('xlsx');
  if (!xlsx) throw new Error('Podaj plik arkusza: --xlsx Firma_2026.xlsx [--dry-run] [--csv do-przejrzenia.csv]');
  const dryRun = process.argv.includes('--dry-run');
  const dataDir = process.env.DATA_DIR ?? './data';
  const dbPath = join(dataDir, 'etner.db');
  const old = await readOld(resolve(xlsx));

  // Próba nie dotyka DATA_DIR: kopia istniejącej bazy w katalogu tymczasowym albo pusta baza w pamięci.
  let file = dbPath;
  if (dryRun) {
    file = ':memory:';
    if (existsSync(dbPath)) {
      tmp = mkdtempSync(join(tmpdir(), 'etner-proba-'));
      file = join(tmp, 'etner.db');
      const src = new Database(dbPath, { readonly: true, fileMustExist: true });
      await src.backup(file);
      src.close();
    }
  } else mkdirSync(dataDir, { recursive: true });
  const db = openDb(file);
  migrateDb(db);
  seedBase(db);

  const { report, konta } = await migrate(db, old, { dryRun });
  const csv = arg('csv');
  if (csv) writeFileSync(resolve(csv), reviewCsv(report.doPrzejrzenia), { mode: 0o600 });

  console.log(dryRun ? `Próba (--dry-run) na ${file === ':memory:' ? 'pustej bazie w pamięci' : 'kopii bazy'}: ${dbPath} bez zmian.\n` : `Przeniesiono do ${dbPath}.\n`);
  console.log(reportText(report));
  const bad = report.wiersze.filter((w) => w.roznica !== null && w.roznica !== 0);
  console.log(`\nDo przejrzenia: ${report.doPrzejrzenia.length} pozycji${dryRun ? '' : ' (Ustawienia → Do przejrzenia po przeniesieniu)'}${csv ? ` → ${resolve(csv)}` : ''}`);
  if (bad.length) console.log(`Uwaga: różnica źródło – baza w: ${bad.map((w) => w.co).join(', ')}.`);
  if (konta.length) {
    console.log(dryRun ? '\nKonta do założenia (login):' : '\nKonta pracowników – hasła startowe pokazane tylko teraz, przekaż je osobiście:');
    for (const k of konta) console.log(`  ${k.nazwa}: ${k.login}${k.haslo ? `  ${k.haslo}` : ''}`);
  }
  if (bad.length) process.exitCode = 2;
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
}
