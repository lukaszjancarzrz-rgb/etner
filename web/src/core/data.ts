import { addDays, dayOf } from '@etner/shared';
import { staleDayKeys } from './badges.js';
import { useMemo, useSyncExternalStore } from 'react';
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

/** Grupa statusu zlecenia (albo leada) wg słownika (aktualne / pozniej / zamkniete). */
export function useStatusGroup(rodzaj = 'status_zlecenia'): (status: string) => string {
  const st = useDict(rodzaj);
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
    // w trybie ciemnym jaśniejszy odcień (--crew-mix), żeby pasek miał kontrast ≥3:1 z kartą
    const m = new Map(ek.filter((d) => d.wartosc !== 'mieszane').map((d, i) => [d.wartosc, `color-mix(in srgb, ${d.kolor || PALETTE[i % PALETTE.length]!}, white var(--crew-mix))`]));
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

/** Ostatnia wizyta w zleceniu (licznik „nowe”), per użytkownik na urządzeniu (drugi admin na tym samym komputerze ma własne „widziane”). */
const seen0 = (userId: string) => `seen0:${userId}`;
/** Pierwsze uruchomienie użytkownika na urządzeniu: zmiany innych z ostatnich dni są „nowe” (np. wpis dodany przed zalogowaniem). */
const FIRST_RUN_DAYS = 3;
const navKey = (userId: string, screen: string) => `nav-seen:${userId}:${screen}`;
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
/** Tylko odczyt (bezpieczne w useMemo). Bez zapisanej bazy: „teraz”, czyli nic nie jest nowe, dopóki ensureSeenBase jej nie zapisze. */
export const seenFor = (userId: string) => (jobId: string): string => read(`seen:${userId}:${jobId}`) ?? read(seen0(userId)) ?? new Date().toISOString();
/** Baza „ostatnio widziane” ekranu (pierwsze uruchomienie), per użytkownik; tylko odczyt. */
export const screenSeenAt = (userId: string, screen: string): string => read(navKey(userId, screen)) ?? new Date().toISOString();
/** Pierwsze uruchomienie: baza „ostatnio widziane” = teraz (stare dane nie są „nowe”). Wołać w efekcie. */
export function ensureSeenBase(userId: string, screens: string[]): void {
  try {
    const now = new Date().toISOString();
    if (!localStorage.getItem(seen0(userId))) localStorage.setItem(seen0(userId), new Date(Date.now() - FIRST_RUN_DAYS * 864e5).toISOString());
    for (const sc of screens) if (!localStorage.getItem(navKey(userId, sc))) localStorage.setItem(navKey(userId, sc), now);
    // obejrzane dni starsze niż DAY_SEEN_KEEP: usuwamy (licznik i tak ich nie liczy)
    const cut = addDays(today(), -DAY_SEEN_KEEP);
    for (const k of staleDayKeys(Object.keys(localStorage), cut)) localStorage.removeItem(k);
  } catch { /* prywatne okno */ }
}
let seenVer = 0;
const seenSubs = new Set<() => void>();
const bump = () => { seenVer++; for (const f of seenSubs) f(); };
export function markSeen(userId: string, jobId: string): void {
  try { localStorage.setItem(`seen:${userId}:${jobId}`, new Date().toISOString()); } catch { /* prywatne okno */ }
  bump();
}
/** Ile dni wstecz liczą się zmiany harmonogramu („nowe”) i zapamiętane obejrzenia. */
export const DAY_SEEN_KEEP = 60;
/** Ostatnie obejrzenie dnia harmonogramu (karta / kolumna widoczna na ekranie); bez wpisu: baza z pierwszego uruchomienia. */
export const daySeenAt = (userId: string, dzien: string): string => read(`harm-day:${userId}:${dzien}`) ?? screenSeenAt(userId, 'harm');
export function markDaySeen(userId: string, dzien: string, at = new Date().toISOString()): void {
  try { localStorage.setItem(`harm-day:${userId}:${dzien}`, at); } catch { /* prywatne okno */ }
  bump();
}
/** Zmienia się po każdym markSeen (liczniki „nowe” liczone od nowa). */
export const useSeenVersion = () => useSyncExternalStore((f) => { seenSubs.add(f); return () => seenSubs.delete(f); }, () => seenVer);

export const matches = (q: string, ...xs: (string | null | undefined)[]) => {
  const n = (s: string) => s.toLocaleLowerCase('pl').normalize('NFD').replace(/\p{M}/gu, '').replace(/ł/g, 'l');
  const words = n(q).split(/\s+/).filter(Boolean);
  const hay = n(xs.filter(Boolean).join(' '));
  return words.every((w) => hay.includes(w));
};
