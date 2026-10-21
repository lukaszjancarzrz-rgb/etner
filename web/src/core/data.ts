import { dayOf } from '@etner/shared';
import { useMemo } from 'react';
import { useSession } from './session.js';
import { useEntities, type Rec } from './store.js';

export const useMe = () => useSession().me;
export const useIsAdmin = () => useSession().me?.role === 'admin';

/** Wartości słownika w kolejności. */
export function useDict(rodzaj: string): Rec[] {
  const all = useEntities('dict');
  return useMemo(() => all.filter((d) => d.rodzaj === rodzaj).sort((a, b) => a.kolejnosc - b.kolejnosc), [all, rodzaj]);
}

/** Dane jeszcze nie przyszły (pierwsza synchronizacja): słowniki są zawsze niepuste. */
export const useLoading = () => useEntities('dict').length === 0;

/** Imię autora: pracownik widzi tylko swoje konto w `users`, więc nazwy bierzemy też z osób harmonogramu. */
export function useNames(): (userId: string | null | undefined) => string {
  const users = useEntities('users');
  const people = useEntities('schedule_people');
  return useMemo(() => {
    const m = new Map<string, string>();
    for (const p of people) if (p.userId) m.set(p.userId, p.nazwa);
    for (const u of users) m.set(u.id, u.name);
    return (id) => (id ? m.get(id) ?? 'Pracownik' : 'System');
  }, [users, people]);
}

/** Grupa statusu zlecenia wg słownika (aktualne / pozniej / zamkniete). */
export function useStatusGroup(): (status: string) => string {
  const st = useDict('status_zlecenia');
  return useMemo(() => {
    const m = new Map(st.map((d) => [d.wartosc, d.grupa ?? 'aktualne']));
    return (s) => m.get(s) ?? 'aktualne';
  }, [st]);
}

/** Paleta ekip: kolor ze słownika albo stała paleta. */
const PALETTE = ['#0070ab', '#00736b', '#8a5a00', '#7a3e9d', '#b3261e', '#3f5368'];
export function useCrewColor(): (ekipa: string | null | undefined) => string | undefined {
  const ek = useDict('ekipa');
  return useMemo(() => {
    const m = new Map(ek.filter((d) => d.wartosc !== 'mieszane').map((d, i) => [d.wartosc, d.kolor || PALETTE[i % PALETTE.length]!]));
    return (e) => (e ? m.get(e) : undefined);
  }, [ek]);
}

export const today = () => dayOf(new Date());

const WD = ['niedz.', 'pon.', 'wt.', 'śr.', 'czw.', 'pt.', 'sob.'];
const WDL = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
const MON = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
const wd = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();
/** „pon. 26.10” */
export const dayShort = (d: string) => `${WD[wd(d)]} ${d.slice(8, 10)}.${d.slice(5, 7)}`;
export const dayLong = (d: string) => `${WDL[wd(d)]}, ${Number(d.slice(8, 10))} ${MON[Number(d.slice(5, 7)) - 1]}`;
export const fmtDay = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
export const weekdayIdx = wd;

const timeFmt = new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit' });
/** Chwila ISO → „dziś 14:05”, „wczoraj 9:10” albo „12.10.2026 14:05”. */
export function fmtWhen(iso: string): string {
  const d = dayOf(iso);
  const t = timeFmt.format(new Date(iso));
  const now = today();
  if (d === now) return `dziś ${t}`;
  const y = new Date(`${now}T12:00:00Z`); y.setUTCDate(y.getUTCDate() - 1);
  if (d === y.toISOString().slice(0, 10)) return `wczoraj ${t}`;
  return `${fmtDay(d)} ${t}`;
}

/** Link do nawigacji: zapisany link mapy albo wyszukiwanie adresu w Google Maps. */
export function mapsUrl(site: Rec | undefined): string | undefined {
  if (!site) return undefined;
  if (/^https?:\/\//.test(site.mapa ?? '')) return site.mapa;
  const q = [site.adres, site.miejscowosc].filter(Boolean).join(', ');
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : undefined;
}

export const telHref = (t: string) => `tel:${t.replace(/[^\d+]/g, '')}`;

/** Ostatnia wizyta w zleceniu (licznik „nowe”), per urządzenie. */
const SEEN0 = 'seen0';
export function seenAt(jobId: string): string {
  try {
    let base = localStorage.getItem(SEEN0);
    if (!base) { base = new Date().toISOString(); localStorage.setItem(SEEN0, base); }
    return localStorage.getItem(`seen:${jobId}`) ?? base;
  } catch { return new Date().toISOString(); }
}
export function markSeen(jobId: string): void {
  try { localStorage.setItem(`seen:${jobId}`, new Date().toISOString()); } catch { /* prywatne okno */ }
}

export const matches = (q: string, ...xs: (string | null | undefined)[]) => {
  const n = (s: string) => s.toLocaleLowerCase('pl').normalize('NFD').replace(/\p{M}/gu, '').replace(/ł/g, 'l');
  const words = n(q).split(/\s+/).filter(Boolean);
  const hay = n(xs.filter(Boolean).join(' '));
  return words.every((w) => hay.includes(w));
};
