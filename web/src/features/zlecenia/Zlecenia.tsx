import { Briefcase, MagnifyingGlass, Plus } from '@phosphor-icons/react';
import { TitleCount } from '../../core/layout/TopBar.js';
import { useEffect, useMemo, useState } from 'react';
import { matches, seenFor, useCrewColor, useDict, useIsAdmin, useLoading, useMe, useSeenVersion, useStatusGroup } from '../../core/data.js';
import { freshByJob } from '../../core/badges.js';
import { useEntities } from '../../core/store.js';
import { Badge, Empty, SectionTitle, Segmented } from '../../core/ui/bits.js';
import { Button } from '../../core/ui/button.js';
import { CatTab, useCatAbbr, useCatColor } from '../../core/ui/category.js';
import { Table, Td, Th, Tr, useSort } from '../../core/ui/table.js';
import { cn } from '../../core/ui/cn.js';
import { Input } from '../../core/ui/input.js';
import { Skeleton } from '../../core/ui/skeleton.js';
import { useDesk } from '../../core/layout/status.js';
import type { Route } from '../../routes.js';
import { fmtTermin, JobCard } from './JobCard.js';
import { JobForm } from './JobForm.js';
import { byTermin, isSerwis, useJobs, type JobView } from './jobs.js';

const GROUPS = [
  { g: 'aktualne', title: 'Aktualne' },
  { g: 'pozniej', title: 'Na później' },
  { g: 'zamkniete', title: 'Zamknięte' },
] as const;

/** Zlecenia: telefon – lista wg grup albo karta; komputer – tabela z kartą zaznaczonego zlecenia obok. */
export function Zlecenia({ route }: { route: Route }) {
  const id = route.param;
  const desk = useDesk();
  if (desk) return <JobList selected={id} highlight={route.highlight} />;
  return (
    <div className="mx-auto max-w-[1400px]">
      <div className={cn(id && 'hidden')}><JobList selected={id} /></div>
      {id && <JobCard key={id} id={id} highlight={route.highlight} />}
    </div>
  );
}

function JobList({ selected, highlight }: { selected?: string; highlight?: string }) {
  const [q, setQ] = useState('');
  const [closedOpen, setClosedOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [serwisowe, setSerwisowe] = useState(false); // filtr jak szukaj: tylko w pamięci widoku
  const admin = useIsAdmin();
  const me = useMe();
  const loading = useLoading();
  const jobs = useJobs();
  const group = useStatusGroup();
  const crew = useCrewColor();
  const desk = useDesk();
  const entries = useEntities('diary_entries');
  const sched = useEntities('schedule_entries');

  const seenVer = useSeenVersion();
  const planned = useMemo(() => new Set(sched.map((e) => e.jobId).filter(Boolean)), [sched]);
  const firstDay = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of sched) if (e.jobId && !e.deletedAt && (!m.has(e.jobId) || e.dzien < m.get(e.jobId)!)) m.set(e.jobId, e.dzien);
    return m;
  }, [sched]);
  const scope = useEntities('job_scope_items');
  const rawJobs = useEntities('jobs');
  const pumble = useEntities('pumble_messages');
  const fresh = useMemo(() => freshByJob(rawJobs, entries, scope, me?.id, seenFor(me?.id ?? ''), admin, pumble), [rawJobs, entries, scope, me?.id, admin, pumble, seenVer]); // eslint-disable-line react-hooks/exhaustive-deps
  const scopeText = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const p of scope) m.set(p.jobId, [...(m.get(p.jobId) ?? []), p.tekst]);
    return m;
  }, [scope]);
  const list = useMemo(() => [...jobs.values()]
    .filter((j) => !serwisowe || isSerwis(j))
    .filter((j) => !q || matches(q, j.numer, j.client?.nazwa, j.site?.miejscowosc, j.site?.adres, j.status, j.ekipa, ...(scopeText.get(j.id) ?? [])))
    .sort(byTermin(firstDay)), [jobs, q, serwisowe, scopeText, firstDay]);

  if (desk && !loading) return <JobTable list={list} q={q} setQ={setQ} serwisowe={serwisowe} setSerwisowe={setSerwisowe} selected={selected} highlight={highlight} fresh={fresh} planned={planned} />;
  if (loading) return <div className="grid gap-3 p-4" aria-busy="true" aria-label="Wczytywanie zleceń">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>;

  return (
    <section className="grid gap-4 px-4 py-4">
      <div className="flex gap-2">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Szukaj zlecenia</span>
          <MagnifyingGlass className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-ink-2" />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Klient, miejscowość, numer" className="pl-11" />
        </label>
        {admin && <Button onClick={() => setCreating(true)} aria-label="Nowe zlecenie" ><Plus className="h-5 w-5" weight="bold" /><span className="hidden min-[420px]:inline">Nowe</span></Button>}
      </div>
      <SerwisToggle on={serwisowe} onChange={setSerwisowe} className="justify-self-start" />
      {!list.length && (
        q || serwisowe ? <Empty icon={MagnifyingGlass} title="Nic nie znaleziono" hint="Sprawdź pisownię albo wpisz samą miejscowość lub nazwisko." />
          : <Empty icon={Briefcase} title="Nie ma jeszcze zleceń" hint={admin ? 'Dodaj pierwsze zlecenie przyciskiem Nowe.' : 'Zlecenia pojawią się, gdy biuro je doda.'} />
      )}
      {GROUPS.map(({ g, title }) => {
        const items = list.filter((j) => group(j.status) === g);
        if (!items.length) return null;
        const collapsed = g === 'zamkniete' && !closedOpen && !q;
        return (
          <div key={g} className="grid gap-2">
            <SectionTitle count={items.length} toggle={g === 'zamkniete' && !q ? { open: !collapsed, onToggle: () => setClosedOpen((o) => !o) } : undefined}>{title}</SectionTitle>
            {!collapsed && byMonth(items).map(([t, month]) => (
              <div key={t} className="grid gap-2">
                <h3 className="mt-1 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-ink-2 first-letter:uppercase after:h-px after:flex-1 after:bg-line">{fmtTermin(t || null)}</h3>
                <ul className="divide-y divide-rule rounded-[4px] border border-line bg-card">
                  {month.map((j) => <JobRow key={j.id} j={j} on={j.id === selected} nowe={fresh.get(j.id) ?? 0} missing={g === 'aktualne' && !planned.has(j.id)} color={crew(j.ekipa)} />)}
                </ul>
              </div>
            ))}
          </div>
        );
      })}
      {creating && <JobForm onClose={() => setCreating(false)} />}
    </section>
  );
}

