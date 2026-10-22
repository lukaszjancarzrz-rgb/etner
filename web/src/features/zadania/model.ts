import type { Rec } from '../../core/store.js';

/** Literał jak na serwerze (seed słownika status_zadania). */
export const DONE = 'Zrobione';
/** Zrobione zostaje tylko zadanie niecykliczne (cykliczne serwer od razu przywraca). */
export const isDone = (t: Rec) => t.status === DONE && !t.cykliczne;
export const isLate = (t: Rec, today: string) => !isDone(t) && !!t.termin && t.termin < today;

const last = (v: unknown) => (v == null || v === '' ? '￿' : String(v).padStart(2, '0'));
/** Priorytet (1 najważniejszy, brak na końcu), potem termin (brak na końcu), potem kolejność dodania. */
export const byPriority = (a: Rec, b: Rec) =>
  last(a.priorytet).localeCompare(last(b.priorytet)) || last(a.termin).localeCompare(last(b.termin)) || String(a.createdAt).localeCompare(String(b.createdAt));

/** Otwarte zadania w grupach słownika (nieznana albo pusta grupa: „Bez grupy” na końcu) i osobno zrobione (od ostatnio zmienionego). */
export function taskGroups(tasks: Rec[], grupy: string[]) {
  const open = tasks.filter((t) => !isDone(t));
  const names = [...grupy, ''];
  const groups = names.map((g) => ({
    grupa: g,
    list: open.filter((t) => (grupy.includes(t.grupa) ? t.grupa : '') === g).sort(byPriority),
  })).filter((g) => g.list.length);
  const done = tasks.filter(isDone).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return { groups, done };
}
