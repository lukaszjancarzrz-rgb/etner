import { z } from 'zod';
import type { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppDeps } from '../../app.js';
import { requireUser } from '../../core/auth.js';
import { body } from '../../core/body.js';
import { runOp } from '../../core/ops.js';
import { can } from '../../core/permissions.js';
import * as svc from './service.js';

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
}
