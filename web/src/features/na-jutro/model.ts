import type { Rec } from '../../core/store.js';

/** Lista pasuje do zlecenia: kategoria z listy (pusta = każda) i, jeśli podano, rodzaj z listy; lista bez kategorii i rodzajów nie pasuje do niczego. */
export function fits(t: Rec, job: Rec): boolean {
  const k: string[] = t.kategorie ?? [], r: string[] = t.rodzaje ?? [];
  if (!k.length && !r.length) return false;
  return (!k.length || k.includes(job.kategoria)) && (!r.length || r.includes(job.rodzaj));
}

/**
 * Zlecenia, na które jedzie ekipa danego dnia (harmonogram): wpisy „zlecenie” tego dnia, gdy zlecenie jest tej ekipy,
 * wpis jest w moim wierszu albo w wierszu członka ekipy (`ekipaOf` zna ekipy tylko adminowi).
 */
export function dayJobIds(entries: Rec[], people: Rec[], day: string, ekipa: string | undefined, meId: string | undefined, jobs: Map<string, Rec>, ekipaOf: (userId: string) => string | null | undefined): string[] {
  const person = new Map(people.map((p) => [p.id, p]));
  const out = new Set<string>();
  for (const e of entries) {
    if (e.dzien !== day || e.rodzaj !== 'zlecenie' || !e.jobId) continue;
    const j = jobs.get(e.jobId), uid = person.get(e.personId)?.userId as string | undefined;
    if (j && ((ekipa && j.ekipa === ekipa) || (uid && (uid === meId || (ekipa && ekipaOf(uid) === ekipa))))) out.add(j.id);
  }
  return [...out];
}

/** Listy do pokazania: pasujące do zleceń dnia na górze (z tymi zleceniami), potem reszta; w grupie wg kolejności. */
export function rankTemplates<J extends Rec>(templates: Rec[], dayJobs: J[]): { t: Rec; jobs: J[] }[] {
  const all = [...templates].sort((a, b) => a.kolejnosc - b.kolejnosc || String(a.nazwa).localeCompare(b.nazwa, 'pl'))
    .map((t) => ({ t, jobs: dayJobs.filter((j) => fits(t, j)) }));
  return [...all.filter((x) => x.jobs.length), ...all.filter((x) => !x.jobs.length)];
}
