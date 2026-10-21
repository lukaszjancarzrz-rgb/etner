import { useMemo } from 'react';
import { useEntities, type Rec } from '../../core/store.js';

/** Zlecenia z klientem i obiektem (do list, wyboru w harmonogramie i kart). */
export type JobView = Rec & { client?: Rec; site?: Rec };

export function useJobs(): Map<string, JobView> {
  const jobs = useEntities('jobs');
  const clients = useEntities('clients');
  const sites = useEntities('sites');
  return useMemo(() => {
    const c = new Map(clients.map((x) => [x.id, x]));
    const s = new Map(sites.map((x) => [x.id, x]));
    return new Map(jobs.map((j) => [j.id, { ...j, client: c.get(j.clientId), site: j.siteId ? s.get(j.siteId) : undefined }]));
  }, [jobs, clients, sites]);
}

/** Dni ze zsynchronizowanego harmonogramu: pełny dzień 1, pół 0,5; od–do. */
export function jobDays(entries: Rec[], jobId: string): { dni: number; od?: string; do?: string } {
  const rows = entries.filter((e) => e.jobId === jobId);
  const ds = rows.map((r) => r.dzien as string).sort();
  return { dni: rows.reduce((s, r) => s + (r.polDnia ? 0.5 : 1), 0), od: ds[0], do: ds.at(-1) };
}

export const fmtDni = (n: number) => `${String(n).replace('.', ',')} ${n === 1 ? 'dzień' : 'dni'}`;
export const place = (j: JobView) => j.site?.miejscowosc || '';
