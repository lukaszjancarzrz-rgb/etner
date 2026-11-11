import { leadContactSchema, leadCreateSchema, leadToJobSchema, leadUpdateSchema, dayOf } from '@etner/shared';
import type { Context, Hono, MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppDeps } from '../../app.js';
import { body } from '../../core/body.js';
import { requireUser } from '../../core/auth.js';
import { logError } from '../../core/errors.js';
import { notify } from '../../core/notify.js';
import { runOp } from '../../core/ops.js';
import { can } from '../../core/permissions.js';
import { z } from 'zod';
import * as svc from './service.js';

const notFound = () => new HTTPException(404, { message: 'Nie znaleziono' });

export function routes(app: Hono, deps: AppDeps): void {
  const { db } = deps;
  const auth = requireUser(db);
  const guard: MiddlewareHandler = (c, next) =>
    auth(c, async () => {
      if (!can(c.get('user'), 'leady')) { c.res = c.json({ error: 'BRAK_UPRAWNIEN' }, 403); return; }
      await next();
    });
  const uid = (c: Context): string => c.get('user').id;

  app.get('/api/leads', guard, (c) => c.json(svc.list(db)));
  app.get('/api/leads/:id', guard, (c) => {
    const l = svc.get(db, c.req.param('id'));
    if (!l) throw notFound();
    return c.json({ ...l, contacts: svc.contactsOf(db, l.id) });
  });

  const write = async (c: Context, input: Record<string, any> & { opId?: string }, id?: string) => {
    const { opId, ...d } = input;
    const { result } = runOp(db, opId, uid(c), () => svc.save(db, uid(c), { ...d, id }));
    if (!result) throw notFound();
    return c.json(result);
  };
  app.post('/api/leads', guard, async (c) => write(c, await body(c, leadCreateSchema)));
  app.put('/api/leads/:id', guard, async (c) => write(c, await body(c, leadUpdateSchema), c.req.param('id')));

  app.post('/api/leads/:id/contact', guard, async (c) => {
    const b = await body(c, leadContactSchema);
    const today = dayOf((deps.now ?? (() => new Date()))());
    const { result } = runOp(db, b.opId, uid(c), () => svc.contact(db, uid(c), c.req.param('id'), b.notatka, b.nastepny, today));
    if (!result) throw notFound();
    return c.json(result);
  });

  app.delete('/api/leads/:id/contacts/:contactId', guard, (c) => {
    if (!svc.removeContact(db, uid(c), c.req.param('id'), c.req.param('contactId'))) throw notFound();
    return c.json({ ok: true });
  });
  app.get('/api/settings/leady-email', guard, (c) => c.json({ email: svc.leadyEmail(db) }));
  app.put('/api/settings/leady-email', guard, async (c) => {
    const { email } = await body(c, z.object({ email: z.string().trim().email('Wpisz poprawny adres e-mail') }));
    svc.setLeadyEmail(db, email);
    return c.json({ email });
  });
  // Test (Ustawienia): to samo co o 7:00 – powiadomienie push do klikającego i e-mail na adres z ustawień; bez blokady „raz dziennie”.
  app.post('/api/settings/leady-email/test', guard, async (c) => {
    const day = dayOf((deps.now ?? (() => new Date()))());
    const n = svc.overdue(db, day).length;
    const push = await notify(deps, [uid(c)], { title: `📞 Kontakt z klientem: ${n} zaległych (test)`, body: 'Leady z terminem kontaktu na dziś lub wcześniej', url: '#leady~zalegle', tag: 'leady-przypomnienia' });
    if (!deps.mailer) throw new HTTPException(422, { message: `Brak konfiguracji poczty (BREVO_API_KEY albo SMTP_HOST oraz MAIL_FROM w Render) – e-mail nie wysłany. Powiadomień push: ${push}.` });
    const to = svc.leadyEmail(db);
    // brak zaległych: i tak e-mail, żeby sprawdzić skrzynkę i SMTP
    const m = svc.overdueMail(db, day, deps.baseUrl) ?? { subject: 'Zaległe kontakty z klientami: 0 (test)', text: 'Test: dziś nie ma zaległych kontaktów.', html: '<p>Test: dziś nie ma zaległych kontaktów.</p>' };
    try { await deps.mailer({ ...m, subject: `${m.subject} – test`, to }); } catch (e) {
      logError(db, 'test:leady-email', e, uid(c));
      throw new HTTPException(422, { message: `Serwer poczty odrzucił wysyłkę: ${e instanceof Error ? e.message : String(e)}` });
    }
    return c.json({ zalegle: n, push, email: to });
  });
  app.post('/api/leads/:id/to-job', guard, async (c) => {
    const b = await body(c, leadToJobSchema);
    const out: import('../zlecenia/service.js').Outbox = [];
    const { result, dup } = runOp(db, b.opId, uid(c), () => svc.toJob(db, uid(c), c.req.param('id'), b.job, b.accept, out, deps.diary, b.scope));
    if (!result) throw notFound();
    if (!dup) for (const o of out) void notify(deps, o.userIds, o.n).catch((e) => logError(db, 'push', e, uid(c)));
    return c.json(result);
  });
}
