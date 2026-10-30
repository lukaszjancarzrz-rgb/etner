import { createHash } from 'node:crypto';
import { and, asc, eq, gte, isNull, lte } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { addDays, dayOf, isWorkday, newId, plHolidays, type ScheduleProposal, type ScheduleSlot } from '@etner/shared';
import { recordChange } from '../../core/changes.js';
import type { Db } from '../../core/db.js';
import * as klienci from '../klienci/service.js';
import * as samochody from '../samochody/service.js';
import * as slowniki from '../slowniki/service.js';
import * as users from '../uzytkownicy/service.js';
import * as zlecenia from '../zlecenia/service.js';
import type { Outbox } from '../zlecenia/service.js';
import { dictRefsFor } from '../../core/dict-refs.js';
import { scheduleDrafts, scheduleEntries, scheduleNotes } from './schema.js';

/** Słowniki: kod nieobecności we wpisach harmonogramu. */
export const dictRefs = dictRefsFor('schedule_entries', scheduleEntries, { kod_nieobecnosci: scheduleEntries.kod });

export type EntryRow = typeof scheduleEntries.$inferSelect;
export type DraftRow = typeof scheduleDrafts.$inferSelect;
type Note = { tekst: string };
export type DraftOut = { key: string; dzien: string; personId: string | null; proposal: ScheduleProposal; proposalHash: string; by: string; at: string };

const bad = (m: string) => new HTTPException(400, { message: m });
const MAX_DAYS = 400;
const UWAGI = 'uwagi';

/** Dni [from, to] po kalendarzu (addDays liczy w południe UTC, więc zmiana czasu nie gubi ani nie dubluje dnia). */
export function daysIn(from: string, to: string): string[] {
  if (from > to) throw bad('Data „od” jest po dacie „do”');
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (out.push(d) > MAX_DAYS) throw bad(`Zakres najwyżej ${MAX_DAYS} dni`);
  return out;
}

