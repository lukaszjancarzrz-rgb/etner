import { and, eq, inArray, isNull } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { newId, type DiaryCreate, type User } from '@etner/shared';
import type { Diary } from '../../app.js';
import { recordChange } from '../../core/changes.js';
import { tx, type Db } from '../../core/db.js';
import type { Notification } from '../../core/notify.js';
import { can } from '../../core/permissions.js';
import * as leady from '../leady/service.js';
import * as users from '../uzytkownicy/service.js';
import * as zlecenia from '../zlecenia/service.js';
import { attachments, diaryEntries } from './schema.js';

export type EntryRow = typeof diaryEntries.$inferSelect;
export type AttachmentRow = typeof attachments.$inferSelect;
export type Outbox = { userIds: string[]; n: Notification }[];

const bad = (m: string) => new HTTPException(400, { message: m });
const NOW = () => new Date().toISOString();

export const getEntry = (db: Db, id: string): EntryRow | undefined =>
  db.select().from(diaryEntries).where(and(eq(diaryEntries.id, id), isNull(diaryEntries.deletedAt))).get();
export const getAttachment = (db: Db, id: string): AttachmentRow | undefined =>
  db.select().from(attachments).where(and(eq(attachments.id, id), isNull(attachments.deletedAt))).get();
const attachmentsOf = (db: Db, ownerType: 'entry' | 'scope', ownerId: string): AttachmentRow[] =>
  db.select().from(attachments).where(and(eq(attachments.ownerType, ownerType), eq(attachments.ownerId, ownerId), isNull(attachments.deletedAt))).all();

/** Wpis leada widzi tylko osoba z uprawnieniem `leady`; wpis zlecenia każdy. */
export const canSee = (user: Pick<User, 'role' | 'perms'>, e: Pick<EntryRow, 'ownerType'>): boolean =>
  e.ownerType === 'job' || can(user, 'leady');

/** Wpis systemowy (bez autora, bez powiadomień); bezpieczny w transakcji. */
export function addSystem(db: Db, owner: { type: 'job' | 'lead'; id: string }, tekst: string): void {
  const now = NOW();
  const row = db.insert(diaryEntries).values({ id: newId(), ownerType: owner.type, ownerId: owner.id, authorId: null, tekst, createdAt: now, createdBy: null, updatedAt: now }).returning().get();
  recordChange(db, null, 'diary_entries', row.id, 'create', null, row);
}
export const diaryOf = (db: Db): Diary => ({ addSystem: (owner, tekst) => addSystem(db, owner, tekst) });

type Owner = 'entry' | 'scope';
/** Pliki z POST /api/uploads: wszystkie istnieją, są niepodpięte i wgrał je ten użytkownik (inaczej 400). */
export function checkUploads(db: Db, userId: string, uploads: string[]): AttachmentRow[] {
  const ids = [...new Set(uploads)];
  const ups = ids.length ? db.select().from(attachments).where(inArray(attachments.id, ids)).all() : [];
  if (ups.length !== ids.length || ups.some((a) => a.ownerType !== null || a.authorId !== userId || a.deletedAt)) throw bad('Nieprawidłowy plik do podpięcia');
  return ups;
}
/** Podpina sprawdzone pliki (checkUploads) do właściciela; dopiero wtedy trafiają do synchronizacji. */
export function attach(db: Db, userId: string, ups: AttachmentRow[], ownerType: Owner, ownerId: string): void {
  const now = NOW();
  for (const u of ups) {
    const a = db.update(attachments).set({ ownerType, ownerId, updatedAt: now }).where(eq(attachments.id, u.id)).returning().get();
    recordChange(db, userId, 'attachments', a.id, 'create', null, a);
  }
}
/** Miękkie usunięcie załączników właściciela (razem z wpisem albo punktem zakresu); `ids` = tylko te (każde musi należeć do właściciela, inaczej 400). */
export function removeAttachmentsOf(db: Db, userId: string, ownerType: Owner, ownerId: string, ids?: string[]): void {
  const now = NOW();
  const own = attachmentsOf(db, ownerType, ownerId);
  if (ids?.some((id) => !own.some((a) => a.id === id))) throw bad('Nieprawidłowe zdjęcie do usunięcia');
  for (const a of ids ? own.filter((x) => ids.includes(x.id)) : own) {
    const row = db.update(attachments).set({ deletedAt: now, updatedAt: now }).where(eq(attachments.id, a.id)).returning().get();
    recordChange(db, userId, 'attachments', a.id, 'delete', a, row);
  }
}

