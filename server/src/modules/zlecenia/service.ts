import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { newId, type JobSaveInput } from '@etner/shared';
import { recordChange } from '../../core/changes.js';
import type { Db } from '../../core/db.js';
import { defaultFirmaId } from '../../core/firma.js';
import { firmy } from '../../core/schema-base.js';
import type { Notification } from '../../core/notify.js';
import * as klienci from '../klienci/service.js';
import * as slowniki from '../slowniki/service.js';
import * as users from '../uzytkownicy/service.js';
import { dictRefsFor } from '../../core/dict-refs.js';
import { jobs } from './schema.js';

/** Słowniki: wartości przechowywane w zleceniach (zmiana nazwy, blokada usuwania). */
export const dictRefs = dictRefsFor('jobs', jobs, { status_zlecenia: jobs.status, kategoria: jobs.kategoria, rodzaj_zlecenia: jobs.rodzaj, ekipa: jobs.ekipa });
/** Łączenie klientów (klienci.merge): przepina `client_id` z duplikatu na głównego klienta. */
export const clientRefs = dictRefsFor('jobs', jobs, { clientId: jobs.clientId });

export type JobRow = typeof jobs.$inferSelect;
/** Dla harmonogramu: nowe osoby zlecenia trafiają do jego kanału Pumble. */
export { addPeopleLater as pumbleAddPeople } from './pumble.js';
/** Dla leadów: pierwszy punkt zakresu zlecenia utworzonego z leada. */
export { create as addScopeItem } from './scope.js';
export type JobRef = { id: string; numer: string; klient: string; miejscowosc: string; status: string };
/** Powiadomienie do wysłania dopiero po zatwierdzeniu transakcji. */
export type Outbox = { userIds: string[]; n: Notification }[];

const bad = (m: string) => new HTTPException(400, { message: m });

export const get = (db: Db, id: string): JobRow | undefined =>
  db.select().from(jobs).where(and(eq(jobs.id, id), isNull(jobs.deletedAt))).get();
export const list = (db: Db): JobRow[] =>
  db.select().from(jobs).where(isNull(jobs.deletedAt)).orderBy(desc(jobs.numer)).all();
export const forSite = (db: Db, siteId: string): JobRow[] =>
  db.select().from(jobs).where(and(eq(jobs.siteId, siteId), isNull(jobs.deletedAt))).orderBy(asc(jobs.numer)).all();
export const leadHasJob = (db: Db, leadId: string): boolean =>
  !!db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.leadId, leadId), isNull(jobs.deletedAt))).limit(1).get();
export const clientHasJobs = (db: Db, clientId: string): boolean =>
  !!db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.clientId, clientId), isNull(jobs.deletedAt))).limit(1).get();

const ref = (db: Db, j: JobRow): JobRef => ({
  id: j.id, numer: j.numer, status: j.status,
  klient: klienci.get(db, j.clientId)?.nazwa ?? '',
  miejscowosc: (j.siteId && klienci.getSite(db, j.siteId)?.miejscowosc) || '',
});
/**
 * Krótko o kliencie: osoba – nazwa jak zapisana, gdy to jedno słowo, inaczej ostatnie słowo (zwykle nazwisko, np. „Jan Kowalski” → „Kowalski”);
 * firma – cała nazwa. Kanał Pumble i powiadomienia używają tej samej reguły.
 */
export const clientShort = (c: { typ: string; nazwa: string } | undefined): string =>
  !c ? '' : c.typ === 'osoba' ? c.nazwa.trim().split(/\s+/).at(-1) ?? '' : c.nazwa.trim();

/** Nazwa zlecenia w powiadomieniach: „Kowalski – Zawoja (Z0012)”; numer tylko gdy się mieści (≤ 40 znaków), bez klienta sam numer. */
export function jobLabel(db: Db, j: Pick<JobRow, 'numer' | 'clientId' | 'siteId'>, max = 40): string {
  const site = j.siteId ? klienci.getSite(db, j.siteId) : undefined;
  const base = [clientShort(klienci.get(db, j.clientId)), site?.miejscowosc].filter(Boolean).join(' – ');
  if (!base) return j.numer;
  const full = `${base} (${j.numer})`;
  return full.length <= max ? full : base;
}

/** Niezamknięte zlecenia (do wyboru w harmonogramie). */
export const active = (db: Db): JobRef[] =>
  list(db).filter((j) => slowniki.groupOf(db, 'status_zlecenia', j.status) !== 'zamkniete').map((j) => ref(db, j));

/** Pracownik: bez uwag admina i leada (kopia, oryginał nietknięty). */
export const forWorker = <T extends Record<string, any>>(j: T): Omit<T, 'uwagiAdmin' | 'leadId'> => {
  const { uwagiAdmin: _u, leadId: _l, ...rest } = j;
  return rest;
};

