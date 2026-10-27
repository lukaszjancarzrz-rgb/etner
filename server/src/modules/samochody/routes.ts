import { carCreateSchema, carUpdateSchema, faultCreateSchema, faultRepairSchema } from '@etner/shared';
import type { Context, Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppDeps } from '../../app.js';
import { requireAdmin, requireUser } from '../../core/auth.js';
import { body } from '../../core/body.js';
import { logError } from '../../core/errors.js';
import { notify } from '../../core/notify.js';
import { runOp } from '../../core/ops.js';
import * as users from '../uzytkownicy/service.js';
import * as svc from './service.js';

const notFound = () => new HTTPException(404, { message: 'Nie znaleziono' });
const fmtDay = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;

export function routes(app: Hono, deps: AppDeps): void {
  const { db } = deps;
  const auth = requireUser(db);
  const admin = requireAdmin(db);
  const me = (c: Context) => c.get('user');

  app.get('/api/cars', auth, (c) => c.json(svc.listCars(db)));
  app.post('/api/cars', admin, async (c) => {
    const { opId, ...d } = await body(c, carCreateSchema);
    return c.json(runOp(db, opId, me(c).id, () => svc.createCar(db, me(c).id, d)).result);
  });
  app.put('/api/cars/:id', admin, async (c) => {
    const { opId, ...d } = await body(c, carUpdateSchema);
    const { result } = runOp(db, opId, me(c).id, () => svc.updateCar(db, me(c).id, c.req.param('id'), d));
    if (!result) throw notFound();
    return c.json(result);
  });

  app.get('/api/car-faults', auth, (c) => c.json(svc.listFaults(db)));
  app.post('/api/car-faults', auth, async (c) => {
    const { opId, ...d } = await body(c, faultCreateSchema);
    return c.json(runOp(db, opId, me(c).id, () => svc.createFault(db, me(c).id, d)).result);
  });
  // Termin naprawy (null = odwołana); nowy termin: push do wszystkich aktywnych (R41), po commit.
  app.put('/api/car-faults/:id', admin, async (c) => {
    const { opId, naprawaDzien } = await body(c, faultRepairSchema);
    const old = svc.getFault(db, c.req.param('id'));
    if (!old) throw notFound();
    const { result, dup } = runOp(db, opId, me(c).id, () => svc.setRepair(db, me(c).id, old.id, naprawaDzien));
    if (!result) throw notFound();
    if (!dup && naprawaDzien && naprawaDzien !== old.naprawaDzien) {
      const car = svc.getCar(db, result.carId);
      await notify(deps, users.activeIds(db), { title: `🔧 ${car?.nazwa ?? 'Samochód'}: naprawa ${fmtDay(naprawaDzien)} – ${result.opis}`, body: '', url: `#auta~${result.id}`, tag: `auta-${result.id}` })
        .catch((e) => logError(db, 'push', e, me(c).id));
    }
    return c.json(result);
  });
  app.delete('/api/car-faults/:id', admin, (c) => {
    const id = c.req.param('id');
    if (!svc.getFault(db, id)) {
      if (svc.faultRemoved(db, id)) return c.json({ ok: true }); // powtórka z kolejki
      throw notFound();
    }
    svc.removeFault(db, me(c).id, id);
    return c.json({ ok: true });
  });
}
