import { checklistCreateSchema, checklistTemplateSchema, checklistTemplateUpdateSchema, checklistToggleSchema, checklistUpdateSchema } from '@etner/shared';
import type { Context, Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppDeps } from '../../app.js';
import { requireAdmin, requireUser } from '../../core/auth.js';
import { body } from '../../core/body.js';
import { logError } from '../../core/errors.js';
import { notify } from '../../core/notify.js';
import { runOp } from '../../core/ops.js';
import { can } from '../../core/permissions.js';
import * as users from '../uzytkownicy/service.js';
import * as svc from './service.js';

const forbidden = () => new HTTPException(403, { message: 'BRAK_UPRAWNIEN' });

export function routes(app: Hono, deps: AppDeps): void {
  const { db } = deps;
  const auth = requireUser(db);
  const me = (c: Context) => c.get('user');
  /** Ekipa z listy użytkownika albo admin (R20). */
  const inCrew = (c: Context, ekipa: string) => can(me(c), 'admin') || (!!me(c).ekipa && me(c).ekipa === ekipa);
  /** Wiersz widoczny dla użytkownika; cudzy = 404, żeby nie zdradzać istnienia. */
  const visible = (c: Context, id: string) => {
    const r = svc.get(db, id);
    if (!r || !inCrew(c, r.ekipa)) throw new HTTPException(404, { message: 'Nie znaleziono' });
    return r;
  };

  app.get('/api/checklists', auth, (c) =>
    c.json(can(me(c), 'admin') ? svc.list(db) : me(c).ekipa ? svc.list(db, me(c).ekipa!) : []));

  app.post('/api/checklists', auth, async (c) => {
    const { opId, ...d } = await body(c, checklistCreateSchema);
    if (!inCrew(c, d.ekipa)) throw forbidden();
    const { result, dup } = runOp(db, opId, me(c).id, () => svc.create(db, me(c).id, d));
    if (!dup) {
      await notify(deps, users.crewMembers(db, d.ekipa).filter((id) => id !== me(c).id),
        { title: `📦 ${d.ekipa} – ${d.dzien}: do zabrania`, body: d.tekst, url: `#jutro~${result.id}`, tag: `jutro-${result.id}` })
        .catch((e) => logError(db, 'push', e, me(c).id));
    }
    return c.json(result);
  });

  app.put('/api/checklists/:id', auth, async (c) => {
    const { opId, ...d } = await body(c, checklistUpdateSchema);
    visible(c, c.req.param('id'));
    if (!can(me(c), 'admin')) throw forbidden();
    return c.json(runOp(db, opId, me(c).id, () => svc.update(db, me(c).id, c.req.param('id'), d)).result);
  });

  app.post('/api/checklists/:id/zabrane', auth, async (c) => {
    const b = await body(c, checklistToggleSchema);
    visible(c, c.req.param('id'));
    return c.json(runOp(db, b.opId, me(c).id, () => svc.setZabrane(db, me(c).id, c.req.param('id'), b.zabrane)).result);
  });

  app.delete('/api/checklists/:id', auth, (c) => {
    const gone = svc.removed(db, c.req.param('id'));
    if (gone && inCrew(c, gone.ekipa)) return c.json({ ok: true }); // już usunięta: powtórka z kolejki
    const r = visible(c, c.req.param('id'));
    if (r.createdBy !== me(c).id && !can(me(c), 'admin')) throw forbidden();
    svc.remove(db, me(c).id, r.id);
    return c.json({ ok: true });
  });

  // Listy predefiniowane (18j): czyta każdy, zmienia admin.
  const admin = requireAdmin(db);
  const nf = <T,>(r: T | undefined): T => { if (!r) throw new HTTPException(404, { message: 'Nie znaleziono' }); return r; };
  app.get('/api/checklist-templates', auth, (c) => c.json(svc.listTemplates(db)));
  app.post('/api/checklist-templates', admin, async (c) => {
    const { opId, ...d } = await body(c, checklistTemplateSchema);
    return c.json(runOp(db, opId, me(c).id, () => svc.createTemplate(db, me(c).id, d)).result);
  });
  app.put('/api/checklist-templates/:id', admin, async (c) => {
    const { opId, ...d } = await body(c, checklistTemplateUpdateSchema);
    return c.json(nf(runOp(db, opId, me(c).id, () => svc.updateTemplate(db, me(c).id, c.req.param('id'), d)).result));
  });
  app.delete('/api/checklist-templates/:id', admin, (c) => {
    if (svc.removedTemplate(db, c.req.param('id'))) return c.json({ ok: true }); // powtórka
    nf(svc.updateTemplate(db, me(c).id, c.req.param('id'), {}, true));
    return c.json({ ok: true });
  });
}
