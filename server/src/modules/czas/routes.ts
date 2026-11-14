import { timeEntryCreateSchema, timeEntryUpdateSchema, timeStartSchema, timeStopSchema, wOknieEdycji, dayOf } from '@etner/shared';
import type { Context, Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppDeps } from '../../app.js';
import { requireUser } from '../../core/auth.js';
import { body } from '../../core/body.js';
import { runOp } from '../../core/ops.js';
import { can } from '../../core/permissions.js';
import * as users from '../uzytkownicy/service.js';
import * as svc from './service.js';

const forbidden = (message = 'BRAK_UPRAWNIEN') => new HTTPException(403, { message });
const notFound = () => new HTTPException(404, { message: 'Nie znaleziono' });
const OKNO = 'Możesz poprawiać tylko wpisy z tego i poprzedniego tygodnia – starsze poprawia biuro.';

export function routes(app: Hono, deps: AppDeps): void {
  const { db } = deps;
  const auth = requireUser(db);
  const me = (c: Context) => c.get('user');
  const now = () => (deps.now ?? (() => new Date()))();
  /** Pracownik: tylko własne wpisy i tylko w oknie edycji (C4); admin bez ograniczeń. */
  const mayEdit = (c: Context, r: svc.TimeRow, ...dni: string[]) => {
    if (can(me(c), 'admin')) return;
    if (r.userId !== me(c).id) throw forbidden();
    if (![r.dzien, ...dni].every((d) => wOknieEdycji(d, dayOf(now())))) throw forbidden(OKNO);
  };

  app.post('/api/time/start', auth, async (c) => {
    const { opId, at, jobId } = await body(c, timeStartSchema);
    const { result } = runOp(db, opId, me(c).id, () => svc.start(db, me(c).id, jobId, svc.clampAt(at, now())));
    return c.json(result);
  });

  app.post('/api/time/stop', auth, async (c) => {
    const { opId, ...d } = await body(c, timeStopSchema);
    const { result } = runOp(db, opId, me(c).id, () => {
      const at = svc.clampAt(d.at, now());
      if (!can(me(c), 'admin') && [d.od, d.do].some((x) => x && !wOknieEdycji(dayOf(x), dayOf(now())))) throw forbidden(OKNO);
      return svc.stop(db, me(c).id, { ...d, at }, now());
    });
    return c.json(result ?? { ok: true });
  });

  app.post('/api/time-entries', auth, async (c) => {
    const { opId, personId, ...d } = await body(c, timeEntryCreateSchema);
    const admin = can(me(c), 'admin');
    if (personId && !admin) throw forbidden();
    const person = personId ? users.listPeople(db).find((p) => p.id === personId) : undefined;
    if (personId && !person) throw notFound();
    const { result } = runOp(db, opId, me(c).id, () => {
      if (!admin && !wOknieEdycji(dayOf(d.od), dayOf(now()))) throw forbidden(OKNO); // w runOp: powtórka z kolejki po zmianie tygodnia dostaje zapisany wynik
      return svc.create(db, me(c).id, d, now(), person && { id: person.id, userId: person.userId ?? null });
    });
    return c.json(result);
  });

  app.put('/api/time-entries/:id', auth, async (c) => {
    const { opId, ...d } = await body(c, timeEntryUpdateSchema);
    const old = svc.get(db, c.req.param('id'));
    if (!old) throw notFound();
    mayEdit(c, old, ...(d.od ? [dayOf(d.od)] : []));
    const { result } = runOp(db, opId, me(c).id, () => svc.update(db, me(c).id, old, d, now()));
    return c.json(result);
  });

  app.delete('/api/time-entries/:id', auth, (c) => {
    const r = svc.get(db, c.req.param('id'));
    if (!r && svc.removed(db, c.req.param('id'))) return c.json({ ok: true });
    if (!r) throw notFound();
    mayEdit(c, r);
    if (!can(me(c), 'admin') && r.zrodlo !== 'reczny') throw forbidden('Wpisu z czasomierza nie usuniesz – popraw godziny.');
    if (!can(me(c), 'admin') && r.createdBy !== me(c).id) throw forbidden('Ten wpis dodało biuro – usunąć może tylko biuro.');
    svc.remove(db, me(c).id, r);
    return c.json({ ok: true });
  });
}
