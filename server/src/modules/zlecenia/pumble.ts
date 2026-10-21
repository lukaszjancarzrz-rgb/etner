// Kanał Pumble przy zleceniu (zadanie 18g). Wszystko tutaj działa po zatwierdzeniu zapisu zlecenia; błąd Pumble nigdy go nie cofa.
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { newId, type User } from '@etner/shared';
import type { AppDeps } from '../../app.js';
import { recordChange } from '../../core/changes.js';
import { tx } from '../../core/db.js';
import { logError } from '../../core/errors.js';
import type { PumbleClient, PumbleMessage, PumbleUser } from '../../core/pumble.js';
import * as klienci from '../klienci/service.js';
import * as slowniki from '../slowniki/service.js';
import * as users from '../uzytkownicy/service.js';
import { jobs, pumbleMessages } from './schema.js';
import * as svc from './service.js';

export const POLL_MS = 20_000;
const USERS_TTL = 10 * 60_000, RETRY_MS = 5 * 60_000, KEEP = 50, PER_TICK = 50, CREATE_PER_TICK = 10;

/** Stan w pamięci procesu, osobno dla każdego klienta (testy mają własne atrapy). shortcut: jedna instancja serwera; przy kilku przenieść do bazy. */
type St = { users?: { at: number; list: PumbleUser[] }; workspaceId?: string; tried: Map<string, number>; added: Map<string, Set<string>>;
  missLogged: Set<string>; inflight: Map<string, Promise<svc.JobRow>>; rr: number; running: boolean };
const states = new WeakMap<PumbleClient, St>();
const st = (p: PumbleClient): St => {
  let s = states.get(p);
  if (!s) states.set(p, (s = { tried: new Map(), added: new Map(), missLogged: new Set(), inflight: new Map(), rr: 0, running: false }));
  return s;
};
const now = (deps: AppDeps) => (deps.now ?? (() => new Date()))();
const live = (deps: AppDeps, j: svc.JobRow) => slowniki.groupOf(deps.db, 'status_zlecenia', j.status) !== 'zamkniete';

