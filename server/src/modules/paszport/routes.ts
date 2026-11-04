import { firmaSchema, passportCreateSchema, deviceCreateSchema, deviceUpdateSchema, folderCreateSchema, folderFileSchema, folderUpdateSchema, serviceEntryCreateSchema, serviceEntryUpdateSchema } from '@etner/shared';
import type { Context, Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppDeps } from '../../app.js';
import { requireAdmin, requireUser } from '../../core/auth.js';
import { body } from '../../core/body.js';
import { runOp } from '../../core/ops.js';
import { can } from '../../core/permissions.js';
import * as dziennik from '../dziennik/service.js';
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

  // Paszport (P3): zakłada pracownik i admin, od razu z linkiem; nowy link (unieważnia stary) tylko admin.
  app.post('/api/passports', auth, async (c) => {
    const { opId, siteId } = await body(c, passportCreateSchema);
    return c.json(runOp(db, opId, me(c).id, () => svc.createPassport(db, me(c).id, siteId, deps.now?.() ?? new Date())).result);
  });
  app.post('/api/passports/:id/link', admin, (c) => {
    const p = svc.newLink(db, me(c).id, c.req.param('id'));
    if (!p) throw notFound();
    return c.json({ url: `${(deps.baseUrl ?? '').replace(/\/$/, '')}/p/${p.token}` });
  });
  app.get('/api/settings/firma', auth, (c) => c.json(svc.firma(db)));
  app.put('/api/settings/firma', admin, async (c) => c.json(svc.setFirma(db, await body(c, firmaSchema))));

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
    const { result } = runOp(db, opId, me(c).id, () => {
      const r = svc.updateFolder(db, me(c).id, c.req.param('id'), d);
      if (!r) throw notFound();
      return r;
    });
    return c.json(folderOut(c, result));
  });

  // Urządzenia i wpisy serwisowe: dodaje każdy (teczka powstaje przy pierwszym zapisie), edytuje i usuwa admin albo autor (P10).
  // Odczyt w op: powtórka z kolejki po usunięciu dostaje zapisany wynik, nie 404.
  const editable = <T extends { createdBy: string | null }>(c: Context, row: T | undefined, author: (r: T) => string | null): T => {
    if (!row) throw notFound();
    if (!svc.canEdit(me(c), author(row))) throw forbidden();
    return row;
  };
  const removeRoute = <T extends { createdBy: string | null; deletedAt: string | null }>(path: string, find: (id: string) => T | undefined, author: (r: T) => string | null, remove: (by: string, r: T) => void) =>
    app.delete(path, auth, (c) => {
      const row = editable(c, find(c.req.param('id')!), author);
      if (!row.deletedAt) remove(me(c).id, row); // już usunięty: powtórka z kolejki
      return c.json({ ok: true });
    });

  app.post('/api/devices', auth, async (c) => {
    const { opId, ...d } = await body(c, deviceCreateSchema);
    return c.json(runOp(db, opId, me(c).id, () => svc.createDevice(db, me(c).id, d)).result);
  });
  app.put('/api/devices/:id', auth, async (c) => {
    const { opId, ...d } = await body(c, deviceUpdateSchema);
    return c.json(runOp(db, opId, me(c).id, () => svc.updateDevice(db, me(c).id, editable(c, svc.getDevice(db, c.req.param('id')), (r) => r.createdBy), d)).result);
  });
  removeRoute('/api/devices/:id', (id) => svc.anyDevice(db, id), (r) => r.createdBy, (by, r) => svc.removeDevice(db, by, r));

  app.post('/api/service-entries', auth, async (c) => {
    const { opId, ...d } = await body(c, serviceEntryCreateSchema);
    return c.json(runOp(db, opId, me(c).id, () => svc.createEntry(db, me(c).id, d)).result);
  });
  app.put('/api/service-entries/:id', auth, async (c) => {
    const { opId, ...d } = await body(c, serviceEntryUpdateSchema);
    return c.json(runOp(db, opId, me(c).id, () => svc.updateEntry(db, me(c).id, editable(c, svc.getEntry(db, c.req.param('id')), (r) => r.authorId), d)).result);
  });
  removeRoute('/api/service-entries/:id', (id) => svc.anyEntry(db, id), (r) => r.authorId, (by, r) => svc.removeEntry(db, by, r));

  app.post('/api/folder-files', auth, async (c) => {
    const { opId, ...d } = await body(c, folderFileSchema);
    if (d.typDok === 'faktura' && !isAdmin(c)) throw forbidden(); // faktury tylko admin (P6)
    return c.json(runOp(db, opId, me(c).id, () => svc.addFolderFile(db, me(c).id, d)).result);
  });
  // usunięcie pliku teczki: admin albo autor; już usunięty = 200 (powtórka z kolejki)
  app.delete('/api/folder-files/:id', auth, (c) => {
    const a = dziennik.anyAttachment(db, c.req.param('id'));
    if (a?.ownerType !== 'teczka' || !a.ownerId || (a.typDok === 'faktura' && !isAdmin(c))) throw notFound();
    if (!svc.canEdit(me(c), a.authorId)) throw forbidden();
    if (!a.deletedAt) dziennik.removeAttachmentsOf(db, me(c).id, 'teczka', a.ownerId, [a.id]);
    return c.json({ ok: true });
  });
}