/** Kolejne zlecenia z tym samym miesiącem terminu (lista już posortowana byTermin) – osobne bloki z nagłówkiem miesiąca. */
const byMonth = (items: JobView[]): [string, JobView[]][] => {
  const out: [string, JobView[]][] = [];
  for (const j of items) {
    const t = (j.termin as string | null) ?? '';
    if (out.at(-1)?.[0] === t) out.at(-1)![1].push(j); else out.push([t, [j]]);
  }
  return out;
};

function JobRow({ j, on, nowe, missing, color }: { j: JobView; on: boolean; nowe: number; missing: boolean; color?: string }) {
  const nazwa = j.client?.nazwa ?? j.newClient?.nazwa ?? 'Klient';
  return (
    <li>
      <a href={`#zl/${j.id}`} aria-current={on ? 'page' : undefined}
        className={cn('grid grid-cols-[minmax(0,1fr)] gap-1 px-4 py-3 transition-colors duration-200', on ? 'bg-action/10' : 'hover:bg-ink/4')}>
        {/* plakietki zawijają się pod numer na wąskim telefonie (bez przewijania w poziomie) */}
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          {j.kategoria && <><CatTab name={j.kategoria} flush className="-ml-4" /><span className="sr-only">{j.kategoria}</span></>}
          <span className="font-semibold tabular-nums text-ink-2">{j._tmp ? 'zapisywanie' : j.numer}</span>
          <span className="min-w-0 truncate text-ink-2">{j.status}</span>
          <span className="ml-auto flex flex-wrap justify-end gap-1.5">
            {isSerwis(j) && <Badge tone="ink">Serwis</Badge>}
            {nowe > 0 && <Badge tone="new">{nowe} {nowe === 1 ? 'nowy' : 'nowe'}</Badge>}
            {missing && <Badge tone="warn">brak w harmonogramie</Badge>}
          </span>
        </span>
        <span className="truncate text-lg font-extrabold leading-tight">{nazwa}</span>
        <span className="flex items-end gap-2 text-sm text-ink-2">
          {j.site?.miejscowosc && <span className="truncate">{j.site.miejscowosc}</span>}
          <span className="ml-auto flex shrink-0 flex-col items-end gap-1">
            {j.ekipa && <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: color ?? 'var(--line)' }} aria-hidden />{j.ekipa}</span>}
          </span>
        </span>
      </a>
    </li>
  );
}