/** Nazwa kanału: małe litery ASCII, cyfry i myślniki, najwyżej 80 znaków. */
export function channelSlug(...parts: string[]): string {
  return parts.filter(Boolean).join('-').replace(/ł/g, 'l').replace(/Ł/g, 'L').normalize('NFD').replace(/[̀-ͯ]/g, '')
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

/** Admini, ekipa zlecenia (bez „mieszane”) i osoby z harmonogramu. */
export const membersOf = (deps: AppDeps, j: svc.JobRow): string[] => [...new Set([
  ...users.admins(deps.db),
  ...(j.ekipa && j.ekipa !== 'mieszane' ? users.crewMembers(deps.db, j.ekipa) : []),
  ...(deps.schedule?.peopleForJob?.(j.id) ?? []),
])];

/** Dodaje osoby (id użytkowników) do kanału zlecenia; konta łączone po e-mailu, bez dopasowania są pomijane (jeden wpis w błędach na zlecenie). */
export async function addPeople(deps: AppDeps, jobId: string, userIds: string[]): Promise<void> {
  const p = deps.pumble, j = svc.get(deps.db, jobId);
  if (!p || !j?.pumbleChannelId) return;
  const s = st(p);
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
  const added = s.added.get(j.pumbleChannelId) ?? new Set<string>();
  const todo = [...new Set(ids)].filter((i) => !added.has(i));
  if (!todo.length) return;
  await p.addUsers(j.pumbleChannelId, todo);
  for (const i of todo) added.add(i);
  s.added.set(j.pumbleChannelId, added);
}

/** Zakłada kanał (jeśli go nie ma) i dodaje osoby. Bez `force` najwyżej raz na 5 min na zlecenie. Rzuca przy błędzie Pumble. */
export function ensureChannel(deps: AppDeps, jobId: string, force = false): Promise<svc.JobRow | undefined> {
  const p = deps.pumble;
  const j = svc.get(deps.db, jobId);
  if (!p || !j || j.pumbleChannelId) return Promise.resolve(j);
  const s = st(p), t = now(deps).getTime();
  const pending = s.inflight.get(jobId);
  if (pending) return pending;
  if (!force && t - (s.tried.get(jobId) ?? -Infinity) < RETRY_MS) return Promise.resolve(j);
  s.tried.set(jobId, t);
  const run = (async () => {
    const { name, description } = channelInfo(deps, j);
    let free = name;
    for (let n = 2; await p.getChannel(free); n++) free = `${name.slice(0, 80 - String(n).length - 1).replace(/-+$/, '')}-${n}`;
    const ch = await p.createChannel({ name: free, type: 'PRIVATE', description });
    // id zapisujemy od razu, żeby błąd przy dodawaniu osób nie założył drugiego kanału
    const row = tx(deps.db, (db) => {
      const old = svc.get(db, jobId);
      if (!old) return undefined;
      // bez updatedAt: założenie kanału to nie „nowe” w zleceniu
      const r = db.update(jobs).set({ pumbleChannelId: ch.id }).where(eq(jobs.id, jobId)).returning().get();
      recordChange(db, null, 'jobs', jobId, 'update', old, r);
      return r;
    });
    if (row) await addPeople(deps, jobId, membersOf(deps, row)).catch((e) => logError(deps.db, 'pumble:dodaj', e));
    return row ?? j;
  })().finally(() => s.inflight.delete(jobId));
  s.inflight.set(jobId, run);
  return run;
}

const BOT_PREFIX = /^([^:\n]{1,60}): ([\s\S]+)$/;
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
  const ours = new Map(users.list(db).filter((u) => u.email).map((u) => [u.email!, u.id]));
  tx(db, (t) => {
    const ts = new Date().toISOString();
    for (const m of fresh) {
      const u = pu.get(m.author);
      const bot = !!m.authorAppId || !u || u.isAddonBot || u.isPumbleBot;
      const pre = bot ? BOT_PREFIX.exec(m.text ?? '') : null;
      const row = t.insert(pumbleMessages).values({
        id: newId(), jobId: j.id, messageId: m.id, authorName: pre?.[1] ?? u?.name ?? 'Pumble', text: (pre?.[2] ?? m.text) || '(plik)',
        sentAt: iso(m), threadRootId: m.threadRootId ?? null, createdAt: ts, createdBy: (u?.email && ours.get(u.email.toLowerCase())) || null, updatedAt: ts,
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

/** Jeden obieg odpytywania: kanały dla zleceń bez kanału (ponowienie) i nowe wiadomości (do 50 kanałów, po kolei w kółko). */
export async function pollTick(deps: AppDeps): Promise<void> {
  const p = deps.pumble;
  if (!p) return;
  const s = st(p);
  if (s.running) return; // poprzedni obieg jeszcze trwa
  s.running = true;
  try {
    const open = svc.list(deps.db).filter((j) => live(deps, j)).sort((a, b) => a.numer.localeCompare(b.numer));
    for (const j of open.filter((x) => !x.pumbleChannelId).slice(0, CREATE_PER_TICK)) await ensureChannel(deps, j.id).catch((e) => logError(deps.db, 'pumble:kanal', e));
    // świeży odczyt: kanały założone przed chwilą też są odpytywane w tym obiegu
    const withCh = open.map((j) => svc.get(deps.db, j.id) ?? j).filter((j) => j.pumbleChannelId);
    const start = withCh.length ? s.rr % withCh.length : 0;
    const batch = [...withCh.slice(start), ...withCh.slice(0, start)].slice(0, PER_TICK);
    s.rr = start + batch.length;
    for (const j of batch) await pollJob(deps, p, j).catch((e) => logError(deps.db, 'pumble:wiadomosci', e));
  } finally { s.running = false; }
}

/** Odpytywanie co 20 s (pierwszy obieg od razu); zwraca stop(). */
export function startPoll(deps: AppDeps, ms = POLL_MS): () => void {
  const run = () => void pollTick(deps).catch((e) => logError(deps.db, 'pumble:tick', e));
  run();
  const t = setInterval(run, ms);
  return () => clearInterval(t);
}

/** Wysyła jako bot z imieniem autora i zapisuje wiadomość od razu (nadawca widzi ją bez czekania na odpytanie). */
export async function send(deps: AppDeps, user: User, jobId: string, text: string) {
  const p = deps.pumble!, j = svc.get(deps.db, jobId);
  if (!j) throw new HTTPException(404, { message: 'Nie znaleziono' });
  if (!j.pumbleChannelId) throw new HTTPException(409, { message: 'Kanał jeszcze nie utworzony' });
  const r = await p.sendMessage({ channelId: j.pumbleChannelId, text: `${user.name}: ${text}`, asBot: true });
  return tx(deps.db, (t) => {
    const ts = new Date().toISOString();
    const row = t.insert(pumbleMessages).values({ id: newId(), jobId, messageId: r.id, authorName: user.name, text, sentAt: ts, createdAt: ts, createdBy: user.id, updatedAt: ts })
      .onConflictDoNothing().returning().get();
    if (row) { recordChange(t, user.id, 'pumble_messages', row.id, 'create', null, row); trim(t, jobId); }
    return row ?? t.select().from(pumbleMessages).where(eq(pumbleMessages.messageId, r.id)).get()!;
  });
}

/** Adres kanału w Pumble (web); bez kanału lub przy błędzie: strona główna Pumble. */
export async function link(deps: AppDeps, jobId: string): Promise<string> {
  const p = deps.pumble!, s = st(p), ch = svc.get(deps.db, jobId)?.pumbleChannelId;
  if (!ch) return 'https://app.pumble.com';
  s.workspaceId ??= await p.myInfo().then((m) => m.workspaceId, (e) => { logError(deps.db, 'pumble:link', e); return undefined; });
  return s.workspaceId ? `https://app.pumble.com/workspace/${s.workspaceId}/${ch}` : 'https://app.pumble.com';
}

/** Wiadomości zlecenia (od najstarszej); do testów i odczytu. */
export const messages = (db: AppDeps['db'], jobId: string) =>
  db.select().from(pumbleMessages).where(and(eq(pumbleMessages.jobId, jobId), isNull(pumbleMessages.deletedAt))).orderBy(asc(pumbleMessages.sentAt)).all();
