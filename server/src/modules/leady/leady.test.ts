import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import { addUser, loginCookie, testDeps } from '../../test-utils.js';
import { pushSubscriptions } from '../../core/schema-base.js';
import { newId } from '@etner/shared';
import { seedBase } from '../slowniki/seed.js';
import { modules } from '../index.js';
import { create as newClient } from '../klienci/service.js';
import { get as getJob } from '../zlecenia/service.js';
import { itemsOf } from '../zlecenia/scope.js';

async function setup() {
  const push = vi.fn(async () => ({ statusCode: 201 }));
  const diary = { addSystem: vi.fn() };
  const deps = testDeps({ push, diary, now: () => new Date('2026-03-10T10:00:00Z') });
  seedBase(deps.db);
  const app = createApp(deps, modules);
  const a = addUser(deps, { role: 'admin', name: 'Admin' });
  const w = addUser(deps);
  const t = new Date().toISOString();
  deps.db.insert(pushSubscriptions).values({ id: newId(), userId: a.user.id, endpoint: 'adm', p256dh: 'p', auth: 'a', createdAt: t, updatedAt: t }).run();
  const k = newClient(deps.db, a.user.id, { typ: 'osoba', nazwa: 'Nowak', telefony: [], emaile: [], nip: '', notatki: '', site: { nazwa: '', adres: 'Krótka 1', miejscowosc: 'Zawoja', mapa: '', opis: '' } });
  return { deps, app, push, diary, a, k, admin: await loginCookie(app, a.login), worker: await loginCookie(app, w.login) };
}
const req = (cookie: string, method: string, body?: unknown) =>
  ({ method, headers: { cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

describe('leady', () => {
  it('numeracja L0001 i kontakt: przyszły termin zostaje, miniony idzie do plan', async () => {
    const { app, admin, k } = await setup();
    const mk = async (nastepny: string) => (await app.request('/api/leads', req(admin, 'POST', { clientId: k.client.id, temat: 'Rekuperacja', nastepny }))).json();
    const l1 = await mk('2026-03-20');
    const l2 = await mk('2026-03-01');
    expect([l1.numer, l2.numer]).toEqual(['L0001', 'L0002']);
    expect(l1.status).toBe('Nowy');

    const c1 = await (await app.request(`/api/leads/${l1.id}/contact`, req(admin, 'POST', { notatka: 'dzwonił' }))).json();
    expect(c1.lead).toMatchObject({ nastepny: '2026-03-20', ostatni: '2026-03-10' });
    expect(c1.contact).toMatchObject({ plan: '', dzien: '2026-03-10' });

    const c2 = await (await app.request(`/api/leads/${l2.id}/contact`, req(admin, 'POST', { notatka: 'oddzwoniłem' }))).json();
    expect(c2.lead).toMatchObject({ nastepny: '', ostatni: '2026-03-10' });
    expect(c2.contact).toMatchObject({ plan: '2026-03-01' });

    const c3 = await (await app.request(`/api/leads/${l2.id}/contact`, req(admin, 'POST', { notatka: 'umówiony', nastepny: '2026-03-30' }))).json();
    expect(c3.lead.nastepny).toBe('2026-03-30');
    expect((await app.request('/api/leads', req(admin, 'POST', { temat: 'Duży', wartoscGr: 100_000_000_01 }))).status).toBe(400);
    const full = await (await app.request(`/api/leads/${l2.id}`, req(admin, 'GET'))).json();
    expect(full.contacts).toHaveLength(2);
  });

  it('to-job z accept: klient leada, status Przyjęta, grupa zamknięte, wpisy dziennika', async () => {
    const { app, admin, k, deps, diary } = await setup();
    const l = await (await app.request('/api/leads', req(admin, 'POST', { clientId: k.client.id, siteId: k.site!.id, temat: 'Klima' }))).json();
    const res = await app.request(`/api/leads/${l.id}/to-job`, req(admin, 'POST', { accept: true, job: { status: 'Nowe', kategoria: 'Klimatyzacja' }, scope: 'Montaż 2 jednostek' }));
    expect(res.status).toBe(200);
    const { lead, job } = await res.json();
    expect(getJob(deps.db, job.id)).toMatchObject({ clientId: k.client.id, siteId: k.site!.id, leadId: l.id, kategoria: 'Klimatyzacja' });
    expect(itemsOf(deps.db, job.id).map((p) => p.tekst)).toEqual(['Montaż 2 jednostek']);
    expect(lead.status).toBe('Przyjęta');
    expect(lead.zamknieteAt).toBeTruthy();
    expect(diary.addSystem).toHaveBeenCalledWith({ type: 'lead', id: l.id }, `Utworzono zlecenie ${job.numer}`);
    expect(diary.addSystem).toHaveBeenCalledWith({ type: 'job', id: job.id }, 'Z leada L0001');
    // bez accept status leada bez zmian
    const l2 = await (await app.request('/api/leads', req(admin, 'POST', { clientId: k.client.id, temat: 'Inny' }))).json();
    const r2 = await (await app.request(`/api/leads/${l2.id}/to-job`, req(admin, 'POST', { job: { status: 'Nowe' } }))).json();
    expect(r2.lead.status).toBe('Nowy');
    expect(itemsOf(deps.db, r2.job.id)).toEqual([]); // bez scope: bez punktu
    // drugie zlecenie z tego samego leada: 409
    const r3 = await app.request(`/api/leads/${l2.id}/to-job`, req(admin, 'POST', { job: { status: 'Nowe' } }));
    expect(r3.status).toBe(409);
    expect(await r3.json()).toEqual({ error: 'LEAD_MA_ZLECENIE' });
  });

  it('pracownik: 403 na trasach i brak zmian leada w feedzie', async () => {
    const { app, admin, worker, k } = await setup();
    const l = await (await app.request('/api/leads', req(admin, 'POST', { clientId: k.client.id, temat: 'X' }))).json();
    for (const [m, p, b] of [['GET', '/api/leads'], ['GET', `/api/leads/${l.id}`], ['POST', '/api/leads', { temat: 'a' }],
      ['PUT', `/api/leads/${l.id}`, { temat: 'b' }], ['POST', `/api/leads/${l.id}/contact`, { notatka: 'n' }],
      ['POST', `/api/leads/${l.id}/to-job`, { job: {} }], ['DELETE', `/api/leads/${l.id}/contacts/x`],
      ['GET', '/api/settings/leady-email'], ['PUT', '/api/settings/leady-email', { email: 'a@b.pl' }]] as const)
      expect((await app.request(p, req(worker, m, b))).status, `${m} ${p}`).toBe(403);
    const feed = (await (await app.request('/api/changes?since=0', req(worker, 'GET'))).json()).changes as any[];
    expect(feed.filter((c) => c.entity === 'leads' || c.entity === 'lead_contacts')).toEqual([]);
  });

  it('cron: jedno powiadomienie z liczbą zaległych, nic gdy zero', async () => {
    const { app, admin, k, deps, push } = await setup();
    const def = modules.find((m) => m.name === 'leady')!.cron![0]!;
    expect(def).toMatchObject({ name: 'leady-przypomnienia', schedule: '0 7 * * *' });
    await def.run(deps);
    expect(push).not.toHaveBeenCalled();
    const mk = (nastepny: string, status?: string) => app.request('/api/leads', req(admin, 'POST', { clientId: k.client.id, temat: 't', nastepny, status }));
    await mk('2026-03-09'); await mk('2026-03-10'); await mk('2026-03-11'); await mk('2026-03-01', 'Odrzucona'); await mk('');
    await def.run(deps);
    expect(push).toHaveBeenCalledTimes(1);
    expect(JSON.parse((push.mock.calls[0] as any)[1])).toMatchObject({ title: '📞 Kontakt z klientem: 2 zaległych', url: '#leady', tag: 'leady-przypomnienia' });
  });
  it('usunięcie kontaktu: miękkie, zmiana w feedzie, pola leada bez zmian; zły lead 404', async () => {
    const { app, admin, k } = await setup();
    const l = await (await app.request('/api/leads', req(admin, 'POST', { clientId: k.client.id, temat: 'X' }))).json();
    const { contact, lead } = await (await app.request(`/api/leads/${l.id}/contact`, req(admin, 'POST', { notatka: 'n', nastepny: '2026-03-20' }))).json();
    const l2 = await (await app.request('/api/leads', req(admin, 'POST', { temat: 'Y' }))).json();
    expect((await app.request(`/api/leads/${l2.id}/contacts/${contact.id}`, req(admin, 'DELETE'))).status).toBe(404);
    expect((await app.request(`/api/leads/${l.id}/contacts/${contact.id}`, req(admin, 'DELETE'))).status).toBe(200);
    expect((await app.request(`/api/leads/${l.id}/contacts/${contact.id}`, req(admin, 'DELETE'))).status).toBe(404);
    const full = await (await app.request(`/api/leads/${l.id}`, req(admin, 'GET'))).json();
    expect(full.contacts).toEqual([]);
    expect(full).toMatchObject({ nastepny: lead.nastepny, ostatni: lead.ostatni });
    const feed = (await (await app.request('/api/changes?since=0', req(admin, 'GET'))).json()).changes as any[];
    expect(feed.some((c) => c.entity === 'lead_contacts' && c.id === contact.id && c.action === 'delete')).toBe(true);
  });
  it('e-mail 7:00: lista zaległych do adresu z ustawień; nic gdy zero; brak SMTP = log błędu', async () => {
    const { app, admin, k, deps } = await setup();
    const def = modules.find((m) => m.name === 'leady')!.cron!.find((d) => d.name === 'leady-email')!;
    expect(def.schedule).toBe('0 7 * * *');
    const mailer = vi.fn(async () => {});
    Object.assign(deps, { mailer, baseUrl: 'https://etner.example/' });
    await def.run(deps);
    expect(mailer).not.toHaveBeenCalled();
    const mk = (nastepny: string, temat: string, status?: string) => app.request('/api/leads', req(admin, 'POST', { clientId: k.client.id, temat, nastepny, status }));
    const l = await (await mk('2026-03-09', 'Klima <biuro>')).json();
    await mk('2026-03-11', 'Przyszły'); await mk('2026-03-01', 'Zamknięty', 'Odrzucona');
    await def.run(deps);
    expect(mailer).toHaveBeenCalledTimes(1);
    const m = (mailer.mock.calls[0] as any)[0];
    expect(m).toMatchObject({ to: 'etner@etner-instalacje.pl', subject: 'Zaległe kontakty z klientami: 1' });
    expect(m.text).toContain('Nowak – Klima <biuro>, termin 09.03.2026');
    expect(m.text).toContain(`https://etner.example/#ld/${l.id}`);
    expect(m.html).toContain('Klima &#60;biuro&#62;');
    expect((await app.request('/api/settings/leady-email', req(admin, 'PUT', { email: 'zle' }))).status).toBe(400);
    expect(await (await app.request('/api/settings/leady-email', req(admin, 'PUT', { email: 'biuro@firma.pl' }))).json()).toEqual({ email: 'biuro@firma.pl' });
    expect(await (await app.request('/api/settings/leady-email', req(admin, 'GET'))).json()).toEqual({ email: 'biuro@firma.pl' });
    await def.run(deps);
    expect((mailer.mock.calls[1] as any)[0].to).toBe('biuro@firma.pl');
    delete deps.mailer;
    await def.run(deps);
    const errs = await (await app.request('/api/errors', req(admin, 'GET'))).json();
    expect(errs.filter((e: any) => e.where === 'cron:leady-email')).toHaveLength(1);
  });
});
