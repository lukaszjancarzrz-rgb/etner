import { folderCreateSchema, folderUpdateSchema } from '@etner/shared';
import type { Context, Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppDeps } from '../../app.js';
import { requireAdmin, requireUser } from '../../core/auth.js';
import { body } from '../../core/body.js';
import { runOp } from '../../core/ops.js';
import { can } from '../../core/permissions.js';
import * as klienci from '../klienci/service.js';
import * as svc from './service.js';

const notFound = () => new HTTPException(404, { message: 'Nie znaleziono' });
const forbidden = () => new HTTPException(403, { message: 'BRAK_UPRAWNIEN' });

export function routes(app: Hono, deps: AppDeps): void {
  const { db } = deps;
  const auth = requireUser(db);
  const admin = requireAdmin(db);
  const me = (c: Context) => c.get('user');
  const isAdmin = (c: Context) => can(me(c), 'admin');
  const folderOut = (c: Context, f: svc.FolderRow) => (isAdmin(c) ? f : svc.folderForWorker(f));

  app.get('/api/sites/:id/teczki', auth, (c) => {
    if (!klienci.getSite(db, c.req.param('id'))) throw notFound();
    return c.json(svc.teczki(db, c.req.param('id'), isAdmin(c)));
  });

  // ręczne „Dodaj teczkę” (P2); istniejąca teczka wraca bez zmian
  app.post('/api/folders', admin, async (c) => {
    const { opId, siteId, kategoria } = await body(c, folderCreateSchema);
    return c.json(runOp(db, opId, me(c).id, () => svc.ensureFolder(db, me(c).id, siteId, kategoria)).result);
  });
  app.put('/api/folders/:id', auth, async (c) => {
    const { opId, ...d } = await body(c, folderUpdateSchema);
    if (d.notatkaRozliczenie !== undefined && !isAdmin(c)) throw forbidden();
    const { result } = runOp(db, opId, me(c).id, () => {
      const r = svc.updateFolder(db, me(c).id, c.req.param('id'), d);
      if (!r) throw notFound();
      return r;
    });
    return c.json(folderOut(c, result));
  });
}
