import { z } from 'zod';
import type { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import type { AppDeps } from '../../app.js';
import { requireAdmin, requireUser } from '../../core/auth.js';
import { body } from '../../core/body.js';
import { runOp } from '../../core/ops.js';
import { can } from '../../core/permissions.js';
import { NotEmptyError } from '../../scripts/migrate-old/apply.js';
import type { OldData } from '../../scripts/migrate-old/old-data.js';
import { readOld } from '../../scripts/migrate-old/read-xlsx.js';
import { migrate } from '../../scripts/migrate-old/run.js';
import * as svc from './service.js';

const XLSX_MAX = 10 * 1024 * 1024;

const putSchema = z.object({ opId: z.string().min(1).optional(), przejrzane: z.boolean() });

export function routes(app: Hono, deps: AppDeps): void {
  const { db } = deps;
  const auth = requireUser(db);
  const admin = (u: Parameters<typeof can>[0]) => { if (!can(u, 'admin')) throw new HTTPException(403, { message: 'BRAK_UPRAWNIEN' }); };

  app.get('/api/migration-review', auth, (c) => { admin(c.get('user')); return c.json(svc.list(db)); });

  app.put('/api/migration-review/:id', auth, async (c) => {
    admin(c.get('user'));
    const { opId, przejrzane } = await body(c, putSchema);
    const { result } = runOp(db, opId, c.get('user').id, () => svc.setPrzejrzane(db, c.get('user').id, c.req.param('id'), przejrzane));
    if (!result) throw new HTTPException(404, { message: 'Nie znaleziono' });
    return c.json(result);
  });

  /**
   * Przeniesienie ze starego arkusza bez terminala (R53): `?naprawde=1` zapisuje, bez niego próba (zapis wycofany w transakcji).
   * Plik tylko w pamięci na czas żądania (nie trafia na dysk, do R2 ani do logu); hasła startowe tylko w odpowiedzi prawdziwego zapisu.
   */
  const limit = bodyLimit({ maxSize: XLSX_MAX + 64 * 1024, onError: (c) => c.json({ error: 'Plik jest za duży (max 10 MB).' }, 413) });
  app.post('/api/migration-import', requireAdmin(db), limit, async (c) => {
    const f = ((await c.req.parseBody().catch(() => ({}))) as Record<string, unknown>)['file'];
    if (!(f instanceof File)) throw new HTTPException(400, { message: 'Brak pliku' });
    if (f.size > XLSX_MAX) throw new HTTPException(413, { message: 'Plik jest za duży (max 10 MB).' });
    const buf = Buffer.from(await f.arrayBuffer());
    if (!buf.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) throw new HTTPException(415, { message: 'To nie jest plik .xlsx.' });
    let old: OldData;
    try { old = await readOld(buf); } catch (e) {
      const m = e instanceof Error && e.message.startsWith('Brak karty') ? `${e.message}.` : 'Nie udało się odczytać arkusza.';
      throw new HTTPException(422, { message: `${m} Wgraj plik starego arkusza firmy (.xlsx).` });
    }
    const naprawde = c.req.query('naprawde') === '1';
    try {
      const { report, konta } = await migrate(db, old, { dryRun: !naprawde });
      c.header('cache-control', 'no-store');
      return c.json({ naprawde, wiersze: report.wiersze, doPrzejrzenia: report.doPrzejrzenia.length, konta });
    } catch (e) {
      // komunikat bez logu: może zawierać wartości z arkusza
      if (e instanceof NotEmptyError) throw new HTTPException(409, { message: e.message });
      throw new HTTPException(422, { message: e instanceof Error ? e.message : 'Nie udało się przenieść danych.' });
    }
  });
}