/** Przełącznik „Serwisowe” (tylko zlecenia rodzaju serwis); łączy się z zakresem i branżą. */
const SerwisToggle = ({ on, onChange, className }: { on: boolean; onChange: (v: boolean) => void; className?: string }) => (
  <button type="button" aria-pressed={on} onClick={() => onChange(!on)}
    className={cn('inline-flex h-11 items-center rounded-[4px] border px-3 text-sm font-semibold', on ? 'border-ink bg-ink text-bg' : 'border-line bg-card text-ink-2 hover:border-ink-2 hover:text-ink', className)}>Serwisowe</button>
);

const MON3 = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
const terminKrotko = (t?: string | null) => (t && MON3[Number(t.slice(5, 7)) - 1] ? `${MON3[Number(t.slice(5, 7)) - 1]} ${t.slice(0, 4)}` : '');
type Zakres = (typeof GROUPS)[number]['g'];

/** Komputer: pasek (szukaj, zakres, branża, Nowe), tabela z sortowaniem, karta zaznaczonego zlecenia w panelu obok. */
function JobTable({ list, q, setQ, serwisowe, setSerwisowe, selected, highlight, fresh, planned }: {
  list: JobView[]; q: string; setQ: (q: string) => void; serwisowe: boolean; setSerwisowe: (v: boolean) => void; selected?: string; highlight?: string; fresh: Map<string, number>; planned: Set<string>;
}) {
  const admin = useIsAdmin();
  const group = useStatusGroup();
  const crew = useCrewColor();
  const abbr = useCatAbbr();
  const kats = useDict('kategoria');
  const [zakres, setZakres] = useState<Zakres>('aktualne');
  const [kat, setKat] = useState<string>();
  const [creating, setCreating] = useState(false);
  // otwarte zlecenie (klik, link z powiadomienia, wstecz) zawsze ma swój wiersz: zakres i branża idą za nim, raz na zmianę zlecenia
  const [shownFor, setShownFor] = useState<string>();
  const sel = selected ? list.find((j) => j.id === selected) : undefined;
  if (sel && shownFor !== selected) {
    setShownFor(selected);
    setZakres(group(sel.status) as Zakres);
    if (kat && sel.kategoria !== kat) setKat(undefined);
  }
  useEffect(() => { document.querySelector(`a[aria-current="page"][href="#zl/${selected}"]`)?.closest('tr')?.scrollIntoView({ block: 'nearest' }); }, [selected, shownFor]);
  const nazwa = (j: JobView) => j.client?.nazwa ?? j.newClient?.nazwa ?? 'Klient';
  const inKat = list.filter((j) => !kat || j.kategoria === kat);
  const rows = inKat.filter((j) => group(j.status) === zakres);
  const { rows: sorted, by } = useSort(rows, {
    kat: (j) => (j.kategoria ? abbr(j.kategoria) : ''), nr: (j) => j.numer, klient: nazwa, miejsc: (j) => j.site?.miejscowosc,
    status: (j) => j.status, ekipa: (j) => j.ekipa, termin: (j) => j.termin,
    uwagi: (j) => (fresh.get(j.id) ?? 0) * 2 + Number(group(j.status) === 'aktualne' && !planned.has(j.id)),
  }, selected ? ['miejsc', 'ekipa'] : []); // przy otwartej karcie te kolumny są ukryte, więc nie sortują
  const open = !!selected;
  return (
    <section className="mx-auto grid max-w-[1600px] gap-4 px-8 py-5">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative w-[22rem]">
          <span className="sr-only">Szukaj zlecenia</span>
          <MagnifyingGlass className="pointer-events-none absolute top-1/2 left-3.5 h-5 w-5 -translate-y-1/2 text-ink-2" />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Klient, miejscowość, numer" className="pl-10" />
        </label>
        <Segmented label="Zakres" value={zakres} onChange={setZakres}
          options={GROUPS.map(({ g, title }) => ({ v: g, label: `${title} ${inKat.filter((j) => group(j.status) === g).length}` }))} />
        <div role="radiogroup" aria-label="Branża" className="flex h-11 items-center gap-0.5 rounded-[4px] border border-line bg-card px-1">
          <button type="button" role="radio" aria-checked={!kat} onClick={() => setKat(undefined)}
            className={cn('h-8 rounded-[3px] px-2.5 text-sm font-semibold', !kat ? 'bg-ink text-bg' : 'text-ink-2 hover:bg-ink/6 hover:text-ink')}>Wszystkie</button>
          {kats.map((k) => {
            const on = kat === k.wartosc;
            return (
              <button key={k.id} type="button" role="radio" aria-checked={on} aria-label={k.wartosc} title={k.wartosc} onClick={() => setKat(on ? undefined : k.wartosc)}
                className={cn('grid h-8 place-items-center rounded-[3px] px-1 transition-opacity', on ? 'bg-ink/10 outline-2 -outline-offset-2 outline-ink' : kat ? 'opacity-45 hover:opacity-100' : 'hover:bg-ink/6')}>
                <CatTab name={k.wartosc} />
              </button>
            );
          })}
        </div>
        <SerwisToggle on={serwisowe} onChange={setSerwisowe} />
        {admin && <Button onClick={() => setCreating(true)} aria-label="Nowe zlecenie" className="ml-auto px-4"><Plus className="h-5 w-5" weight="bold" />Nowe zlecenie</Button>}
      </div>
      <div className={cn('grid items-start gap-4', open && 'grid-cols-[minmax(0,1fr)_27rem]')}>
        {!sorted.length ? (
          <Empty icon={q || kat || serwisowe ? MagnifyingGlass : Briefcase} title={q || kat || serwisowe ? 'Nic nie znaleziono w tym zakresie' : 'Brak zleceń w tym zakresie'}
            hint={q || kat || serwisowe ? 'Liczby przy zakresach pokazują, gdzie są pasujące zlecenia.' : admin ? 'Dodaj zlecenie przyciskiem Nowe zlecenie.' : 'Zlecenia pojawią się, gdy biuro je doda.'} />
        ) : (
          <Table aria-label="Zlecenia">
            <thead>
              <tr>
                <Th sort={by('kat')} pad="pl-2 pr-2.5" className="w-14"><span className="sr-only">Branża</span><span aria-hidden>Br.</span></Th>
                <Th sort={by('nr')} className="w-[5.5rem]">Nr</Th>
                <Th sort={by('klient')}>Klient</Th>
                {!open && <Th sort={by('miejsc')} className="w-[18%]">Miejscowość</Th>}
                <Th sort={by('status')} className="w-[8.5rem]">Status</Th>
                {!open && <Th sort={by('ekipa')} className="w-[9rem]">Ekipa</Th>}
                <Th sort={by('termin')} className="w-[6.5rem]">Termin</Th>
                <Th sort={by('uwagi')} className="w-[14.5rem]">Uwagi</Th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((j) => {
                const nowe = fresh.get(j.id) ?? 0;
                const on = j.id === selected;
                return (
                  <Tr key={j.id} href={`#zl/${j.id}`} selected={on} className="scroll-mt-28">
                    <Td pad="py-1.5 pr-2.5">{j.kategoria && <><CatTab name={j.kategoria} flush /><span className="sr-only">{j.kategoria}</span></>}</Td>
                    <Td className="font-extrabold">{j._tmp ? 'zapisywanie' : j.numer}</Td>
                    <Td>
                      {/* tekst dla czytnika na końcu linku: pierwszy fragment linku musi być widoczny (cel kliknięcia) */}
                      <a href={`#zl/${j.id}`} aria-current={on ? 'page' : undefined} className="font-bold hover:text-action">
                        {nazwa(j)}<span className="sr-only">, {j.numer}{nowe > 0 && `, ${nowe} ${nowe === 1 ? 'nowy' : 'nowe'}`}</span>
                      </a>
                      {open && j.site?.miejscowosc && <span className="text-ink-2">, {j.site.miejscowosc}</span>}
                    </Td>
                    {!open && <Td className="text-ink-2">{j.site?.miejscowosc}</Td>}
                    <Td>{j.status}</Td>
                    {!open && <Td className="text-ink-2">{j.ekipa ? <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: crew(j.ekipa) ?? 'var(--line)' }} aria-hidden />{j.ekipa}</span> : '—'}</Td>}
                    <Td>{terminKrotko(j.termin) || <span className="text-ink-2">bez terminu</span>}</Td>
                    <Td>
                      <span className="flex items-center gap-2">
                        {isSerwis(j) && <Badge tone="ink" className="h-5 px-1.5">Serwis</Badge>}
                        {nowe > 0 && <Badge tone="new" className="h-5 px-1.5"><span aria-hidden>{nowe} {nowe === 1 ? 'nowy' : 'nowe'}</span></Badge>}
                        {group(j.status) === 'aktualne' && !planned.has(j.id) && <span className="truncate text-sm font-bold text-danger">brak w harmonogramie</span>}
                      </span>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
        {open && <div key={selected} className="sticky top-[64px] max-h-[calc(100dvh-148px)] overflow-y-auto overscroll-contain"><JobCard id={selected} highlight={highlight} /></div>}
      </div>
      {creating && <JobForm onClose={() => setCreating(false)} />}
      <TitleCount n={sorted.length} />
    </section>
  );
}
