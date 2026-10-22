import { dictPutSchema, dictRodzajSchema } from '@etner/shared';
import type { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppDeps } from '../../app.js';
import { requireAdmin, requireUser } from '../../core/auth.js';
import { runOp } from '../../core/ops.js';
import { dictRefs as harmonogram } from '../harmonogram/service.js';
import { dictRefs as leady } from '../leady/service.js';
import { dictRefs as naJutro } from '../na-jutro/service.js';
import { dictRefs as zadania } from '../zadania/service.js';
import { dictRefs as zakupy } from '../zakupy/service.js';
import { dictRefs as zlecenia } from '../zlecenia/service.js';
import { dictRefs as uzytkownicy } from '../uzytkownicy/service.js';
import { listAll, replace, ValueInUseError } from './service.js';

// Moduły, których rekordy przechowują wartości słowników (zmiana nazwy idzie do nich, usunięcie używanej jest blokowane).
const refs = [zlecenia, leady, uzytkownicy, naJutro, harmonogram, zadania, zakupy];
const STATUSY = new Set(['status_zlecenia', 'status_leada', 'status_zadania', 'status_zakupu']);

export function routes(app: Hono, { db }: AppDeps): void {
  app.get('/api/dict', requireUser(db), (c) => c.json(listAll(db)));

  app.put('/api/dict/:rodzaj', requireAdmin(db), async (c) => {
    const rodzaj = dictRodzajSchema.safeParse(c.req.param('rodzaj'));
    const body = dictPutSchema.safeParse(await c.req.json().catch(() => null));
    if (!rodzaj.success) throw new HTTPException(400, { message: 'Nieznany rodzaj słownika' });
    if (!body.success) throw new HTTPException(400, { message: body.error.issues[0]?.message ?? 'Błędne dane' });
    const values = body.data.items.map((i) => i.wartosc);
    if (new Set(values).size !== values.length) throw new HTTPException(400, { message: 'Wartości w słowniku muszą być różne' });
    if (STATUSY.has(rodzaj.data) && !values.length) throw new HTTPException(400, { message: 'Słownik statusów nie może być pusty' });
    // pierwszy = do kupienia, ostatni = kupione
    if (rodzaj.data === 'status_zakupu' && values.length !== 2) throw new HTTPException(400, { message: 'Statusy zakupów: dokładnie dwie wartości (do kupienia, kupione)' });
    const user = c.get('user');
    try {
      return c.json(runOp(db, body.data.opId, user.id, () => replace(db, user.id, rodzaj.data, body.data.items, refs)).result);
    } catch (e) {
      if (e instanceof ValueInUseError) return c.json({ error: 'WARTOSC_W_UZYCIU', value: e.value, count: e.count }, 409);
      throw e;
    }
  });
}
