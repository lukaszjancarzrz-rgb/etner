import { addDays, isWorkday } from '@etner/shared';
import { ApiError } from '../../core/api.js';
import type { Rec } from '../../core/store.js';
import type { JobView } from '../zlecenia/jobs.js';

export type Slot =
  | { rodzaj: 'zlecenie'; jobId: string; polDnia: boolean }
  | { rodzaj: 'kod'; kod: string; polDnia: boolean }
  | { rodzaj: 'tekst'; tekst: string; polDnia: boolean };

export const cellKey = (dzien: string, personId: string | null) => `${dzien}|${personId ?? 'uwagi'}`;

/** Wpis z bazy → wartość komórki (kształt jak w szkicu). */
export const toSlot = (e: Rec): Slot =>
  e.rodzaj === 'zlecenie' ? { rodzaj: 'zlecenie', jobId: e.jobId, polDnia: !!e.polDnia }
    : e.rodzaj === 'kod' ? { rodzaj: 'kod', kod: e.kod, polDnia: !!e.polDnia }
      : { rodzaj: 'tekst', tekst: e.tekst, polDnia: !!e.polDnia };

/** Porównanie wartości niezależne od kolejności kluczy. */
export const sameCell = (a: Slot[], b: Slot[]) => JSON.stringify(a.map(norm)) === JSON.stringify(b.map(norm));
const norm = (s: Slot) => (s.rodzaj === 'zlecenie' ? ['z', s.jobId, s.polDnia] : s.rodzaj === 'kod' ? ['k', s.kod, s.polDnia] : ['t', s.tekst, s.polDnia]);

/** Komórki z wpisów: klucz dzień|osoba → sloty po kolei. */
export function cellsOf(entries: Rec[]): Map<string, Slot[]> {
  const m = new Map<string, Rec[]>();
  for (const e of entries) {
    const k = cellKey(e.dzien, e.personId);
    m.set(k, [...(m.get(k) ?? []), e]);
  }
  return new Map([...m].map(([k, rs]) => [k, rs.sort((a, b) => a.slot - b.slot).map(toSlot)]));
}

export function slotLabel(s: Slot, jobs: Map<string, JobView>): string {
  if (s.rodzaj === 'kod') return s.kod;
  if (s.rodzaj === 'tekst') return s.tekst;
  const j = jobs.get(s.jobId);
  return j ? [j.numer, j.client?.nazwa, j.site?.miejscowosc].filter(Boolean).join(', ') : 'Zlecenie';
}
export const cellText = (slots: Slot[], jobs: Map<string, JobView>) =>
  slots.length ? slots.map((s) => `${slotLabel(s, jobs)}${s.polDnia ? ' (pół dnia)' : ''}`).join(' + ') : 'pusto';

/** Treść błędu: sesja (401), serwer (5xx), brak sieci albo komunikat serwera. */
export function errText(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 401) return 'Sesja wygasła. Zaloguj się ponownie.';
    if (e.status >= 500) return 'Błąd serwera. Spróbuj ponownie za chwilę.';
    return e.message;
  }
  return 'Brak połączenia. Szkice można przejrzeć i zatwierdzić, gdy będzie zasięg.';
}

/** Dni szkicu zbiorczego [from, to] (jak serwer: `workdaysOnly` pomija weekendy, święta i dni wolne). */
export function rangeDays(from: string, to: string, workdaysOnly: boolean, extraOff: string[]): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length <= 400; d = addDays(d, 1)) if (!workdaysOnly || isWorkday(d, extraOff) === 1) out.push(d);
  return out;
}

/** Wszystkie dni miesiąca kalendarzowego, w którym leży `day`. */
export function monthDays(day: string): string[] {
  const out: string[] = [];
  for (let d = `${day.slice(0, 7)}-01`; d.startsWith(day.slice(0, 7)); d = addDays(d, 1)) out.push(d);
  return out;
}