/** Wywołuj w runOp. Zakłada, że pliki są już w magazynie (POST /api/uploads). */
export function create(db: Db, user: User, input: DiaryCreate, peopleForJob: (jobId: string) => string[], out: Outbox): EntryRow {
  const { owner_type: type, owner_id: ownerId, tekst } = input;
  if (type === 'lead') {
    if (!can(user, 'leady')) throw new HTTPException(403, { message: 'BRAK_UPRAWNIEN' });
    if (!leady.get(db, ownerId)) throw new HTTPException(404, { message: 'Nie znaleziono' });
  } else if (!zlecenia.get(db, ownerId)) throw new HTTPException(404, { message: 'Nie znaleziono' });

  const ups = checkUploads(db, user.id, input.uploads);
  const now = NOW();
  const entry = db.insert(diaryEntries).values({ id: newId(), ownerType: type, ownerId, authorId: user.id, tekst, createdAt: now, createdBy: user.id, updatedAt: now }).returning().get();
  recordChange(db, user.id, 'diary_entries', entry.id, 'create', null, entry);
  attach(db, user.id, ups, 'entry', entry.id);

  const photos = ups.filter((a) => a.rodzaj === 'zdjecie').length;
  const body = `${user.name}: ${tekst.slice(0, 200)}${photos ? ` 📷 ${photos}` : ''}`;
  if (type === 'lead') {
    const l = leady.get(db, ownerId)!;
    out.push({ userIds: users.admins(db).filter((u) => u !== user.id), n: { title: `📝 Nowy wpis w dzienniku: ${leady.leadLabel(db, l)}`, body, url: `#ld/${ownerId}~${entry.id}`, tag: `dz-${entry.id}` } });
  } else {
    const job = zlecenia.get(db, ownerId)!;
    const label = zlecenia.jobLabel(db, job);
    const crew = job.ekipa && job.ekipa !== 'mieszane' ? users.crewMembers(db, job.ekipa) : [];
    const to = [...new Set([...users.admins(db), ...peopleForJob(job.id), ...crew])].filter((u) => u !== user.id);
    out.push({ userIds: to, n: { title: `📝 Nowy wpis w dzienniku: ${label}`, body, url: `#zl/${job.id}~${entry.id}`, tag: `dz-${entry.id}` } });
  }
  return entry;
}

/** Admin albo autor; miękko, razem z załącznikami. Już usunięty = true (powtórka z kolejki offline). */
export function remove(db: Db, user: User, id: string): boolean {
  const e = db.select().from(diaryEntries).where(eq(diaryEntries.id, id)).get();
  if (!e || !canSee(user, e)) return false;
  if (!can(user, 'admin') && e.authorId !== user.id) throw new HTTPException(403, { message: 'BRAK_UPRAWNIEN' });
  if (e.deletedAt) return true;
  tx(db, () => {
    removeAttachmentsOf(db, user.id, 'entry', id);
    const now = NOW();
    const row = db.update(diaryEntries).set({ deletedAt: now, updatedAt: now }).where(eq(diaryEntries.id, id)).returning().get();
    recordChange(db, user.id, 'diary_entries', id, 'delete', e, row);
  });
  return true;
}

export function setKlient(db: Db, userId: string, kind: 'entry' | 'attachment', id: string, v: boolean): EntryRow | AttachmentRow | undefined {
  const now = NOW();
  if (kind === 'entry') {
    const old = getEntry(db, id);
    if (!old) return undefined;
    const row = db.update(diaryEntries).set({ dlaKlienta: v, updatedAt: now }).where(eq(diaryEntries.id, id)).returning().get();
    recordChange(db, userId, 'diary_entries', id, 'update', old, row);
    return row;
  }
  const old = getAttachment(db, id);
  if (!old || (old.ownerType !== 'entry' && old.ownerType !== 'scope')) return undefined;
  const row = db.update(attachments).set({ dlaKlienta: v, updatedAt: now }).where(eq(attachments.id, id)).returning().get();
  recordChange(db, userId, 'attachments', id, 'update', old, row);
  return row;
}
