// Kanał Pumble przy zleceniu (zadanie 18g). Wszystko tutaj działa po zatwierdzeniu zapisu zlecenia; błąd Pumble nigdy go nie cofa.
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { newId, type User } from '@etner/shared';
import type { AppDeps } from '../../app.js';
import { recordChange } from '../../core/changes.js';
import { tx } from '../../core/db.js';
import { logError } from '../../core/errors.js';
import { isGlobalPumbleError, type PumbleClient, type PumbleMessage, type PumbleUser } from '../../core/pumble.js';
import { runOp } from '../../core/ops.js';
import { opIds } from '../../core/schema-base.js';
import * as klienci from '../klienci/service.js';
import * as slowniki from '../slowniki/service.js';
import * as users from '../uzytkownicy/service.js';
import { jobs, pumbleMessages } from './schema.js';
import * as svc from './service.js';

export const POLL_MS = 20_000;
const USERS_TTL = 10 * 60_000, RETRY_MS = 5 * 60_000, KEEP = 50, PER_TICK = 50, CREATE_PER_TICK = 5;
const BACKOFF_MIN = 60_000, BACKOFF_MAX = 30 * 60_000;

/** Stan w pamięci procesu, osobno dla każdego klienta (testy mają własne atrapy). shortcut: jedna instancja serwera; przy kilku przenieść do bazy. */
type St = {
  users?: { at: number; list: PumbleUser[] }; me?: PumbleUser; tried: Map<string, number>; added: Map<string, Set<string>>;
  /** Kanały sprawdzone (prywatne albo bez typu w odpowiedzi) i te już zgłoszone jako publiczne. */
  checked: Set<string>; publicLogged: Set<string>;
  missLogged: Set<string>; badLogged: Set<string>; inflight: Map<string, Promise<svc.JobRow | undefined>>;
  /** Zlecenia, którym nie udało się dodać osób (Pumble niedostępne); obieg ponawia. */
  pending: Set<string>;
  sending: Map<string, Promise<unknown>>; bg: Set<Promise<unknown>>;
  rr: number; running: boolean; backoffMs: number; backoffUntil: number;
};
const states = new WeakMap<PumbleClient, St>();
const st = (p: PumbleClient): St => {
  let s = states.get(p);
  if (!s) states.set(p, (s = { tried: new Map(), added: new Map(), checked: new Set(), publicLogged: new Set(), missLogged: new Set(), badLogged: new Set(),
    inflight: new Map(), pending: new Set(), sending: new Map(), bg: new Set(), rr: 0, running: false, backoffMs: 0, backoffUntil: 0 }));
  return s;
};
const now = (deps: AppDeps) => (deps.now ?? (() => new Date()))();
const group = (deps: AppDeps, j: svc.JobRow) => slowniki.groupOf(deps.db, 'status_zlecenia', j.status);

/** Zadanie Pumble po odpowiedzi HTTP (zapis zlecenia nie czeka na Pumble); błąd tylko do dziennika błędów. */
export function later(deps: AppDeps, where: string, f: () => Promise<unknown>): void {
  if (!deps.pumble) return;
  const s = st(deps.pumble);
  const pr: Promise<unknown> = f().catch((e) => logError(deps.db, where, e)).finally(() => s.bg.delete(pr));
  s.bg.add(pr);
}
/** Czeka, aż skończą się zadania z `later` (testy). */
export async function idle(deps: AppDeps): Promise<void> {
  const s = deps.pumble && st(deps.pumble);
  while (s?.bg.size) await Promise.all([...s.bg]);
}

/** Nazwa kanału: małe litery ASCII, cyfry i myślniki, najwyżej 80 znaków. */
export function channelSlug(...parts: string[]): string {
  return parts.filter(Boolean).join('-').replace(/ł/g, 'l').replace(/Ł/g, 'L').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').slice(0, 80).replace(/-+$/, '');
}