/** shortcut: max numeru liczony w pamięci z całej firmy, przy tysiącach zleceń przejść na osobny licznik. */
function nextNumer(db: Db, firmaId: string): string {
  const prefix = db.select({ p: firmy.prefiksZ }).from(firmy).where(eq(firmy.id, firmaId)).get()?.p ?? 'Z';
  const max = db.select({ n: jobs.numer }).from(jobs).where(eq(jobs.firmaId, firmaId)).all()
    .reduce((m, r) => Math.max(m, parseInt(r.n.slice(prefix.length), 10) || 0), 0);
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

/** Wywołuj w runOp/tx. Zwraca zlecenie; powiadomienia ląduje w `out` (wysyłka po commit). */
const awaiting = new WeakMap<Db, Set<string>>();
/**
 * Zlecenia założone w tym procesie, które czekają na kanał Pumble: obieg zakłada kanały tylko im (nowe zlecenia, także z leada), nie starym.
 * shortcut: w pamięci; po restarcie nieudane założenie zostaje dla przycisku admina „Utwórz kanał w Pumble”.
 */
export const awaitingChannel = (db: Db): Set<string> => {
  let s = awaiting.get(db);
  if (!s) awaiting.set(db, (s = new Set()));
  return s;
};

export function save(db: Db, userId: string, input: JobSaveInput, out: Outbox = []): JobRow | undefined {
  const { id, newClient, newSite, ...rest } = input;
  const old = id ? get(db, id) : undefined;
  if (id && !old) return undefined;
  if (rest.status !== undefined && slowniki.groupOf(db, 'status_zlecenia', rest.status) === null) throw bad('Nieznany status zlecenia');

  let clientId = rest.clientId ?? old?.clientId;
  if (newClient) clientId = klienci.create(db, userId, { ...newClient, site: undefined }).client.id;
  if (!clientId || !klienci.get(db, clientId)) throw bad('Nie znaleziono klienta');
  let siteId = rest.siteId === undefined ? (rest.clientId && rest.clientId !== old?.clientId ? null : old?.siteId ?? null) : rest.siteId;
  if (newSite) siteId = klienci.addSite(db, userId, clientId, newSite)!.id;
  if (siteId && klienci.getSite(db, siteId)?.clientId !== clientId) throw bad('Obiekt nie należy do klienta');

  const now = new Date().toISOString();
  const patch = Object.fromEntries(Object.entries(rest).filter(([k, v]) => v !== undefined && k !== 'clientId' && k !== 'siteId'));
  const status = (patch.status as string | undefined) ?? old?.status;
  if (!status) throw bad('Podaj status zlecenia');
  const closed = slowniki.groupOf(db, 'status_zlecenia', status) === 'zamkniete';
  const zamknieteAt = closed ? old?.zamknieteAt ?? now : null;

  let row: JobRow;
  if (old) {
    row = db.update(jobs).set({ ...patch, clientId, siteId, zamknieteAt, updatedAt: now }).where(eq(jobs.id, old.id)).returning().get();
    recordChange(db, userId, 'jobs', row.id, 'update', old, row);
  } else {
    const firmaId = defaultFirmaId(db);
    row = db.insert(jobs).values({ ...patch, id: newId(), firmaId, numer: nextNumer(db, firmaId), clientId, siteId, status, zamknieteAt, createdAt: now, createdBy: userId, updatedAt: now }).returning().get();
    recordChange(db, userId, 'jobs', row.id, 'create', null, row);
    awaitingChannel(db).add(row.id);
  }

  // R18: klient i obiekt trafiają do pracowników dopiero gdy mają zlecenie; ponowna emisja po zmianie powiązania.
  if (!old || old.clientId !== clientId) reemit(db, userId, 'clients', klienci.get(db, clientId));
  if (siteId && (!old || old.siteId !== siteId)) reemit(db, userId, 'sites', klienci.getSite(db, siteId));

  if (row.ekipa && row.ekipa !== 'mieszane' && row.ekipa !== old?.ekipa) {
    const to = users.crewMembers(db, row.ekipa).filter((u) => u !== userId);
    const r = ref(db, row);
    const site = row.siteId ? klienci.getSite(db, row.siteId) : undefined;
    out.push({
      userIds: to,
      n: {
        title: `${old ? '🛠️ Zlecenie dla Twojej ekipy' : '🆕 Nowe zlecenie'}: ${jobLabel(db, row)}`,
        body: [r.klient, [site?.adres, r.miejscowosc].filter(Boolean).join(' ')].filter(Boolean).join(', '),
        url: `#zl/${row.id}`, tag: `zl-${row.id}`,
      },
    });
  }
  return row;
}

function reemit(db: Db, userId: string, entity: 'clients' | 'sites', row: unknown): void {
  if (row) recordChange(db, userId, entity, (row as { id: string }).id, 'update', row, row);
}
