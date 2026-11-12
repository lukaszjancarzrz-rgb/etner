import { and, desc, eq, isNull } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { jobStatusFromLead, newId, type JobSaveInput, type LeadSaveInput, type LeadToJob } from '@etner/shared';
import type { Diary } from '../../app.js';
import { recordChange } from '../../core/changes.js';
import type { Db } from '../../core/db.js';
import { defaultFirmaId } from '../../core/firma.js';
import { firmy, settings } from '../../core/schema-base.js';
import type { Mail } from '../../core/mail.js';
import { esc, mailLayout, MAIL } from '../../core/mail-layout.js';
import * as klienci from '../klienci/service.js';
import * as slowniki from '../slowniki/service.js';
import * as zlecenia from '../zlecenia/service.js';
import { dictRefsFor } from '../../core/dict-refs.js';
import { leadContacts, leads } from './schema.js';

/** Słowniki: wartości przechowywane w leadach. */
export const dictRefs = dictRefsFor('leads', leads, { status_leada: leads.status, kategoria: leads.kategoria, zrodlo: leads.zrodlo });
/** Łączenie klientów (klienci.merge): przepina `client_id` z duplikatu na głównego klienta. */
export const clientRefs = dictRefsFor('leads', leads, { clientId: leads.clientId });
export const siteRefs = dictRefsFor('leads', leads, { siteId: leads.siteId });

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

/** „Klient – temat” (bez numeru leada, R: 19c pkt 13). */
export const leadLabel = (db: Db, l: LeadRow): string =>
  [l.clientId ? klienci.get(db, l.clientId)?.nazwa : undefined, l.temat].filter(Boolean).join(' – ');

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

/** Usuwa (miękko) jeden kontakt; pola leada (ostatni/następny) zostają. Już usunięty kontakt tego leada: true (powtórka z kolejki offline). */
export function removeContact(db: Db, userId: string, leadId: string, contactId: string): boolean {
  const old = db.select().from(leadContacts).where(and(eq(leadContacts.id, contactId), eq(leadContacts.leadId, leadId))).get();
  if (!old) return false;
  if (old.deletedAt) return true;
  const now = new Date().toISOString();
  const row = db.update(leadContacts).set({ deletedAt: now, updatedAt: now }).where(eq(leadContacts.id, contactId)).returning().get();
  recordChange(db, userId, 'lead_contacts', contactId, 'delete', old, row);
  return true;
}

export const LEADY_EMAIL_DEFAULT = 'etner@etner-instalacje.pl';
/** Adres porannego e-maila o zaległych kontaktach (ustawienie `leady_email`). */
export const setting = (db: Db, key: string): string | undefined => db.select().from(settings).where(eq(settings.key, key)).get()?.value;
export function setSetting(db: Db, key: string, value: string): void {
  const now = new Date().toISOString();
  db.insert(settings).values({ key, value, updatedAt: now }).onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: now } }).run();
}
export const leadyEmail = (db: Db): string => setting(db, 'leady_email') || LEADY_EMAIL_DEFAULT;
export const setLeadyEmail = (db: Db, value: string): void => setSetting(db, 'leady_email', value);