function channelInfo(deps: AppDeps, j: svc.JobRow): { name: string; description: string } {
  const c = klienci.get(deps.db, j.clientId);
  const site = j.siteId ? klienci.getSite(deps.db, j.siteId) : undefined;
  const nazwa = c?.nazwa ?? '';
  const who = svc.clientShort(c);
  const where = [site?.adres, site?.miejscowosc].filter(Boolean).join(' ');
  return { name: channelSlug(j.numer, who, site?.miejscowosc ?? ''), description: `Zlecenie ${j.numer} – ${nazwa}${where ? `, ${where}` : ''}` };
}

async function pumbleUsers(deps: AppDeps, p: PumbleClient): Promise<PumbleUser[]> {
  const s = st(p), t = now(deps).getTime();
  if (!s.users || t - s.users.at > USERS_TTL) s.users = { at: t, list: await p.listUsers() };
  return s.users.list;
}
/** Konto właściciela klucza (myInfo), raz na proces. */
async function owner(p: PumbleClient): Promise<PumbleUser> {
  const s = st(p);
  return (s.me ??= await p.myInfo());
}

/** Admini, ekipa zlecenia (bez „mieszane”) i osoby z harmonogramu. */
export const membersOf = (deps: AppDeps, j: svc.JobRow): string[] => [...new Set([
  ...users.admins(deps.db),
  ...(j.ekipa && j.ekipa !== 'mieszane' ? users.crewMembers(deps.db, j.ekipa) : []),
  ...(deps.schedule?.peopleForJob?.(j.id) ?? []),
])];

/** Czy wolno dodawać osoby: kanał prywatny albo Pumble nie podało typu. Publiczny = jeden czytelny wpis w błędach, bez osób (dane klienta). */
async function privateOk(deps: AppDeps, p: PumbleClient, j: svc.JobRow): Promise<boolean> {
  const s = st(p), cid = j.pumbleChannelId!;
  if (s.checked.has(cid)) return true;
  if (s.publicLogged.has(cid)) return false;
  // odczyt kanału nieudany (ale Pumble działa): typ nieznany, jak brak typu w odpowiedzi
  const back = await p.getChannel({ channelId: cid }).catch((e) => { if (isGlobalPumbleError(e)) throw e; return null; });
  const type = back?.type ?? back?.channelType;
  if (type && !/private/i.test(type)) {
    s.publicLogged.add(cid);
    logError(deps.db, 'pumble:kanal', new Error(`Kanał ${back!.name} zlecenia ${j.numer} nie jest prywatny (${type}). Osoby nie zostały dodane; zmień kanał na prywatny w Pumble.`));
    return false;
  }
  s.checked.add(cid);
  return true;
}

/**
 * Dodaje osoby (id użytkowników) do kanału zlecenia; konta łączone po e-mailu, bez dopasowania są pomijane (jeden wpis w błędach na zlecenie).
 * Gdy Pumble odrzuci całą paczkę, dodaje po jednej osobie (jedno złe id nie blokuje reszty). Rzuca tylko błąd całego Pumble.
 */
export async function addPeople(deps: AppDeps, jobId: string, userIds: string[]): Promise<void> {
  const p = deps.pumble, j = svc.get(deps.db, jobId);
  if (!p || !j?.pumbleChannelId) return;
  const s = st(p), cid = j.pumbleChannelId;
  const byEmail = new Map((await pumbleUsers(deps, p)).filter((u) => u.email).map((u) => [u.email.toLowerCase(), u.id]));
  const missing: string[] = [], ids: string[] = [];
  for (const uid of userIds) {
    const u = users.get(deps.db, uid);
    const pid = u?.email ? byEmail.get(u.email) : undefined;
    if (pid) ids.push(pid); else if (u) missing.push(u.name);
  }
  if (missing.length && !s.missLogged.has(jobId)) {
    s.missLogged.add(jobId);
    logError(deps.db, 'pumble:osoby', new Error(`Zlecenie ${j.numer}: brak konta Pumble o tym samym e-mailu: ${missing.join(', ')}`));
  }
  const added = s.added.get(cid) ?? new Set<string>();
  s.added.set(cid, added);
  const todo = [...new Set(ids)].filter((i) => !added.has(i));
  if (!todo.length || !(await privateOk(deps, p, j))) return;
  try {
    await p.addUsers(cid, todo);
    for (const i of todo) added.add(i);
  } catch (e) {
    if (isGlobalPumbleError(e)) throw e;
    const bad: string[] = [];
    for (const i of todo) {
      try { if (todo.length > 1) { await p.addUsers(cid, [i]); added.add(i); } else bad.push(i); } catch (e2) { if (isGlobalPumbleError(e2)) throw e2; bad.push(i); }
    }
    if (bad.length && !s.badLogged.has(jobId)) {
      s.badLogged.add(jobId);
      logError(deps.db, 'pumble:osoby', new Error(`Zlecenie ${j.numer}: Pumble nie dodał osób ${bad.join(', ')} (${e instanceof Error ? e.message : e})`));
    }
  }
}

