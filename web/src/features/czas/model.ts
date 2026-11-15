import { addDays, dayOf, fmtMinuty, godzinaPl, mondayOf, minutyMiedzy } from '@etner/shared';
import type { Rec } from '../../core/store.js';

/** „07:05” – do pola type=time. */
export const hhmm = (iso: string): string => godzinaPl(iso).padStart(5, '0');
export const dm = (d: string): string => `${d.slice(8, 10)}.${d.slice(5, 7)}`;

/** Czas wpisu w minutach; trwający liczony do `now`. */
export const minuty = (e: Rec, now: Date | string): number => Math.max(0, minutyMiedzy(e.od, e.do ?? (typeof now === 'string' ? now : now.toISOString())));
export const sumaMinut = (es: Rec[], now: Date | string): number => es.reduce((s, e) => s + minuty(e, now), 0);

/** Trwający wpis użytkownika (jeden naraz). */
export const trwajacy = (es: Rec[], userId: string | undefined): Rec | undefined => es.find((e) => !e.deletedAt && !e.do && !!userId && e.userId === userId);

/** Wpis z czasomierza z godzinami innymi niż zapisał czasomierz. */
export const poprawione = (e: Rec): boolean => e.zrodlo === 'czasomierz' && !!e.do && (e.od !== e.odCz || e.do !== e.doCz);
export const reczny = (e: Rec): boolean => e.zrodlo === 'reczny';
/** Zatrzymany automatycznie i jeszcze niesprawdzony. */
export const doSprawdzenia = (e: Rec): boolean => !!e.autoStop && !e.edytowalAt;
/** Różnica względem czasomierza w minutach (tylko dla poprawionych). */
export const roznica = (e: Rec): number => (poprawione(e) ? minutyMiedzy(e.od, e.do) - minutyMiedzy(e.odCz, e.doCz) : 0);
/** „czasomierz: 7:25 – 16:00 (8 h 35 min)”. */
export const czasomierzTekst = (e: Rec): string => `czasomierz: ${godzinaPl(e.odCz)} – ${godzinaPl(e.doCz)} (${fmtMinuty(minutyMiedzy(e.odCz, e.doCz))})`;
/** „13.11 18:02”. */
export const kiedy = (iso: string): string => `${dm(dayOf(iso))} ${godzinaPl(iso)}`;

export type Dzien = { dzien: string; minuty: number; wpisy: Rec[] };
/** Dni od najnowszego, wpisy w dniu od najnowszego. */
export function wgDni(es: Rec[], now: Date | string): Dzien[] {
  const m = new Map<string, Rec[]>();
  for (const e of es) m.set(e.dzien, [...(m.get(e.dzien) ?? []), e]);
  return [...m].sort(([a], [b]) => (a < b ? 1 : -1)).map(([dzien, wpisy]) => ({ dzien, wpisy: wpisy.sort((a, b) => (a.od < b.od ? 1 : -1)), minuty: sumaMinut(wpisy, now) }));
}

export const tydzien = (dzien: string): string[] => Array.from({ length: 7 }, (_, i) => addDays(mondayOf(dzien), i));
/** „10.11 – 16.11.2026”. */
export const tydzienTekst = (dzien: string): string => { const d = tydzien(dzien); return `${dm(d[0]!)} – ${dm(d[6]!)}.${d[6]!.slice(0, 4)}`; };
export const wTygodniu = (es: Rec[], dzien: string): Rec[] => { const d = tydzien(dzien); return es.filter((e) => e.dzien >= d[0]! && e.dzien <= d[6]!); };

/** Osoba → minuty w kolejnych dniach (`dni`) i razem. */
export function sumyDni(es: Rec[], dni: string[], now: Date | string): Map<string, { dni: number[]; razem: number }> {
  const m = new Map<string, { dni: number[]; razem: number }>();
  for (const e of es) {
    const i = dni.indexOf(e.dzien);
    if (i < 0) continue;
    const r = m.get(e.personId) ?? { dni: dni.map(() => 0), razem: 0 };
    const x = minuty(e, now);
    r.dni[i]! += x; r.razem += x;
    m.set(e.personId, r);
  }
  return m;
}

/** Osoba → minuty i liczba dni z wpisami w miesiącu `ym` (RRRR-MM). */
export function sumyMiesiac(es: Rec[], ym: string, now: Date | string): Map<string, { razem: number; dni: number }> {
  const m = new Map<string, { razem: number; dni: Set<string> }>();
  for (const e of es) {
    if (!e.dzien.startsWith(ym)) continue;
    const r = m.get(e.personId) ?? { razem: 0, dni: new Set<string>() };
    r.razem += minuty(e, now); r.dni.add(e.dzien);
    m.set(e.personId, r);
  }
  return new Map([...m].map(([k, v]) => [k, { razem: v.razem, dni: v.dni.size }]));
}

export type Rodzaj = 'wszystkie' | 'zwykle' | 'poprawione' | 'auto' | 'reczne';
export function filtruj(es: Rec[], f: { personId?: string; jobId?: string; rodzaj: Rodzaj }): Rec[] {
  return es.filter((e) => (!f.personId || e.personId === f.personId)
    && (!f.jobId || (f.jobId === 'none' ? !e.jobId : e.jobId === f.jobId))
    && (f.rodzaj === 'wszystkie' || (f.rodzaj === 'zwykle' ? !poprawione(e) && !e.autoStop && !reczny(e) : f.rodzaj === 'poprawione' ? poprawione(e) : f.rodzaj === 'auto' ? !!e.autoStop : reczny(e))));
}

/** Licznik H:MM:SS. */
export function licznik(od: string, now: number): string {
  const s = Math.max(0, Math.floor((now - Date.parse(od)) / 1000));
  return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
