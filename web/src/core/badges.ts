import { addDays } from '@etner/shared';
import type { Rec } from './store.js';

/**
 * „Nowe” w zleceniach (jedno źródło dla listy i menu): wpisy dziennika innych osób, zmienione punkty
 * zakresu i zmienione zlecenie, nowsze niż `since(jobId)`. Własne zmiany robi się z otwartej karty,
 * a karta przy wyjściu zapisuje wizytę, więc nie liczą się jako nowe; wyjątek: zlecenie dodane przez siebie.
 * Zmiana samego zlecenia liczy się tylko dla admina (`jobRow`).
 */
export function freshByJob(jobs: Rec[], entries: Rec[], scope: Rec[], meId: string | undefined, since: (jobId: string) => string, jobRow = true): Map<string, number> {
  const m = new Map<string, number>();
  const s = new Map<string, string>();
  const at = (id: string) => s.get(id) ?? (s.set(id, since(id)), s.get(id)!);
  const bump = (id: string) => m.set(id, (m.get(id) ?? 0) + 1);
  for (const e of entries) if (e.ownerType === 'job' && !e._tmp && e.authorId !== meId && e.createdAt > at(e.ownerId)) bump(e.ownerId);
  for (const p of scope) if (!p._tmp && p.createdBy !== meId && p.updatedAt > at(p.jobId)) bump(p.jobId);
  // pracownik (jobRow=false): wiersz zlecenia pomijamy, bo zmiana mogła dotyczyć tylko uwag admina
  if (jobRow) for (const j of jobs) if (!j._tmp && j.updatedAt > at(j.id) && !(j.createdBy === meId && j.createdAt === j.updatedAt)) bump(j.id);
  return m;
}

/** Na jutro: niezabrane na dziś i jutro (Warszawa); pracownik tylko swojej ekipy, admin wszystkich. */
export function naJutroCount(items: Rec[], today: string, me: { role: string; ekipa?: string | null } | null | undefined): number {
  if (!me) return 0;
  const days = new Set([today, addDays(today, 1)]);
  return items.filter((i) => !i.zabrane && days.has(i.dzien) && (me.role === 'admin' || i.ekipa === me.ekipa)).length;
}

/**
 * Harmonogram: dni mojego wiersza zmienione od ostatniego wejścia na ekran (admin bez wiersza: 0).
 * shortcut: wyczyszczona komórka znika ze sklepu i nie jest liczona; liczyć usunięcia, gdy synchronizacja zacznie je przechowywać.
 */
export function harmonogramCount(entries: Rec[], people: Rec[], meId: string | undefined, since: string): number {
  const mine = new Set(people.filter((p) => meId && p.userId === meId).map((p) => p.id));
  if (!mine.size) return 0;
  return new Set(entries.filter((e) => mine.has(e.personId) && e.updatedAt > since).map((e) => `${e.personId}|${e.dzien}`)).size;
}

/** Zakupy: admin widzi liczbę „Do kupienia” (pierwszy status słownika), pracownik nic. */
export const zakupyCount = (items: Rec[], firstStatus: string | undefined, admin: boolean): number =>
  admin && firstStatus ? items.filter((i) => i.status === firstStatus).length : 0;

/** „99+” powyżej 99. */
export const badgeText = (n: number) => (n > 99 ? '99+' : String(n));
