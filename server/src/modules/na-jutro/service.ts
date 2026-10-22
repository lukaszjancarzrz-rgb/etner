import { and, asc, count, eq, isNull } from 'drizzle-orm';
import { newId, type ChecklistCreate } from '@etner/shared';
import { recordChange } from '../../core/changes.js';
import type { Db } from '../../core/db.js';
import { dictRefsFor } from '../../core/dict-refs.js';
import { checklists, checklistTemplates } from './schema.js';

/** Słowniki: ekipa w listach „na jutro”. */
export const dictRefs = dictRefsFor('checklists', checklists, { ekipa: checklists.ekipa });

export type ChecklistRow = typeof checklists.$inferSelect;

export const get = (db: Db, id: string): ChecklistRow | undefined =>
  db.select().from(checklists).where(and(eq(checklists.id, id), isNull(checklists.deletedAt))).get();
export const list = (db: Db, ekipa?: string): ChecklistRow[] =>
  db.select().from(checklists).where(and(isNull(checklists.deletedAt), ekipa === undefined ? undefined : eq(checklists.ekipa, ekipa)))
    .orderBy(asc(checklists.dzien), asc(checklists.createdAt)).all();
/** Niezabrane rzeczy na dany dzień (wszystkie ekipy). */
export const pending = (db: Db, dzien: string): ChecklistRow[] =>
  list(db).filter((r) => r.dzien === dzien && !r.zabrane);

export function create(db: Db, userId: string, d: Omit<ChecklistCreate, 'opId'>): ChecklistRow {
  const now = new Date().toISOString();
  const row = db.insert(checklists).values({ ...d, id: newId(), createdAt: now, createdBy: userId, updatedAt: now }).returning().get();
  recordChange(db, userId, 'checklists', row.id, 'create', null, row);
  return row;
}

function patch(db: Db, userId: string, id: string, set: Partial<typeof checklists.$inferInsert>, action: 'update' | 'delete' = 'update'): ChecklistRow | undefined {
  const old = get(db, id);
  if (!old) return undefined;
  const row = db.update(checklists).set({ ...set, updatedAt: new Date().toISOString() }).where(eq(checklists.id, id)).returning().get();
  recordChange(db, userId, 'checklists', id, action, old, row);
  return row;
}

export const update = (db: Db, userId: string, id: string, d: Partial<Pick<ChecklistRow, 'tekst' | 'dzien' | 'ekipa'>>) =>
  patch(db, userId, id, Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)));
export const setZabrane = (db: Db, userId: string, id: string, zabrane: boolean) =>
  patch(db, userId, id, zabrane ? { zabrane, zabraneBy: userId, zabraneAt: new Date().toISOString() } : { zabrane, zabraneBy: null, zabraneAt: null });
export const remove = (db: Db, userId: string, id: string) =>
  patch(db, userId, id, { deletedAt: new Date().toISOString() }, 'delete');

// Listy predefiniowane (18j)
export type TemplateRow = typeof checklistTemplates.$inferSelect;
type TemplateInput = Partial<Pick<TemplateRow, 'nazwa' | 'kategorie' | 'rodzaje' | 'pozycje' | 'kolejnosc'>>;

export const getTemplate = (db: Db, id: string): TemplateRow | undefined =>
  db.select().from(checklistTemplates).where(and(eq(checklistTemplates.id, id), isNull(checklistTemplates.deletedAt))).get();
export const listTemplates = (db: Db): TemplateRow[] =>
  db.select().from(checklistTemplates).where(isNull(checklistTemplates.deletedAt)).orderBy(asc(checklistTemplates.kolejnosc), asc(checklistTemplates.nazwa)).all();

export function createTemplate(db: Db, userId: string | null, d: TemplateInput & { nazwa: string }): TemplateRow {
  const now = new Date().toISOString();
  const row = db.insert(checklistTemplates).values({ kategorie: [], rodzaje: [], pozycje: [], kolejnosc: listTemplates(db).length, ...d, id: newId(), createdAt: now, createdBy: userId, updatedAt: now }).returning().get();
  recordChange(db, userId, 'checklist_templates', row.id, 'create', null, row);
  return row;
}

export function updateTemplate(db: Db, userId: string, id: string, d: TemplateInput, del = false): TemplateRow | undefined {
  const old = getTemplate(db, id);
  if (!old) return undefined;
  const now = new Date().toISOString();
  const set = Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined));
  const row = db.update(checklistTemplates).set({ ...set, updatedAt: now, ...(del && { deletedAt: now }) }).where(eq(checklistTemplates.id, id)).returning().get();
  recordChange(db, userId, 'checklist_templates', id, del ? 'delete' : 'update', old, row);
  return row;
}

const SEED_TEMPLATES: [string[], string[]][] = [
  [['Elektryka', 'Fotowoltaika'], ['Elektryka', 'Montaż fotowoltaiki', 'Alarm', 'Kamery']],
  [['Rekuperacja'], ['Reku przygotówka', 'Reku rozkładanie instalacji', 'Montaż rekuperatora']],
  [['Klimatyzacja'], ['Rozciąganie rur klimy', 'Montaż klimy']],
];
/** Idempotentne: listy właściciela (bez pozycji) tylko do pustej tabeli (usunięte wiersze też się liczą). Z wpisem w changes: działające już telefony dostaną je bez snapshotu. */
export function seedTemplates(db: Db): void {
  if (db.select({ n: count() }).from(checklistTemplates).get()!.n > 0) return;
  let k = 0;
  for (const [kategorie, nazwy] of SEED_TEMPLATES) for (const nazwa of nazwy) createTemplate(db, null, { nazwa, kategorie, kolejnosc: k++ });
}