const pl = (d: string) => d.split('-').reverse().join('.');
const dniPo = (od: string, dzis: string) => Math.round((Date.parse(dzis) - Date.parse(od)) / 86_400_000);
/** E-mail z listą zaległych kontaktów albo null, gdy nie ma zaległych. */
export function overdueMail(db: Db, today: string, baseUrl = ''): Omit<Mail, 'to'> | null {
  const base = baseUrl.replace(/\/$/, '');
  const rows = overdue(db, today).sort((a, b) => a.nastepny.localeCompare(b.nastepny)).map((l) => {
    const k = l.clientId ? klienci.get(db, l.clientId) : undefined;
    return { klient: k?.nazwa ?? 'Bez klienta', temat: l.temat, termin: pl(l.nastepny), dni: dniPo(l.nastepny, today), tel: k?.telefony.join(', ') ?? '', tel1: k?.telefony[0] ?? '', link: `${base}/#ld/${l.id}` };
  });
  if (!rows.length) return null;
  const { C, FONT } = MAIL;
  const kiedy = (d: number) => (d <= 0 ? 'dziś' : d === 1 ? 'od wczoraj' : `od ${d} dni`);
  const karta = (r: (typeof rows)[number]) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 10px;border:1px solid ${C.line};border-left:4px solid #c0392b;border-radius:4px"><tr><td style="padding:12px 14px;${FONT}">
<p style="margin:0;font-size:16px;font-weight:700;color:${C.ink}">${esc(r.klient)}</p>
<p style="margin:2px 0 6px;font-size:14px;color:${C.ink}">${esc(r.temat)}</p>
<p style="margin:0;font-size:13px;color:${C.ink2}"><span style="color:#c0392b;font-weight:700">Termin ${r.termin} · ${kiedy(r.dni)}</span>${r.tel ? ` · tel. ${esc(r.tel)}` : ''}</p>
<p style="margin:8px 0 0;font-size:14px">${r.tel1 ? `<a href="tel:${esc(r.tel1.replace(/\s/g, ''))}" style="color:${C.action};font-weight:700;text-decoration:none">Zadzwoń</a> &nbsp;·&nbsp; ` : ''}<a href="${esc(r.link)}" style="color:${C.action};font-weight:700;text-decoration:none">Otwórz w aplikacji</a></p>
</td></tr></table>`;
  const n = rows.length, slowo = n === 1 ? 'kontakt czeka' : n < 5 ? 'kontakty czekają' : 'kontaktów czeka';
  return {
    subject: `Zaległe kontakty z klientami: ${n}`,
    text: `Dzień dobry,\n\n${n} ${slowo} na telefon do klienta:\n\n${rows.map((r) => `- ${r.klient} – ${r.temat}, termin ${r.termin}${r.tel ? `, tel. ${r.tel}` : ''}\n  ${r.link}`).join('\n')}\n\nETNER – wiadomość automatyczna z aplikacji.`,
    html: mailLayout({
      tytul: `Zaległe kontakty z klientami: ${n}`,
      zajawka: `${n} ${slowo} na telefon: ${rows.slice(0, 3).map((r) => r.klient).join(', ')}`,
      tresc: `<p style="margin:0 0 18px;font-size:15px;line-height:1.5;color:${C.ink2}">Dzień dobry! ${n} ${slowo} na telefon – termin kontaktu minął albo przypada dziś.</p>${rows.map(karta).join('')}`,
      przycisk: base ? { tekst: 'Otwórz zaległe w aplikacji', url: `${base}/#leady~zalegle` } : undefined,
      stopka: 'ETNER · Inteligentny wybór<br>Wiadomość automatyczna z aplikacji ETNER, wysyłana codziennie o 7:00, gdy są zaległe kontakty. Adres odbiorcy zmienisz w Ustawieniach.',
      baseUrl: base,
    }),
  };
}

/** Zlecenie z leada (ten sam klient i obiekt); `accept` zamyka lead statusem 4. wartości słownika. Wywołuj w runOp. */
export function toJob(db: Db, userId: string, leadId: string, job: LeadToJob['job'], accept: boolean, out: zlecenia.Outbox, diary?: Diary, scopeText = ''): { lead: LeadRow; job: zlecenia.JobRow } | undefined {
  const lead = get(db, leadId);
  if (!lead) return undefined;
  if (zlecenia.leadHasJob(db, leadId)) throw new HTTPException(409, { message: 'LEAD_MA_ZLECENIE' });
  if (job.status !== undefined && !jobStatusFromLead(job.status)) throw bad(`Zlecenie z leada nie może mieć statusu „${job.status}”`);
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
  diary?.addSystem({ type: 'job', id: row.id }, `Z leada: ${leadLabel(db, lead)}`);
  return { lead: upd!, job: row };
}
