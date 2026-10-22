import { addDays } from '@etner/shared';
import type { Rec } from './store.js';

/**
 * „Nowe” w zleceniach (jedno źródło dla listy i menu): wpisy dziennika innych osób, wiadomości Pumble innych osób, zmienione punkty
 * zakresu i zmienione zlecenie, nowsze niż `since(jobId)`. Własne zmiany robi się z otwartej karty,
 * a karta przy wyjściu zapisuje wizytę, więc nie liczą się jako nowe; wyjątek: zlecenie dodane przez siebie.
 * Zmiana samego zlecenia liczy się tylko dla admina (`jobRow`).
 */
export function freshByJob(jobs: Rec[], entries: Rec[], scope: Rec[], meId: string | undefined, since: (jobId: string) => string, jobRow = true, pumble: Rec[] = []): Map<string, number> {
  const m = new Map<string, number>();
  const s = new Map<string, string>();
  const at = (id: string) => s.get(id) ?? (s.set(id, since(id)), s.get(id)!);
  const bump = (id: string) => m.set(id, (m.get(id) ?? 0) + 1);
  for (const e of entries) if (e.ownerType === 'job' && !e._tmp && e.authorId !== meId && e.createdAt > at(e.ownerId)) bump(e.ownerId);
  for (const p of pumble) if (p.createdBy !== meId && p.createdAt > at(p.jobId)) bump(p.jobId);
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
 * Harmonogram: dzień → najpóźniejsza zmiana wpisów mojego wiersza (admin bez wiersza: wszystkich osób).
 * Własne zmiany (zatwierdzone przeze mnie) pomijamy; dni przed `from` też (stare obejrzenia są czyszczone).
 * shortcut: wyczyszczona komórka znika ze sklepu i nie jest liczona; liczyć usunięcia, gdy synchronizacja zacznie je przechowywać.
 */
export function changedDays(entries: Rec[], people: Rec[], me: { id: string; role: string } | null | undefined, from = ''): Map<string, string> {
  const m = new Map<string, string>();
  if (!me) return m;
  const mine = new Set(people.filter((p) => p.userId === me.id).map((p) => p.id));
  const all = !mine.size && me.role === 'admin';
  if (!mine.size && !all) return m;
  for (const e of entries) {
    if (e._tmp || e.dzien < from || e.createdBy === me.id || (!all && !mine.has(e.personId))) continue;
    if (e.updatedAt > (m.get(e.dzien) ?? '')) m.set(e.dzien, e.updatedAt);
  }
  return m;
}

/** Zmienione dni, których po zmianie nie było widać na ekranie (`seen(dzien)`: ostatnie obejrzenie dnia). */
export const unseenDays = (changed: Map<string, string>, seen: (dzien: string) => string): string[] =>
  [...changed].filter(([d, at]) => at > seen(d)).map(([d]) => d).sort();

/** Dni obejrzane na ekranie harmonogramu: zapis „widziane” dopiero przy wyjściu z ekranu (`flush`), żeby „nowe” zostało na ekranie. */
export class ViewedDays {
  private days = new Set<string>();
  add(d: string) { this.days.add(d); }
  /** Zapisuje obejrzane dni (`mark`) i czyści zbiór; zwraca zapisane. */
  flush(mark: (d: string) => void): string[] {
    const out = [...this.days].sort();
    this.days.clear();
    for (const d of out) mark(d);
    return out;
  }
}

/** Klucze `harm-day:<user>:<dzień>` z dniem przed `cut` (do usunięcia z localStorage). */
export const staleDayKeys = (keys: string[], cut: string): string[] => keys.filter((k) => k.startsWith('harm-day:') && k.slice(-10) < cut);

/** Zakupy: admin widzi liczbę „Do kupienia” (pierwszy status słownika), pracownik nic. */
export const zakupyCount = (items: Rec[], firstStatus: string | undefined, admin: boolean): number =>
  admin && firstStatus ? items.filter((i) => i.status === firstStatus).length : 0;

/** „99+” powyżej 99. */
export const badgeText = (n: number) => (n > 99 ? '99+' : String(n));
