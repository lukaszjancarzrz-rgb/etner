import { miesiacPrzychodu } from '@etner/shared';
import type { Rec } from '../../core/store.js';

const live = (r: Rec) => !r.deletedAt;

/** Miesiąc (RRRR-MM) wiersza: koszt ma `miesiac`, przychód liczy się z daty albo „innego miesiąca”. */
export const miesiacWiersza = (r: Rec): string | null => (r.miesiac as string | undefined) ?? miesiacPrzychodu(r.dzien ?? null, r.innyMiesiac ?? null);

/** Czy wiersz mieści się w okresie: `okres` to RRRR-MM albo RRRR (cały rok). */
export const wOkresie = (r: Rec, okres: string): boolean => !!miesiacWiersza(r)?.startsWith(okres);

/** Suma netto (gr) nieusuniętych wierszy z danego miesiąca (RRRR-MM) albo roku (RRRR). */
export const sumaMiesiaca = (rows: Rec[], miesiac: string): number =>
  rows.filter((r) => live(r) && wOkresie(r, miesiac)).reduce((s, r) => s + (r.nettoGr as number), 0);

/** Zlecenia ze statusem „Rozliczone” (bez względu na wielkość liter) bez żadnego nieusuniętego przychodu. */
export function rozliczoneBezPrzychodu(jobs: Rec[], revenues: Rec[]): Rec[] {
  const z = new Set(revenues.filter((r) => live(r) && r.jobId).map((r) => r.jobId as string));
  return jobs.filter((j) => live(j) && String(j.status ?? '').trim().toLowerCase() === 'rozliczone' && !z.has(j.id));
}

