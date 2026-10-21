import { ArrowLeft, CalendarCheck, MapPin, NavigationArrow, PencilSimple, Phone, User } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';
import { fmtDay, mapsUrl, markSeen, telHref, useCrewColor, useIsAdmin, useLoading } from '../../core/data.js';
import { useEntities, useEntity } from '../../core/store.js';
import { Badge, Empty } from '../../core/ui/bits.js';
import { Button } from '../../core/ui/button.js';
import { Skeleton } from '../../core/ui/skeleton.js';
import { Diary } from '../dziennik/Diary.js';
import { JobForm } from './JobForm.js';
import { Scope } from './Scope.js';
import { fmtDni, jobDays } from './jobs.js';

const MON = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
export const fmtTermin = (t?: string | null) => (t ? `${MON[Number(t.slice(5, 7)) - 1]} ${t.slice(0, 4)}` : 'bez terminu');

export function JobCard({ id, highlight }: { id: string; highlight?: string }) {
  const job = useEntity('jobs', id);
  const client = useEntity('clients', job?.clientId);
  const site = useEntity('sites', job?.siteId ?? undefined);
  const sched = useEntities('schedule_entries');
  const admin = useIsAdmin();
  const loading = useLoading();
  const crew = useCrewColor();
  const [editing, setEditing] = useState(false);
  const days = useMemo(() => jobDays(sched, id), [sched, id]);

  // „nowe” liczone od ostatniej wizyty; wpisy przeczytane podczas otwartej karty też się liczą
  useEffect(() => { markSeen(id); if (!highlight) scrollTo(0, 0); return () => markSeen(id); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!job) {
    return loading ? (
      <div className="grid gap-3 p-4 desk:p-0" aria-busy="true"><Skeleton className="h-40" /><Skeleton className="h-64" /></div>
    ) : (
      <div className="p-4 desk:p-0"><Empty icon={MapPin} title="Nie ma takiego zlecenia" hint="Mogło zostać usunięte. Wróć do listy zleceń."><a href="#zl" className="font-semibold text-action">Lista zleceń</a></Empty></div>
    );
  }
  const nav = mapsUrl(site);
  const phones = (client?.telefony as string[] | undefined) ?? [];
  const color = crew(job.ekipa);

  return (
    <article className="grid gap-4 px-4 py-4 desk:px-0 desk:py-0">
      <a href="#zl" className="inline-flex h-11 items-center gap-2 justify-self-start font-semibold text-action desk:hidden"><ArrowLeft className="h-5 w-5" />Zlecenia</a>
      <div className="overflow-hidden rounded-2xl border border-line bg-card shadow-card">
        <div className="h-1.5" style={{ background: color ?? 'var(--line)' }} aria-hidden />
        <div className="grid gap-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
                <span className="font-semibold tabular-nums">{job._tmp ? 'zapisywanie' : job.numer}</span><Badge tone="action">{job.status}</Badge>
              </p>
              <h2 className="mt-1 font-wide text-2xl font-extrabold leading-tight">
                {client ? <a href={`#kl/${client.id}`} className="hover:text-action">{client.nazwa}</a> : 'Klient'}
              </h2>
              {site && <p className="mt-1 flex items-start gap-1.5 text-ink-2"><MapPin className="mt-0.5 h-5 w-5 shrink-0" />{[site.nazwa, site.adres, site.miejscowosc].filter(Boolean).join(', ')}</p>}
            </div>
            {admin && <Button variant="secondary" size="sm" onClick={() => setEditing(true)}><PencilSimple className="h-4 w-4" />Edytuj</Button>}
          </div>
          {(phones.length > 0 || nav) && (
            <div className="flex flex-wrap gap-2">
              {nav && <a href={nav} target="_blank" rel="noreferrer" className="inline-flex h-12 items-center gap-2 rounded-full bg-action px-5 font-semibold text-action-ink"><NavigationArrow className="h-5 w-5" weight="fill" />Nawiguj</a>}
              {phones.map((t) => <a key={t} href={telHref(t)} className="inline-flex h-12 items-center gap-2 rounded-full border border-line px-5 font-semibold"><Phone className="h-5 w-5" />{t}</a>)}
            </div>
          )}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-4 text-sm min-[560px]:grid-cols-4">
            <Info k="Ekipa"><span className="inline-flex items-center gap-1.5">{job.ekipa && <span className="h-2.5 w-2.5 rounded-full" style={{ background: color ?? 'var(--line)' }} aria-hidden />}{job.ekipa ?? 'nie przypisano'}</span></Info>
            <Info k="Termin"><span className="capitalize">{fmtTermin(job.termin)}</span></Info>
            <Info k="Rodzaj">{[job.rodzaj, job.kategoria].filter(Boolean).join(', ') || 'brak'}</Info>
            <Info k="W harmonogramie">
              {days.dni ? <span className="inline-flex items-center gap-1.5"><CalendarCheck className="h-4 w-4 text-ok" />{fmtDni(days.dni)}</span> : <span className="text-danger">brak dni</span>}
              {days.od && <span className="block text-xs text-ink-2">{days.od === days.do ? fmtDay(days.od) : `${fmtDay(days.od)} - ${fmtDay(days.do!)}`}</span>}
            </Info>
          </dl>
          {admin && job.uwagiAdmin && (
            <div className="grid gap-1 rounded-xl bg-bg/70 p-3"><p className="flex items-center gap-1.5 text-sm font-semibold text-ink-2"><User className="h-4 w-4" />Uwagi admina (pracownicy nie widzą)</p><p className="whitespace-pre-wrap">{job.uwagiAdmin}</p></div>
          )}
        </div>
      </div>
      <Scope jobId={id} disabled={!!job._tmp} />
      <Diary ownerType="job" ownerId={id} highlight={highlight} disabled={!!job._tmp} />
      {editing && <JobForm job={job} onClose={() => setEditing(false)} />}
    </article>
  );
}

const Info = ({ k, children }: { k: string; children: React.ReactNode }) => (
  <div className="min-w-0"><dt className="text-ink-2">{k}</dt><dd className="mt-0.5 font-semibold">{children}</dd></div>
);
