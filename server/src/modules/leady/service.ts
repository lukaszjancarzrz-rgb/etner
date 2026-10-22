import { and, desc, eq, isNull } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { newId, type JobSaveInput, type LeadSaveInput, type LeadToJob } from '@etner/shared';
import type { Diary } from '../../app.js';
import { recordChange } from '../../core/changes.js';
import type { Db } from '../../core/db.js';
import { defaultFirmaId } from '../../core/firma.js';
import { firmy } from '../../core/schema-base.js';
import * as klienci from '../klienci/service.js';
import * as slowniki from '../slowniki/service.js';
import * as zlecenia from '../zlecenia/service.js';
import { leadContacts, leads } from './schema.js';

export type LeadRow = typeof leads.$inferSelect;
export type ContactRow = typeof leadContacts.$inferSelect;

const bad = (m: string) => new HTTPException(400, { message: m });

export const get = (db: Db, id: string): LeadRow | undefined =>
  db.select().from(leads).where(and(eq(leads.id, id), isNull(leads.deletedAt))).get();
export const list = (db: Db): LeadRow[] =>
  db.select().from(leads).where(isNull(leads.deletedAt)).orderBy(desc(leads.numer)).all();
export const contactsOf = (db: Db, leadId: string): ContactRow[] =>
  db.select().from(leadContacts).where(and(eq(leadContacts.leadId, leadId), isNull(leadContacts.deletedAt)))
    .orderBy(desc(leadContacts.dzien), desc(leadContacts.createdAt)).all();

/** Otwarte leady z terminem kontaktu <= today. */
export const overdue = (db: Db, today: string): LeadRow[] =>
  list(db).filter((l) => l.nastepny !== '' && l.nastepny <= today && slowniki.groupOf(db, 'status_leada', l.status) !== 'zamkniete');

/** shortcut: max numeru liczony w pamięci (jak zlecenia), przy tysiącach leadów przejść na licznik. */
function nextNumer(db: Db, firmaId: string): string {
  const prefix = db.select({ p: firmy.prefiksL }).from(firmy).where(eq(firmy.id, firmaId)).get()?.p ?? 'L';
  const max = db.select({ n: leads.numer }).from(leads).where(eq(leads.firmaId, firmaId)).all()
    .reduce((m, r) => Math.max(m, parseInt(r.n.slice(prefix.length), 10) || 0), 0);
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

/** Wywołuj w runOp/tx. */
export function save(db: Db, userId: string, input: LeadSaveInput): LeadRow | undefined {
  const { id, newClient, newSite, clientId: cid, siteId: sid, ...rest } = input;
  const old = id ? get(db, id) : undefined;
  if (id && !old) return undefined;
  if (rest.status !== undefined && slowniki.groupOf(db, 'status_leada', rest.status) === null) throw bad('Nieznany status leada');

  let clientId = cid === undefined ? old?.clientId ?? null : cid;
  if (newClient) clientId = klienci.create(db, userId, { ...newClient, site: undefined }).client.id;
  if (clientId && !klienci.get(db, clientId)) throw bad('Nie znaleziono klienta');
  let siteId = sid === undefined ? (cid !== undefined && cid !== old?.clientId ? null : old?.siteId ?? null) : sid;
  if (newSite) {
    if (!clientId) throw bad('Obiekt wymaga klienta');
    siteId = klienci.addSite(db, userId, clientId, newSite)!.id;
  }
  if (siteId && (!clientId || klienci.getSite(db, siteId)?.clientId !== clientId)) throw bad('Obiekt nie należy do klienta');

  const now = new Date().toISOString();
  const patch = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
  const status = (patch.status as string | undefined) ?? old?.status ?? slowniki.list(db, 'status_leada')[0]?.wartosc;
  if (!status) throw bad('Podaj status leada');
  const zamknieteAt = slowniki.groupOf(db, 'status_leada', status) === 'zamkniete' ? old?.zamknieteAt ?? now : null;

  let row: LeadRow;
  if (old) {
    row = db.update(leads).set({ ...patch, clientId, siteId, status, zamknieteAt, updatedAt: now }).where(eq(leads.id, old.id)).returning().get();
    recordChange(db, userId, 'leads', row.id, 'update', old, row);
  } else {
    const firmaId = defaultFirmaId(db);
    row = db.insert(leads).values({ ...patch, id: newId(), firmaId, numer: nextNumer(db, firmaId), clientId, siteId, status, zamknieteAt, createdAt: now, createdBy: userId, updatedAt: now } as typeof leads.$inferInsert).returning().get();
    recordChange(db, userId, 'leads', row.id, 'create', null, row);
  }
  return row;
}

/** Kontakt z klientem: przyszły termin zostaje, minięty (<= dziś) idzie do `plan` i jest czyszczony; `next` ustawia nowy termin. */
export function contact(db: Db, userId: string, id: string, note: string, next: string | undefined, today: string): { lead: LeadRow; contact: ContactRow } | undefined {
  const old = get(db, id);
  if (!old) return undefined;
  const due = old.nastepny !== '' && old.nastepny <= today;
  const nastepny = next ?? (due ? '' : old.nastepny);
  const now = new Date().toISOString();
  const lead = db.update(leads).set({ nastepny, ostatni: today, updatedAt: now }).where(eq(leads.id, id)).returning().get();
  recordChange(db, userId, 'leads', id, 'update', old, lead);
  const c = db.insert(leadContacts).values({
    id: newId(), leadId: id, dzien: today, plan: due ? old.nastepny : '', notatka: note, nastepny: next ?? '',
    status: old.status, by: userId, createdAt: now, createdBy: userId, updatedAt: now,
  }).returning().get();
  recordChange(db, userId, 'lead_contacts', c.id, 'create', null, c);
  return { lead, contact: c };
}

/** Zlecenie z leada (ten sam klient i obiekt); `accept` zamyka lead statusem 4. wartości słownika. Wywołuj w runOp. */
export function toJob(db: Db, userId: string, leadId: string, job: LeadToJob['job'], accept: boolean, out: zlecenia.Outbox, diary?: Diary, scopeText = ''): { lead: LeadRow; job: zlecenia.JobRow } | undefined {
  const lead = get(db, leadId);
  if (!lead) return undefined;
  if (zlecenia.leadHasJob(db, leadId)) throw new HTTPException(409, { message: 'LEAD_MA_ZLECENIE' });
  const input: JobSaveInput = { ...job, leadId };
  if (lead.clientId) { input.clientId = lead.clientId; input.siteId = lead.siteId; delete input.newClient; delete input.newSite; }
  const row = zlecenia.save(db, userId, input, out)!;
  if (scopeText) zlecenia.addScopeItem(db, userId, row.id, { tekst: scopeText, uploads: [] });
  // Lead bez klienta dostaje klienta utworzonego przez zlecenie.
  const link = lead.clientId ? undefined : { clientId: row.clientId, siteId: row.siteId };
  const acceptStatus = accept ? slowniki.list(db, 'status_leada')[3]?.wartosc : undefined;
  if (accept && !acceptStatus) throw bad('Brak statusu przyjęcia w słowniku');
  const upd = acceptStatus ? save(db, userId, { id: leadId, status: acceptStatus, ...link }) : link ? save(db, userId, { id: leadId, ...link }) : lead;
  diary?.addSystem({ type: 'lead', id: leadId }, `Utworzono zlecenie ${row.numer}`);
  diary?.addSystem({ type: 'job', id: row.id }, `Z leada ${lead.numer}`);
  return { lead: upd!, job: row };
}