const canon = (v: unknown): string =>
  Array.isArray(v) ? `[${v.map(canon).join(',')}]`
    : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(',')}}`
      : JSON.stringify(v);
export const proposalHash = (p: unknown): string => createHash('sha256').update(canon(p)).digest('hex');
const keyOf = (dzien: string, personId: string | null) => `${dzien}|${personId ?? UWAGI}`;

const live = isNull(scheduleEntries.deletedAt);
const cellRows = (db: Db, dzien: string, personId: string): EntryRow[] =>
  db.select().from(scheduleEntries).where(and(live, eq(scheduleEntries.dzien, dzien), eq(scheduleEntries.personId, personId))).orderBy(asc(scheduleEntries.slot)).all();
const toSlot = (e: EntryRow): ScheduleSlot =>
  e.rodzaj === 'zlecenie' ? { rodzaj: 'zlecenie', jobId: e.jobId!, polDnia: e.polDnia }
    : e.rodzaj === 'kod' ? { rodzaj: 'kod', kod: e.kod!, polDnia: e.polDnia }
      : { rodzaj: 'tekst', tekst: e.tekst!, polDnia: e.polDnia };
const noteRow = (db: Db, dzien: string) =>
  db.select().from(scheduleNotes).where(and(isNull(scheduleNotes.deletedAt), eq(scheduleNotes.dzien, dzien))).get();
/** Stan zatwierdzony w kształcie propozycji. */
const current = (db: Db, dzien: string, personId: string | null): ScheduleProposal =>
  personId ? cellRows(db, dzien, personId).map(toSlot) : { tekst: noteRow(db, dzien)?.tekst ?? '' };

const draftRow = (db: Db, dzien: string, personId: string | null) =>
  db.select().from(scheduleDrafts).where(and(isNull(scheduleDrafts.deletedAt), eq(scheduleDrafts.dzien, dzien),
    personId ? eq(scheduleDrafts.personId, personId) : isNull(scheduleDrafts.personId))).get();
const draftOut = (d: DraftRow): DraftOut => ({ key: keyOf(d.dzien, d.personId), dzien: d.dzien, personId: d.personId,
  proposal: d.proposal as ScheduleProposal, proposalHash: proposalHash(d.proposal), by: d.by, at: d.at });

export const drafts = (db: Db, from?: string, to?: string): DraftOut[] =>
  db.select().from(scheduleDrafts).where(and(isNull(scheduleDrafts.deletedAt),
    from ? gte(scheduleDrafts.dzien, from) : undefined, to ? lte(scheduleDrafts.dzien, to) : undefined))
    .orderBy(asc(scheduleDrafts.dzien)).all().map(draftOut);

function removeDraft(db: Db, by: string, d: DraftRow): void {
  const now = new Date().toISOString();
  const row = db.update(scheduleDrafts).set({ deletedAt: now, updatedAt: now }).where(eq(scheduleDrafts.id, d.id)).returning().get();
  recordChange(db, by, 'schedule_drafts', d.id, 'delete', d, row);
}

const extraOff = (db: Db) => slowniki.list(db, 'dzien_wolny').map((r) => r.wartosc);

function validate(db: Db, people: string[], value: ScheduleProposal): void {
  const known = new Set(users.listPeople(db).map((p) => p.id));
  for (const p of people) if (p !== UWAGI && !known.has(p)) throw bad('Nie znaleziono osoby w harmonogramie');
  const isNote = !Array.isArray(value);
  if (people.some((p) => (p === UWAGI) !== isNote)) throw bad(isNote ? 'Uwaga dnia tylko w wierszu uwag' : 'W wierszu uwag wpisz tekst');
  if (isNote) return;
  const kody = new Set(slowniki.list(db, 'kod_nieobecnosci').map((r) => r.wartosc));
  for (const s of value) {
    if (s.rodzaj === 'zlecenie' && !zlecenia.get(db, s.jobId)) throw bad('Nie znaleziono zlecenia');
    if (s.rodzaj === 'kod' && !kody.has(s.kod)) throw bad('Nieznany kod nieobecności');
  }
}

/** Wywołuj w runOp. Jeden szkic na komórkę; szkic równy stanowi zatwierdzonemu znika. */
export function setDraft(db: Db, by: string, d: { from: string; to: string; people: string[]; value: ScheduleProposal; workdaysOnly: boolean }): DraftOut[] {
  validate(db, d.people, d.value);
  const off = extraOff(db);
  const hash = proposalHash(d.value);
  const now = new Date().toISOString();
  const out: DraftOut[] = [];
  for (const dzien of daysIn(d.from, d.to)) {
    if (d.workdaysOnly && isWorkday(dzien, off) !== 1) continue;
    for (const p of d.people) {
      const personId = p === UWAGI ? null : p;
      const old = draftRow(db, dzien, personId);
      if (proposalHash(current(db, dzien, personId)) === hash) {
        if (old) removeDraft(db, by, old);
        continue;
      }
      const row = old
        ? db.update(scheduleDrafts).set({ proposal: d.value, by, at: now, updatedAt: now }).where(eq(scheduleDrafts.id, old.id)).returning().get()
        : db.insert(scheduleDrafts).values({ id: newId(), dzien, personId, proposal: d.value, by, at: now, createdAt: now, createdBy: by, updatedAt: now }).returning().get();
      recordChange(db, by, 'schedule_drafts', row.id, old ? 'update' : 'create', old ?? null, row);
      out.push(draftOut(row));
    }
  }
  return out;
}

/** Wywołuj w runOp. Usuwa podane szkice (wszystkie, gdy brak kluczy). */
export function discard(db: Db, by: string, keys?: string[]): number {
  const want = keys && new Set(keys);
  const rows = db.select().from(scheduleDrafts).where(isNull(scheduleDrafts.deletedAt)).all().filter((d) => !want || want.has(keyOf(d.dzien, d.personId)));
  for (const d of rows) removeDraft(db, by, d);
  return rows.length;
}

const cellLabel = (db: Db, slots: ScheduleSlot[]): string =>
  slots.map((s) => (s.rodzaj === 'zlecenie' ? ((j) => (j ? zlecenia.jobLabel(db, j) : '?'))(zlecenia.get(db, s.jobId)) : s.rodzaj === 'kod' ? s.kod : s.tekst)).join(' / ') || '—';
const WD = ['ndz', 'pon', 'wto', 'śro', 'czw', 'pią', 'sob'];
const dayLabel = (dzien: string, today: string): string =>
  dzien === today ? 'dziś' : dzien === addDays(today, 1) ? 'jutro'
    : `${WD[new Date(`${dzien}T12:00:00Z`).getUTCDay()]} ${dzien.slice(8, 10)}.${dzien.slice(5, 7)}`;

/**
 * Wywołuj w runOp. Zatwierdza szkice o zgodnym hashu (bez `items` – wszystkie bieżące).
 * Szkic zmieniony w międzyczasie przez innego admina zostaje. Powiadomienia trafiają do `out`.
 */
export function approve(db: Db, by: string, items: { key: string; proposalHash: string }[] | undefined, now: Date, out: Outbox = [], jobsTouched = new Set<string>()): { applied: string[]; skipped: string[] } {
  const seen = items && new Map(items.map((i) => [i.key, i.proposalHash]));
  const applied: string[] = [], skipped: string[] = [];
  const people = new Map(users.listPeople(db).map((p) => [p.id, p]));
  const changed = new Map<string, { dzien: string; personId: string; line: string }[]>();
  const ts = new Date().toISOString();
  const today = dayOf(now);
  for (const d of db.select().from(scheduleDrafts).where(isNull(scheduleDrafts.deletedAt)).orderBy(asc(scheduleDrafts.dzien)).all()) {
    const key = keyOf(d.dzien, d.personId);
    if (seen && !seen.has(key)) continue;
    if (seen && seen.get(key) !== proposalHash(d.proposal)) { skipped.push(key); continue; }
    if (d.personId && proposalHash(current(db, d.dzien, d.personId)) === proposalHash(d.proposal)) {
      // szkic równy komórce (np. zmieniona w międzyczasie na tę samą wartość): bez nowych wierszy i zmian („nowe” u pracownika)
    } else if (d.personId) {
      const old = cellRows(db, d.dzien, d.personId);
      for (const e of old) {
        const row = db.update(scheduleEntries).set({ deletedAt: ts, updatedAt: ts }).where(eq(scheduleEntries.id, e.id)).returning().get();
        recordChange(db, by, 'schedule_entries', e.id, 'delete', e, row);
      }
      const slots = d.proposal as ScheduleSlot[];
      slots.forEach((s, slot) => {
        if (s.rodzaj === 'zlecenie') jobsTouched.add(s.jobId);
        const row = db.insert(scheduleEntries).values({ id: newId(), dzien: d.dzien, personId: d.personId!, rodzaj: s.rodzaj,
          jobId: s.rodzaj === 'zlecenie' ? s.jobId : null, kod: s.rodzaj === 'kod' ? s.kod : null, tekst: s.rodzaj === 'tekst' ? s.tekst : null,
          polDnia: s.polDnia, slot, createdAt: ts, createdBy: by, updatedAt: ts }).returning().get();
        recordChange(db, by, 'schedule_entries', row.id, 'create', null, row);
      });
      const [a, b] = [cellLabel(db, old.map(toSlot)), cellLabel(db, slots)];
      const uid = people.get(d.personId)?.userId;
      if (uid && uid !== by && a !== b) changed.set(uid, [...(changed.get(uid) ?? []), { dzien: d.dzien, personId: d.personId, line: `${dayLabel(d.dzien, today)}: ${a} → ${b}` }]);
    } else {
      const tekst = (d.proposal as Note).tekst;
      const old = noteRow(db, d.dzien);
      if (old) {
        const row = db.update(scheduleNotes).set(tekst ? { tekst, updatedAt: ts } : { deletedAt: ts, updatedAt: ts }).where(eq(scheduleNotes.id, old.id)).returning().get();
        recordChange(db, by, 'schedule_notes', old.id, tekst ? 'update' : 'delete', old, row);
      } else if (tekst) {
        const row = db.insert(scheduleNotes).values({ id: newId(), dzien: d.dzien, tekst, createdAt: ts, createdBy: by, updatedAt: ts }).returning().get();
        recordChange(db, by, 'schedule_notes', row.id, 'create', null, row);
      }
    }
    removeDraft(db, by, d);
    applied.push(key);
  }
  for (const [uid, list] of changed) {
    out.push({ userIds: [uid], n: {
      title: list.length === 1 ? '📅 Zmiana w Twoim harmonogramie' : `📅 Zmiany w Twoim harmonogramie (${list.length})`,
      body: list.slice(0, 6).map((l) => l.line).join('\n'), url: `#harm/${list[0]!.dzien}~${list[0]!.personId}`, tag: 'harm' } });
  }
  return { applied, skipped };
}

