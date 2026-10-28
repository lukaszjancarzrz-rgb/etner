import { norm, phoneDigits } from '@etner/shared';

export type ClientDraft = { typ: 'osoba' | 'firma'; nazwa: string; telefony: string[]; emaile: string[]; nip: string; notatki: string };

export const badEmail = (m: string) => !!m.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.trim());

/** Formularz klienta → ciało PUT i błędy przy polach (`email.<i>` = wiersz e-maila). Puste wiersze list są pomijane. */
export function clientBody(f: ClientDraft): { body: ClientDraft; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const nazwa = f.nazwa.trim();
  if (!nazwa) errors.nazwa = 'Podaj nazwę klienta';
  f.emaile.forEach((m, i) => { if (badEmail(m)) errors[`email.${i}`] = 'Niepoprawny adres e-mail'; });
  const clean = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];
  return { body: { typ: f.typ, nazwa, telefony: clean(f.telefony), emaile: clean(f.emaile), nip: f.nip.trim(), notatki: f.notatki.trim() }, errors };
}

type C = { id: string; nazwa: string; telefony?: string[]; emaile?: string[]; nip?: string; notatki?: string; createdAt?: string };

/** Nazwa do porównania: bez wielkości liter, diakrytyków i interpunkcji, słowa w dowolnej kolejności („Kowalski Jan” = „jan kowalski”). */
export const nameKey = (s: string) => norm(s).replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').sort().join(' ');

export type DupPair<T extends C = C> = { a: T; b: T; why: ('nazwa' | 'telefon' | 'e-mail')[] };

/** Prawdopodobne duplikaty (R58): ta sama nazwa po normalizacji albo wspólny telefon / e-mail. `a` = starszy (proponowany główny). */
export function duplicatePairs<T extends C>(clients: T[]): DupPair<T>[] {
  const groups = new Map<string, T[]>();
  const add = (k: string, c: T) => { const g = groups.get(k); if (!g) groups.set(k, [c]); else if (!g.includes(c)) g.push(c); };
  for (const c of clients) {
    const n = nameKey(c.nazwa ?? '');
    if (n) add(`nazwa|${n}`, c);
    for (const t of c.telefony ?? []) { const d = phoneDigits(t); if (d.length >= 6) add(`telefon|${d}`, c); }
    for (const m of c.emaile ?? []) { const e = m.trim().toLowerCase(); if (e) add(`e-mail|${e}`, c); }
  }
  const pairs = new Map<string, DupPair<T>>();
  for (const [k, g] of groups) {
    const why = k.slice(0, k.indexOf('|')) as DupPair['why'][number];
    const sorted = [...g].sort((x, y) => (x.createdAt ?? '').localeCompare(y.createdAt ?? '') || x.id.localeCompare(y.id));
    for (let i = 0; i < sorted.length; i++) for (let j = i + 1; j < sorted.length; j++) {
      const [a, b] = [sorted[i]!, sorted[j]!];
      const p = pairs.get(`${a.id}|${b.id}`) ?? { a, b, why: [] };
      if (!p.why.includes(why)) p.why.push(why);
      pairs.set(`${a.id}|${b.id}`, p);
    }
  }
  return [...pairs.values()].sort((x, y) => x.a.nazwa.localeCompare(y.a.nazwa, 'pl'));
}

/** Klient główny po połączeniu (jak serwer, do podglądu od razu): telefony i e-maile razem, puste pola z duplikatu. */
export function mergedClient<T extends C>(main: T, dup: C): T {
  const union = (a: string[] = [], b: string[] = [], key: (x: string) => string) => [...a, ...b.filter((x) => !a.some((y) => key(y) === key(x)))];
  return { ...main, telefony: union(main.telefony, dup.telefony, phoneDigits), emaile: union(main.emaile, dup.emaile, (e) => e.toLowerCase()), nip: main.nip || dup.nip || '', notatki: main.notatki && dup.notatki && main.notatki !== dup.notatki ? `${main.notatki}\n${dup.notatki}` : main.notatki || dup.notatki || '' };
}