/** Dodanie osób po odpowiedzi HTTP; gdy Pumble nie odpowiada, zlecenie czeka na ponowienie w obiegu. */
export function addPeopleLater(deps: AppDeps, jobId: string, userIds: string[]): void {
  const p = deps.pumble;
  if (!p) return;
  later(deps, 'pumble:dodaj', () => addPeople(deps, jobId, userIds).catch((e) => { st(p).pending.add(jobId); throw e; }));
}

const canTry = (s: St, jobId: string, t: number) => !s.inflight.has(jobId) && t - (s.tried.get(jobId) ?? -Infinity) >= RETRY_MS;

/** Zakłada kanał (jeśli go nie ma) i dodaje osoby. Bez `force` najwyżej raz na 5 min na zlecenie. Rzuca przy błędzie Pumble (zakładania kanału). */
export function ensureChannel(deps: AppDeps, jobId: string, force = false): Promise<svc.JobRow | undefined> {
  const p = deps.pumble;
  const j = svc.get(deps.db, jobId);
  if (!p || !j || j.pumbleChannelId) return Promise.resolve(j);
  const s = st(p), t = now(deps).getTime();
  const pending = s.inflight.get(jobId);
  if (pending) return pending;
  if (!force && !canTry(s, jobId, t)) return Promise.resolve(j);
  s.tried.set(jobId, t);
  const run = (async () => {
    const { name, description } = channelInfo(deps, j);
    let free = name;
    for (let n = 2; await p.getChannel({ channel: free }); n++) free = `${name.slice(0, 80 - String(n).length - 1).replace(/-+$/, '')}-${n}`;
    const ch = await p.createChannel({ name: free, type: 'private', description });
    // id zapisujemy od razu, żeby błąd przy dodawaniu osób nie założył drugiego kanału
    const row = tx(deps.db, (db) => {
      const old = svc.get(db, jobId);
      if (!old) return undefined;
      // bez updatedAt: założenie kanału to nie „nowe” w zleceniu
      const r = db.update(jobs).set({ pumbleChannelId: ch.id }).where(eq(jobs.id, jobId)).returning().get();
      recordChange(db, null, 'jobs', jobId, 'update', old, r);
      return r;
    });
    if (row) {
      await addPeople(deps, jobId, membersOf(deps, row)).catch((e) => {
        s.pending.add(jobId);
        logError(deps.db, 'pumble:dodaj', e);
      });
    }
    return row ?? j;
  })().finally(() => s.inflight.delete(jobId));
  s.inflight.set(jobId, run);
  return run;
}

const PREFIX = /^([^:\n]{1,60}): ([\s\S]+)$/;
const iso = (m: PumbleMessage) => new Date(m.timestampMilli ?? m.timestamp ?? Date.now()).toISOString();