/** Naprawy aut w dniach [from, to] jako nakładka na osoby harmonogramu z ekipy auta (R41; wpisów nie zmienia). */
export function repairMarks(db: Db, from: string, to: string): { dzien: string; personId: string; tekst: string; faultId: string }[] {
  const people = users.listPeople(db);
  return samochody.repairsIn(db, from, to).flatMap((r) => {
    const crew = new Set(users.crewMembers(db, r.ekipa));
    return people.filter((p) => p.userId && crew.has(p.userId)).map((p) => ({ dzien: r.dzien, personId: p.id, tekst: `${r.auto} w naprawie`, faultId: r.faultId }));
  });
}

/** Dni z wpisami, świętami, uwagami i naprawami aut (`naprawy`); szkice tylko dla `withDrafts`. */
export function range(db: Db, from: string, to: string, withDrafts: boolean) {
  const list = daysIn(from, to);
  const marks = repairMarks(db, from, to);
  const off = extraOff(db);
  const entries = db.select().from(scheduleEntries).where(and(live, gte(scheduleEntries.dzien, from), lte(scheduleEntries.dzien, to)))
    .orderBy(asc(scheduleEntries.personId), asc(scheduleEntries.slot)).all();
  const notes = db.select().from(scheduleNotes).where(and(isNull(scheduleNotes.deletedAt), gte(scheduleNotes.dzien, from), lte(scheduleNotes.dzien, to))).all();
  const days = list.map((dzien) => {
    const info = plHolidays(Number(dzien.slice(0, 4)))[dzien] ?? (off.includes(dzien) ? dzien : undefined);
    const note = notes.find((n) => n.dzien === dzien)?.tekst;
    return { dzien, wd: isWorkday(dzien, off), ...(info && { info }), entries: entries.filter((e) => e.dzien === dzien), ...(note && { note }), naprawy: marks.filter((m) => m.dzien === dzien) };
  });
  return withDrafts ? { days, drafts: drafts(db, from, to) } : { days };
}

