import { useEffect, useMemo, useState } from 'react';
import { autaCount, changedDays, freshByJob, leadyCount, naJutroCount, unseenDays, zadaniaCount, zakupyCount } from '../badges.js';
import { addDays } from '@etner/shared';
import { daySeenAt, DAY_SEEN_KEEP, ensureSeenBase, seenFor, today, uploadSeen, useDict, useMe, useSeenVersion, useStatusGroup } from '../data.js';
import { useEntities } from '../store.js';
import { withoutEchoes } from '../write.js';

/** Dni harmonogramu ze zmianą, której użytkownik jeszcze nie widział na ekranie (posortowane). */
export function useUnseenDays(): string[] {
  const me = useMe();
  const ver = useSeenVersion();
  const sched = useEntities('schedule_entries');
  const people = useEntities('schedule_people');
  return useMemo(() => (me ? unseenDays(changedDays(sched, people, me, addDays(today(), -DAY_SEEN_KEEP)), (d) => daySeenAt(me.id, d)) : []),
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
  // przełom doby: następny dzień roboczy w Na jutro liczony od nowa
  useEffect(() => { const t = setInterval(() => setDay(today()), 60_000); return () => clearInterval(t); }, []);
  const jobs = useEntities('jobs');
  useEffect(() => {
    if (!me) return;
    ensureSeenBase(me.id, ['harm']);
    uploadSeen(me.id);
    const up = () => uploadSeen(me.id);
    addEventListener('online', up);
    return () => removeEventListener('online', up);
  }, [me, jobs.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps -- po pierwszej synchronizacji zleceń wysyła jeszcze raz
  const harm = useUnseenDays().length;
  const checklists = useEntities('checklists');
  const entries = useEntities('diary_entries');
  const scope = useEntities('job_scope_items');
  const pumble = useEntities('pumble_messages');
  const shopping = useEntities('shopping');
  const faults = useEntities('car_faults');
  const tasks = useEntities('tasks');
  const leads = useEntities('leads');
  const leadGroup = useStatusGroup('status_leada');
  const first = useDict('status_zakupu')[0]?.wartosc;
  const off = useDict('dzien_wolny');
  return useMemo((): Record<string, number> => {
    if (!me) return {};
    const admin = me.role === 'admin';
    const auta = autaCount(withoutEchoes(faults, ['carId', 'opis', 'by'])); // tymczasowa kopia wysłanej usterki liczyłaby się podwójnie
    return {
      jutro: naJutroCount(checklists, day, me, off.map((d) => d.wartosc as string)),
      harm,
      zl: freshByJob(jobs, entries, scope, me.id, seenFor(me.id), admin, pumble).size,
      zakupy: zakupyCount(shopping, first, admin),
      auta,
      zad: zadaniaCount(tasks, admin),
      leady: leadyCount(leads, leadGroup, day, admin),
    };
  }, [me, ver, day, harm, checklists, jobs, entries, scope, pumble, shopping, faults, tasks, leads, leadGroup, first, off]); // eslint-disable-line react-hooks/exhaustive-deps
}
