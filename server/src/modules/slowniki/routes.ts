import { dictPutSchema, dictRodzajSchema } from '@etner/shared';
import type { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppDeps } from '../../app.js';
import { requireAdmin, requireUser } from '../../core/auth.js';
import { runOp } from '../../core/ops.js';
import { listAll, replace } from './service.js';

export function routes(app: Hono, { db }: AppDeps): void {
  app.get('/api/dict', requireUser(db), (c) => c.json(listAll(db)));

  app.put('/api/dict/:rodzaj', requireAdmin(db), async (c) => {
    const rodzaj = dictRodzajSchema.safeParse(c.req.param('rodzaj'));
    const body = dictPutSchema.safeParse(await c.req.json().catch(() => null));
    if (!rodzaj.success) throw new HTTPException(400, { message: 'Nieznany rodzaj słownika' });
    if (!body.success) throw new HTTPException(400, { message: body.error.issues[0]?.message ?? 'Błędne dane' });
    const values = body.data.items.map((i) => i.wartosc);
    if (new Set(values).size !== values.length) throw new HTTPException(400, { message: 'Wartości w słowniku muszą być różne' });
    const user = c.get('user');
    return c.json(runOp(db, body.data.opId, user.id, () => replace(db, user.id, rodzaj.data, body.data.items)).result);
  });
}
