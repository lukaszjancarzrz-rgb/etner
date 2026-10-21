import { useEffect, useMemo, useState } from 'react';
import { changedDays, freshByJob, naJutroCount, unseenDays, zakupyCount } from '../badges.js';
import { daySeenAt, ensureSeenBase, seenAt, today, useDict, useMe, useSeenVersion } from '../data.js';
import { useEntities } from '../store.js';

/** Dni harmonogramu ze zmianą, której użytkownik jeszcze nie widział na ekranie (posortowane). */
export function useUnseenDays(): string[] {
  const me = useMe();
  const ver = useSeenVersion();
  const sched = useEntities('schedule_entries');
  const people = useEntities('schedule_people');
  return useMemo(() => (me ? unseenDays(changedDays(sched, people, me), (d) => daySeenAt(me.id, d)) : []),
    [me, ver, sched, people]); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * Liczniki menu liczone z danych w telefonie. Liczone raz (Shell) i podawane obu menu.
 * Wejście na ekran nie kasuje licznika: Harmonogram = nieobejrzane zmienione dni, Zlecenia = zlecenia z nieotwartą nowością.
 */
export function useBadges(): Record<string, number> {
  const me = useMe();
  const ver = useSeenVersion();
  const [day, setDay] = useState(today);
  // przełom doby: „dziś i jutro” w Na jutro liczone od nowa
  useEffect(() => { const t = setInterval(() => setDay(today()), 60_000); return () => clearInterval(t); }, []);
  useEffect(() => { if (me) ensureSeenBase(me.id, ['harm']); }, [me]);
  const harm = useUnseenDays().length;
  const checklists = useEntities('checklists');
  const jobs = useEntities('jobs');
  const entries = useEntities('diary_entries');
  const scope = useEntities('job_scope_items');
  const shopping = useEntities('shopping');
  const first = useDict('status_zakupu')[0]?.wartosc;
  return useMemo((): Record<string, number> => {
    if (!me) return {};
    const admin = me.role === 'admin';
    return {
      jutro: naJutroCount(checklists, day, me),
      harm,
      zl: freshByJob(jobs, entries, scope, me.id, seenAt, admin).size,
      zakupy: zakupyCount(shopping, first, admin),
    };
  }, [me, ver, day, harm, checklists, jobs, entries, scope, shopping, first]); // eslint-disable-line react-hooks/exhaustive-deps
}
