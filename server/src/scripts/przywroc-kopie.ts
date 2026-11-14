import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { KOPIA_PREFIX, kluczKopii, magazynR2 } from './kopia-bazy.js';

// Render → Shell:  pnpm --filter @etner/server kopia:przywroc            (lista kopii)
//                  pnpm --filter @etner/server kopia:przywroc 2026-11-14  (kopia z dnia → DATA_DIR/restore.db; potem restart usługi)
const m = magazynR2(process.env);
if (!m) { console.error('Brak R2_BUCKET / R2_ENDPOINT / R2_KEY / R2_SECRET.'); process.exit(1); }
const dzien = process.argv[2];
const keys = (await m.list(KOPIA_PREFIX)).sort();
if (!dzien) {
  console.log(keys.length ? `Dostępne kopie (najnowsza na końcu):\n${keys.map((k) => `  ${k.slice(KOPIA_PREFIX.length)}`).join('\n')}\nPrzywrócenie: pnpm --filter @etner/server kopia:przywroc RRRR-MM-DD` : 'Brak kopii.');
  process.exit(0);
}
const key = kluczKopii(dzien);
if (!keys.includes(key)) { console.error(`Nie ma kopii z dnia ${dzien}.`); process.exit(1); }
const out = join(process.env.DATA_DIR ?? './data', 'restore.db');
writeFileSync(out, gunzipSync(await m.get(key)));
console.log(`Zapisano ${out}. Zrestartuj usługę (Render → Manual Deploy → Restart service): przy starcie obecna baza zostanie odłożona obok, a kopia z ${dzien} zacznie działać.`);
