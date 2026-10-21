import { Briefcase, MagnifyingGlass, Plus } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { matches, seenAt, useCrewColor, useIsAdmin, useLoading, useMe, useSeenVersion, useStatusGroup } from '../../core/data.js';
import { useEntities } from '../../core/store.js';
import { Badge, Empty, SectionTitle } from '../../core/ui/bits.js';
import { Button } from '../../core/ui/button.js';
import { cn } from '../../core/ui/cn.js';
import { Input } from '../../core/ui/input.js';
import { Skeleton } from '../../core/ui/skeleton.js';
import type { Route } from '../../routes.js';
import { JobCard } from './JobCard.js';
import { JobForm } from './JobForm.js';
import { useJobs, type JobView } from './jobs.js';

const GROUPS = [
  { g: 'aktualne', title: 'Aktualne' },
  { g: 'pozniej', title: 'Na później' },
  { g: 'zamkniete', title: 'Zamknięte' },
] as const;

/** Zlecenia: lista wg grup; na komputerze lista obok karty. */
export function Zlecenia({ route }: { route: Route }) {
  const id = route.param;
  return (
    <div className="mx-auto max-w-[1400px] desk:grid desk:grid-cols-[minmax(340px,420px)_minmax(0,1fr)] desk:gap-6 desk:px-8 desk:py-6">
      <div className={cn('desk:sticky desk:top-22 desk:max-h-[calc(100dvh-7rem)] desk:self-start desk:overflow-y-auto desk:pr-1', id && 'hidden desk:block')}><JobList selected={id} /></div>
      <div className={cn(!id && 'hidden desk:block')}>
        {id ? <JobCard key={id} id={id} highlight={route.highlight} /> : (
          <div className="sticky top-24 hidden desk:block"><Empty icon={Briefcase} title="Wybierz zlecenie z listy" hint="Karta pokaże klienta, dni z harmonogramu i dziennik." /></div>
        )}
      </div>
    </div>
  );
}

function JobList({ selected }: { selected?: string }) {
  const [q, setQ] = useState('');
  const [closedOpen, setClosedOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const admin = useIsAdmin();
  const me = useMe();
  const loading = useLoading();
  const jobs = useJobs();
  const group = useStatusGroup();
  const crew = useCrewColor();
  const entries = useEntities('diary_entries');
  const sched = useEntities('schedule_entries');

  const seenVer = useSeenVersion();
  const planned = useMemo(() => new Set(sched.map((e) => e.jobId).filter(Boolean)), [sched]);
  const fresh = useMemo(() => {
    const m = new Map<string, number>();
    const seen = new Map<string, string>();
    for (const e of entries) {
      if (e.ownerType !== 'job' || e.authorId === me?.id) continue;
      let s = seen.get(e.ownerId);
      if (!s) seen.set(e.ownerId, (s = seenAt(e.ownerId)));
      if (e.createdAt > s) m.set(e.ownerId, (m.get(e.ownerId) ?? 0) + 1);
    }
    return m;
  }, [entries, me?.id, seenVer]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = useMemo(() => [...jobs.values()]
    .filter((j) => !q || matches(q, j.numer, j.client?.nazwa, j.site?.miejscowosc, j.site?.adres, j.zakres, j.status, j.ekipa))
    .sort((a, b) => String(b.numer ?? '').localeCompare(String(a.numer ?? ''), 'pl', { numeric: true })), [jobs, q]);

  if (loading) return <div className="grid gap-3 p-4" aria-busy="true" aria-label="Wczytywanie zleceń">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>;

  return (
    <section className="grid gap-4 px-4 py-4 desk:px-0 desk:py-0">
      <div className="flex gap-2">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Szukaj zlecenia</span>
          <MagnifyingGlass className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-ink-2" />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Klient, miejscowość, numer" className="pl-11" />
        </label>
        {admin && <Button onClick={() => setCreating(true)} aria-label="Nowe zlecenie" className="desk:px-4"><Plus className="h-5 w-5" weight="bold" /><span className="hidden min-[420px]:inline">Nowe</span></Button>}
      </div>
      {!list.length && (
        q ? <Empty icon={MagnifyingGlass} title="Nic nie znaleziono" hint="Sprawdź pisownię albo wpisz samą miejscowość lub nazwisko." />
          : <Empty icon={Briefcase} title="Nie ma jeszcze zleceń" hint={admin ? 'Dodaj pierwsze zlecenie przyciskiem Nowe.' : 'Zlecenia pojawią się, gdy biuro je doda.'} />
      )}
      {GROUPS.map(({ g, title }) => {
        const items = list.filter((j) => group(j.status) === g);
        if (!items.length) return null;
        const collapsed = g === 'zamkniete' && !closedOpen && !q;
        return (
          <div key={g} className="grid gap-2">
            <SectionTitle count={items.length} toggle={g === 'zamkniete' && !q ? { open: !collapsed, onToggle: () => setClosedOpen((o) => !o) } : undefined}>{title}</SectionTitle>
            {!collapsed && (
              <ul className="grid gap-2">
                {items.map((j) => <JobRow key={j.id} j={j} on={j.id === selected} nowe={fresh.get(j.id) ?? 0} missing={g === 'aktualne' && !planned.has(j.id)} color={crew(j.ekipa)} />)}
              </ul>
            )}
          </div>
        );
      })}
      {creating && <JobForm onClose={() => setCreating(false)} />}
    </section>
  );
}

function JobRow({ j, on, nowe, missing, color }: { j: JobView; on: boolean; nowe: number; missing: boolean; color?: string }) {
  return (
    <li>
      <a href={`#zl/${j.id}`} aria-current={on ? 'page' : undefined}
        className={cn('grid gap-1 rounded-2xl border bg-card px-4 py-3 transition-colors duration-200 hover:border-ink-2', on ? 'border-action ring-2 ring-action/25' : 'border-line')}>
        <span className="flex items-center gap-2 text-sm">
          <span className="font-semibold tabular-nums text-ink-2">{j._tmp ? 'zapisywanie' : j.numer}</span>
          <span className="truncate text-ink-2">{j.status}</span>
          <span className="ml-auto flex shrink-0 gap-1.5">
            {nowe > 0 && <Badge tone="ok">{nowe} {nowe === 1 ? 'nowy' : 'nowe'}</Badge>}
            {missing && <Badge tone="warn">brak w harmonogramie</Badge>}
          </span>
        </span>
        <span className="truncate font-wide text-lg font-extrabold leading-tight">{j.client?.nazwa ?? j.newClient?.nazwa ?? 'Klient'}</span>
        <span className="flex items-center gap-2 text-sm text-ink-2">
          {j.site?.miejscowosc && <span className="truncate">{j.site.miejscowosc}</span>}
          {j.ekipa && <span className="ml-auto inline-flex shrink-0 items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: color ?? 'var(--line)' }} aria-hidden />{j.ekipa}</span>}
        </span>
      </a>
    </li>
  );
}