/** Nowe wiadomości jednego kanału + przycięcie do 50 ostatnich. Zwraca liczbę dodanych. */
async function pollJob(deps: AppDeps, p: PumbleClient, j: svc.JobRow): Promise<number> {
  const msgs = (await p.listMessages(j.pumbleChannelId!, 20)).filter((m) => m.id && !m.deleted);
  if (!msgs.length) return 0;
  const { db } = deps;
  const known = new Set(db.select({ m: pumbleMessages.messageId }).from(pumbleMessages).where(inArray(pumbleMessages.messageId, msgs.map((m) => m.id))).all().map((r) => r.m));
  const fresh = msgs.filter((m) => !known.has(m.id)).sort((a, b) => iso(a).localeCompare(iso(b)));
  if (!fresh.length) return 0;
  const pu = new Map((await pumbleUsers(deps, p)).map((u) => [u.id, u]));
  const me = await owner(p);
  const list = users.list(db);
  const byEmail = new Map(list.filter((u) => u.email).map((u) => [u.email!, u.id]));
  const byName = new Map(list.map((u) => [u.name, u.id]));
  tx(db, (t) => {
    const ts = new Date().toISOString();
    for (const m of fresh) {
      const u = pu.get(m.author);
      // „Imię: ” to podpis z ETNER: tylko w wiadomościach konta klucza lub aplikacji i tylko z imieniem naszego użytkownika
      const pre = m.authorAppId || m.author === me.id ? PREFIX.exec(m.text ?? '') : null;
      const sig = pre && byName.has(pre[1]!) ? pre : null;
      const row = t.insert(pumbleMessages).values({
        id: newId(), jobId: j.id, messageId: m.id, authorName: sig?.[1] ?? u?.name ?? 'Pumble', text: (sig?.[2] ?? m.text) || '(plik)',
        sentAt: iso(m), threadRootId: m.threadRootId ?? null, createdAt: ts, updatedAt: ts,
        createdBy: (sig ? byName.get(sig[1]!) : u?.email && byEmail.get(u.email.toLowerCase())) || null,
      }).returning().get();
      recordChange(t, null, 'pumble_messages', row.id, 'create', null, row);
    }
    trim(t, j.id);
  });
  return fresh.length;
}

function trim(db: AppDeps['db'], jobId: string): void {
  const old = db.select().from(pumbleMessages).where(and(eq(pumbleMessages.jobId, jobId), isNull(pumbleMessages.deletedAt)))
    .orderBy(desc(pumbleMessages.sentAt), desc(pumbleMessages.id)).all().slice(KEEP);
  const ts = new Date().toISOString();
  for (const m of old) {
    const r = db.update(pumbleMessages).set({ deletedAt: ts, updatedAt: ts }).where(eq(pumbleMessages.id, m.id)).returning().get();
    recordChange(db, null, 'pumble_messages', m.id, 'delete', m, r);
  }
}

/**
 * Jeden obieg: ponowienie osób, kanały dla aktualnych zleceń bez kanału (do 5), nowe wiadomości (do 50 kanałów, po kolei w kółko).
 * Błąd całego Pumble przerywa obieg: jeden wpis w błędach i przerwa rosnąca od 1 min do 30 min. Błędy kanałów: jeden wpis na obieg.
 */
export async function pollTick(deps: AppDeps): Promise<void> {
  const p = deps.pumble;
  if (!p) return;
  const s = st(p), t = now(deps).getTime();
  if (s.running || t < s.backoffUntil) return; // poprzedni obieg trwa albo przerwa po awarii
  s.running = true;
  const errs: unknown[] = [];
  const one = async (f: () => Promise<unknown>) => { try { await f(); } catch (e) { if (isGlobalPumbleError(e)) throw e; errs.push(e); } };
  try {
    for (const id of [...s.pending]) {
      const j = svc.get(deps.db, id);
      if (j?.pumbleChannelId) await one(() => addPeople(deps, id, membersOf(deps, j)));
      s.pending.delete(id);
    }
    const open = svc.list(deps.db).filter((j) => group(deps, j) !== 'zamkniete').sort((a, b) => a.numer.localeCompare(b.numer));
    const todo = open.filter((j) => !j.pumbleChannelId && group(deps, j) === 'aktualne' && canTry(s, j.id, t)).slice(0, CREATE_PER_TICK);
    for (const j of todo) await one(() => ensureChannel(deps, j.id));
    // świeży odczyt: kanały założone przed chwilą też są odpytywane w tym obiegu
    const withCh = open.map((j) => svc.get(deps.db, j.id) ?? j).filter((j) => j.pumbleChannelId);
    const start = withCh.length ? s.rr % withCh.length : 0;
    const batch = [...withCh.slice(start), ...withCh.slice(0, start)].slice(0, PER_TICK);
    s.rr = start + batch.length;
    for (const j of batch) await one(() => pollJob(deps, p, j));
    s.backoffMs = 0;
  } catch (e) {
    if (!s.backoffMs) logError(deps.db, 'pumble', new Error(`Pumble nie odpowiada, odpytywanie wstrzymane (ponowienie co 1–30 min): ${e instanceof Error ? e.message : e}`));
    s.backoffMs = Math.min(BACKOFF_MAX, s.backoffMs ? s.backoffMs * 2 : BACKOFF_MIN);
    s.backoffUntil = t + s.backoffMs;
  } finally { s.running = false; }
  if (errs.length) logError(deps.db, 'pumble:obieg', new Error(`${errs.length} błędów kanałów w obiegu, pierwszy: ${errs[0] instanceof Error ? errs[0].message : errs[0]}`));
}

