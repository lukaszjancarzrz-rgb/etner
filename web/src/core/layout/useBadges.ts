import { useEffect, useMemo } from 'react';
import { freshByJob, harmonogramCount, naJutroCount, zakupyCount } from '../badges.js';
import { markScreenSeen, screenSeenAt, seenAt, today, useDict, useMe, useSeenVersion } from '../data.js';
import { useEntities } from '../store.js';

/** Ekrany, których licznik czyści wejście (Na jutro i Zakupy to liczby na żywo). */
const CLEARS = ['harm', 'zl'];

/** Liczniki menu liczone z danych w telefonie. */
export function useBadges(): Record<string, number> {
  const me = useMe();
  const ver = useSeenVersion();
  const checklists = useEntities('checklists');
  const sched = useEntities('schedule_entries');
  const people = useEntities('schedule_people');
  const jobs = useEntities('jobs');
  const entries = useEntities('diary_entries');
  const scope = useEntities('job_scope_items');
  const shopping = useEntities('shopping');
  const first = useDict('status_zakupu')[0]?.wartosc;
  return useMemo((): Record<string, number> => {
    if (!me) return {};
    const zl = screenSeenAt(me.id, 'zl');
    return {
      jutro: naJutroCount(checklists, today(), me),
      harm: harmonogramCount(sched, people, me.id, screenSeenAt(me.id, 'harm')),
      zl: freshByJob(jobs, entries, scope, me.id, (id) => { const s = seenAt(id); return s > zl ? s : zl; }).size,
      zakupy: zakupyCount(shopping, first, me.role === 'admin'),
    };
  }, [me, ver, checklists, sched, people, jobs, entries, scope, shopping, first]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Wejście na ekran i wyjście z niego zapisują wizytę (zmiany oglądane na otwartym ekranie się nie liczą). */
export function useMarkScreen(screen: string): void {
  const id = useMe()?.id;
  useEffect(() => {
    if (!id || !CLEARS.includes(screen)) return;
    markScreenSeen(id, screen);
    return () => markScreenSeen(id, screen);
  }, [id, screen]);
}