const jobEntries = (db: Db, jobId: string): EntryRow[] =>
  db.select().from(scheduleEntries).where(and(live, eq(scheduleEntries.jobId, jobId))).all();

/** Id aktywnych użytkowników przypisanych do zlecenia w harmonogramie (wyłączeni nie dostają powiadomień ani kanału Pumble). */
export const peopleForJob = (db: Db, jobId: string): string[] => {
  const people = new Map(users.listPeople(db).map((p) => [p.id, p.userId]));
  const on = new Set(users.activeIds(db));
  return [...new Set(jobEntries(db, jobId).map((e) => people.get(e.personId)).filter((u): u is string => !!u && on.has(u)))];
};

/** Pełny dzień = 1, pół = 0,5. */
export function jobDays(db: Db, jobId: string): { dni: number; od?: string; do?: string } {
  const rows = jobEntries(db, jobId);
  const e = rows.map((r) => r.dzien).sort();
  const dni = rows.reduce((s, r) => s + (r.polDnia ? 0.5 : 1), 0);
  return e.length ? { dni, od: e[0], do: e.at(-1) } : { dni };
}

/** „Gdzie jedziesz”: pierwszy dzień od dziś z wpisami osoby użytkownika. */
export function myNext(db: Db, userId: string, now: Date) {
  const person = users.listPeople(db).find((p) => p.userId === userId);
  if (!person) return null;
  const first = db.select().from(scheduleEntries).where(and(live, eq(scheduleEntries.personId, person.id), gte(scheduleEntries.dzien, dayOf(now))))
    .orderBy(asc(scheduleEntries.dzien)).limit(1).get();
  if (!first) return null;
  const entries = cellRows(db, first.dzien, person.id).map((e) => {
    const j = e.jobId ? zlecenia.get(db, e.jobId) : undefined;
    return j ? { ...e, job: { numer: j.numer, klient: klienci.get(db, j.clientId)?.nazwa ?? '', miejscowosc: (j.siteId && klienci.getSite(db, j.siteId)?.miejscowosc) || '' } } : e;
  });
  return { dzien: first.dzien, entries };
}