/** Odpytywanie co 20 s (pierwszy obieg od razu); zwraca stop(). */
export function startPoll(deps: AppDeps, ms = POLL_MS): () => void {
  const run = () => void pollTick(deps).catch((e) => logError(deps.db, 'pumble:tick', e));
  run();
  const t = setInterval(run, ms);
  return () => clearInterval(t);
}

/**
 * Wysyła z konta klucza (R32: bot nie pisze do kanałów prywatnych) z podpisem „Imię: ” i zapisuje wiadomość od razu.
 * Ten sam opId: do Pumble idzie raz (wynik zapisany w op_ids; równoległe powtórzenie czeka na pierwsze).
 */
export async function send(deps: AppDeps, user: User, jobId: string, text: string, opId?: string): Promise<unknown> {
  const p = deps.pumble!, s = st(p), j = svc.get(deps.db, jobId);
  if (!j) throw new HTTPException(404, { message: 'Nie znaleziono' });
  if (!j.pumbleChannelId) throw new HTTPException(409, { message: 'Kanał jeszcze nie utworzony' });
  if (opId) {
    const prev = deps.db.select().from(opIds).where(eq(opIds.opId, opId)).get();
    if (prev) { if (prev.userId !== user.id) throw new HTTPException(409, { message: 'Powtórzony identyfikator' }); return prev.result; }
    const flying = s.sending.get(opId);
    if (flying) return flying;
  }
  const run = (async () => {
    const r = await p.sendMessage({ channelId: j.pumbleChannelId!, text: `${user.name}: ${text}`, asBot: false });
    const ts = new Date().toISOString();
    const vals = { id: newId(), jobId, messageId: r.id, authorName: user.name, text, sentAt: ts, threadRootId: null, createdAt: ts, createdBy: user.id, updatedAt: ts, deletedAt: null };
    try {
      return runOp(deps.db, opId, user.id, () => {
        const row = deps.db.insert(pumbleMessages).values(vals).onConflictDoNothing().returning().get();
        if (row) { recordChange(deps.db, user.id, 'pumble_messages', row.id, 'create', null, row); trim(deps.db, jobId); }
        return row ?? deps.db.select().from(pumbleMessages).where(eq(pumbleMessages.messageId, r.id)).get()!;
      }).result;
    } catch (e) {
      // wiadomość już poszła: bez 500, obieg i tak ją dopisze
      logError(deps.db, 'pumble:zapis', e, user.id);
      return vals;
    }
  })().finally(() => { if (opId) s.sending.delete(opId); });
  if (opId) s.sending.set(opId, run);
  return run;
}

/** Adres kanału w Pumble (web); bez kanału lub przy błędzie: strona główna Pumble. */
export async function link(deps: AppDeps, jobId: string): Promise<string> {
  const p = deps.pumble!, ch = svc.get(deps.db, jobId)?.pumbleChannelId;
  if (!ch) return 'https://app.pumble.com';
  const ws = await owner(p).then((m) => m.workspaceId, (e) => { logError(deps.db, 'pumble:link', e); return undefined; });
  return ws ? `https://app.pumble.com/workspace/${ws}/${ch}` : 'https://app.pumble.com';
}

/** Wiadomości zlecenia (od najstarszej); do testów i odczytu. */
export const messages = (db: AppDeps['db'], jobId: string) =>
  db.select().from(pumbleMessages).where(and(eq(pumbleMessages.jobId, jobId), isNull(pumbleMessages.deletedAt))).orderBy(asc(pumbleMessages.sentAt)).all();
