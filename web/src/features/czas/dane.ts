import { useEffect, useMemo, useState } from 'react';
import { today, useMe } from '../../core/data.js';
import { useEntities, type Rec } from '../../core/store.js';
import { jobColor } from '../harmonogram/model.js';
import { opisZlecenia, place, useJobs } from '../zlecenia/jobs.js';

const zywe = (r: Rec) => !r.deletedAt;
export const useWpisy = (): Rec[] => useEntities('time_entries', zywe);

/** Aktualny czas, odświeżany co `ms`. */
export function useNow(ms = 1000): number {
  const [n, setN] = useState(Date.now);
  useEffect(() => { const t = setInterval(() => setN(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return n;
}

/** Kolumna harmonogramu zalogowanej osoby. */
export function useMojaOsoba(): Rec | undefined {
  const me = useMe();
  const people = useEntities('schedule_people');
  return useMemo(() => people.find((p) => p.userId === me?.id), [people, me?.id]);
}

export type Opis = { klient: string; opis: string; numer?: string; kolor?: string };
/** Opis zlecenia do list: klient, krótki opis i miejscowość; `null` = „Bez zlecenia”. */
export function useOpisZlecenia(): (jobId: string | null | undefined) => Opis {
  const jobs = useJobs();
  return (id) => {
    const j = id ? jobs.get(id) : undefined;
    if (!j) return { klient: id ? 'Zlecenie' : 'Bez zlecenia', opis: '' };
    return { klient: j.client?.nazwa ?? j.numer, numer: j.numer, kolor: jobColor(j.numer), opis: [opisZlecenia(j).text, place(j)].filter(Boolean).join(' · ') };
  };
}

/** Dzisiejsze zlecenia z harmonogramu osoby (kolejność slotów). */
export function useZlecaniaDnia(personId: string | undefined): { jobId: string; polDnia: boolean }[] {
  const es = useEntities('schedule_entries');
  const dzis = today();
  return useMemo(() => {
    const out: { jobId: string; polDnia: boolean }[] = [];
    for (const e of [...es].sort((a, b) => a.slot - b.slot)) if (personId && e.personId === personId && e.dzien === dzis && e.rodzaj === 'zlecenie' && e.jobId && !out.some((o) => o.jobId === e.jobId)) out.push({ jobId: e.jobId, polDnia: !!e.polDnia });
    return out;
  }, [es, personId, dzis]);
}
