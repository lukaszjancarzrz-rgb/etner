import { CaretDown, Handshake, MagnifyingGlass, Phone, Plus } from '@phosphor-icons/react';
import { TitleCount } from '../../core/layout/TopBar.js';
import { fmtZl } from '@etner/shared';
import { useEffect, useMemo, useState } from 'react';
import { fmtDay, matches, today, useLoading, useStatusGroup } from '../../core/data.js';
import { useEntities, type Rec } from '../../core/store.js';
import { Badge, Empty, SectionTitle } from '../../core/ui/bits.js';
import { Button } from '../../core/ui/button.js';
import { CatTab, useCatAbbr, useCatColor } from '../../core/ui/category.js';
import { Table, Td, Th, Tr, useSort } from '../../core/ui/table.js';
import { cn } from '../../core/ui/cn.js';
import { Input } from '../../core/ui/input.js';
import { Skeleton } from '../../core/ui/skeleton.js';
import { useDesk } from '../../core/layout/status.js';
import type { Route } from '../../routes.js';
import { LeadCard } from './LeadCard.js';
import { LeadForm } from './LeadForm.js';
import { leadSections } from './model.js';

/** Leady (admin): `#leady` lista, `#ld/<id>~<wpis>` karta; na komputerze tabele z sortowaniem, karta otwartego leada obok. */
export function Leady({ route }: { route: Route }) {
  const id = route.screen === 'ld' ? route.param : undefined;
  const desk = useDesk();
  if (desk) return (
    <div className={cn('mx-auto grid max-w-[1600px] items-start gap-6 px-8 py-5', id && 'grid-cols-[minmax(0,30rem)_minmax(0,1fr)]')}>
      <LeadList selected={id} />
      {id && <div key={id} className="sticky top-[64px] max-h-[calc(100dvh-96px)] overflow-y-auto overscroll-contain"><LeadCard id={id} highlight={route.highlight} /></div>}
    </div>
  );
  return (
    <div className="mx-auto max-w-[1400px] desk:grid desk:grid-cols-[minmax(340px,420px)_minmax(0,1fr)] desk:gap-6 desk:px-8 desk:py-6">
      <div className={cn('desk:sticky desk:top-22 desk:max-h-[calc(100dvh-7rem)] desk:self-start desk:overflow-y-auto desk:pr-1', id && 'hidden desk:block')}><LeadList selected={id} /></div>
      <div className={cn(!id && 'hidden desk:block')}>
        {id ? <LeadCard key={id} id={id} highlight={route.highlight} /> : (
          <div className="sticky top-24 hidden desk:block"><Empty icon={Handshake} title="Wybierz lead z listy" hint="Karta pokaże historię kontaktów i pozwoli zrobić zlecenie." /></div>
        )}
      </div>
    </div>
  );
}

const SECTIONS = [
  { k: 'aktualne', title: 'Na już' },
  { k: 'pozniej', title: 'Na kiedyś' },
  { k: 'zamkniete', title: 'Zamknięte' },
] as const;

function LeadList({ selected }: { selected?: string }) {
  const [q, setQ] = useState('');
  const [closedOpen, setClosedOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const loading = useLoading();
  const leads = useEntities('leads');
  const clients = useEntities('clients');
  const sites = useEntities('sites');
  const group = useStatusGroup('status_leada');
  const desk = useDesk();
  const day = today();
  const open = !!selected;

  const view = useMemo(() => {
    const c = new Map(clients.map((x) => [x.id, x]));
    const s = new Map(sites.map((x) => [x.id, x]));
    return leads.map((l): Rec => ({ ...l, client: c.get(l.clientId), site: s.get(l.siteId) }))
      .filter((l) => !q || matches(q, l.numer, l.temat, l.client?.nazwa, l.site?.miejscowosc, l.kategoria, l.zrodlo, l.status, l.opis, ...((l.client?.telefony as string[]) ?? [])));
  }, [leads, clients, sites, q]);
  const sec = useMemo(() => leadSections(view, group, day), [view, group, day]);

  if (loading) return <div className="grid gap-3 p-4" aria-busy="true" aria-label="Wczytywanie leadów">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>;

  return (
    <section className="grid gap-4 px-4 py-4 desk:px-0 desk:py-0">
      <div className="flex gap-2">
        <label className="relative min-w-0 flex-1 desk:max-w-[22rem]">
          <span className="sr-only">Szukaj leada</span>
          <MagnifyingGlass className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-ink-2" />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Klient, temat, miejscowość" className="pl-11" />
        </label>
        <Button onClick={() => setCreating(true)} aria-label="Nowy lead" className="desk:ml-auto desk:px-4"><Plus className="h-5 w-5" weight="bold" /><span className="hidden min-[420px]:inline">Nowy<span className="hidden desk:inline"> lead</span></span></Button>
      </div>
      {!view.length && (
        q ? <Empty icon={MagnifyingGlass} title="Nic nie znaleziono" hint="Sprawdź pisownię albo wpisz samo nazwisko lub miejscowość." />
          : <Empty icon={Handshake} title="Nie ma jeszcze leadów" hint="Dodaj zapytanie klienta przyciskiem Nowy." />
      )}
      {desk ? view.length > 0 && (
        <LeadTable selected={selected} open={open} groups={[
          { k: 'zalegle', title: 'Zaległe kontakty', list: sec.zalegle, overdue: day },
          ...SECTIONS.map(({ k, title }) => ({ k, title, list: sec[k], ...(k === 'zamkniete' && !q && { toggle: { open: closedOpen, onToggle: () => setClosedOpen((o) => !o) } }) })),
        ].filter((g) => g.list.length)} />
      ) : (
        <>
        {sec.zalegle.length > 0 && (
          <div className="grid gap-2">
            <SectionTitle count={sec.zalegle.length} className="border-danger text-danger">Zaległe kontakty</SectionTitle>
            <ul className="grid gap-2">{sec.zalegle.map((l) => <LeadRow key={l.id} l={l} on={l.id === selected} overdue={day} />)}</ul>
          </div>
        )}
        {SECTIONS.map(({ k, title }) => {
          const items = sec[k];
          if (!items.length) return null;
          const collapsed = k === 'zamkniete' && !closedOpen && !q;
          return (
            <div key={k} className="grid gap-2">
              <SectionTitle count={items.length} toggle={k === 'zamkniete' && !q ? { open: !collapsed, onToggle: () => setClosedOpen((o) => !o) } : undefined}>{title}</SectionTitle>
              {!collapsed && <ul className="grid gap-2">{items.map((l) => <LeadRow key={l.id} l={l} on={l.id === selected} />)}</ul>}
            </div>
          );
        })}
        </>
      )}
      {creating && <LeadForm onClose={() => setCreating(false)} />}
      <TitleCount n={view.length} />
    </section>
  );
}

const nazwaOf = (l: Rec): string => l.client?.nazwa ?? l.newClient?.nazwa ?? 'Bez klienta';

function Next({ l, overdue }: { l: Rec; overdue?: string }) {
  return l.nastepny ? (
    <span className={cn('inline-flex shrink-0 items-center gap-1', overdue ? 'font-bold text-danger' : 'text-ink-2')}>
      <Phone className="h-4 w-4" weight={overdue ? 'fill' : 'regular'} aria-hidden />
      <span className="sr-only">{overdue ? 'Kontakt zaległy:' : 'Następny kontakt:'}</span>
      {l.nastepny === overdue ? 'dziś' : fmtDay(l.nastepny)}
    </span>
  ) : null;
}

type Grupa = { k: string; title: string; list: Rec[]; overdue?: string; toggle?: { open: boolean; onToggle: () => void } };
/** Komputer: jedna tabela z jednym nagłówkiem kolumn, sekcje jako wiersze grup (sortowanie działa w każdej grupie); przy otwartej karcie tylko branża, klient, status i kontakt. */
function LeadTable({ groups, selected, open }: { groups: Grupa[]; selected?: string; open: boolean }) {
  const abbr = useCatAbbr();
  const { rows, by } = useSort(groups.flatMap((g) => g.list), {
    kat: (l) => (l.kategoria ? abbr(l.kategoria) : ''), nr: (l) => l.numer, klient: nazwaOf, temat: (l) => l.temat, miejsc: (l) => l.site?.miejscowosc,
    status: (l) => l.status, wartosc: (l) => l.wartoscGr, kontakt: (l) => l.nastepny,
  }, open ? ['nr', 'temat', 'miejsc', 'wartosc'] : []);
  useEffect(() => { document.querySelector(`a[aria-current="page"][href="#ld/${selected}"]`)?.closest('tr')?.scrollIntoView({ block: 'nearest' }); }, [selected]);
  return (
    <Table aria-label="Leady">
      <thead>
        <tr>
          <Th sort={by('kat')} pad="pl-2 pr-2.5" className="w-14"><span className="sr-only">Branża</span><span aria-hidden>Br.</span></Th>
          {!open && <Th sort={by('nr')} className="w-[5.5rem]">Nr</Th>}
          <Th sort={by('klient')}>Klient</Th>
          {!open && <Th sort={by('temat')} className="w-[24%]">Temat</Th>}
          {!open && <Th sort={by('miejsc')} className="w-[13%]">Miejscowość</Th>}
          <Th sort={by('status')} className="w-[8.5rem]">Status</Th>
          {!open && <Th sort={by('wartosc')} num className="w-[8rem]">Wartość</Th>}
          <Th sort={by('kontakt')} className="w-[8.5rem]">Kontakt</Th>
        </tr>
      </thead>
      {groups.map((g, i) => {
        const label = <>{g.title}<span className="font-sans font-semibold text-ink-2">{g.list.length}</span></>;
        return (
        <tbody key={g.k}>
          <tr>
            <th colSpan={open ? 4 : 8} scope="rowgroup" className={cn('border-b border-line bg-bg/60 px-2.5 text-left', i > 0 && 'border-t')}>
              <h2 className={cn('flex h-[var(--row-h)] items-center font-bold', g.overdue && 'text-danger')}>
                {g.toggle ? (
                  <button type="button" onClick={g.toggle.onToggle} aria-expanded={g.toggle.open} className="flex h-full flex-1 items-center gap-2 text-left">
                    {label}<CaretDown className={cn('ml-auto h-4 w-4 text-ink-2 transition-transform duration-200', g.toggle.open && 'rotate-180')} aria-hidden />
                  </button>
                ) : <span className="flex items-center gap-2">{label}</span>}
              </h2>
            </th>
          </tr>
          {(!g.toggle || g.toggle.open) && rows.filter((l) => g.list.includes(l)).map((l) => {
          const on = l.id === selected;
          const overdue = g.overdue;
          return (
            <Tr key={l.id} href={`#ld/${l.id}`} selected={on} className="scroll-mt-28">
              <Td pad="py-1.5 pr-2.5">{l.kategoria && <><CatTab name={l.kategoria} flush /><span className="sr-only">{l.kategoria}</span></>}</Td>
              {!open && <Td className="font-extrabold">{l.numer}</Td>}
              <Td>
                {/* temat dla czytnika na końcu linku: pierwszy fragment linku musi być widoczny (cel kliknięcia) */}
                <a href={`#ld/${l.id}`} aria-current={on ? 'page' : undefined} className="font-bold hover:text-action">
                  {nazwaOf(l)}{(open || l.temat) && <span className={cn(!open && 'sr-only', 'font-normal text-ink-2')}>{open ? `, ${[l.temat, l.site?.miejscowosc].filter(Boolean).join(', ')}` : `, ${l.temat}`}</span>}
                </a>
                {overdue && <Badge tone="warn" className="ml-2 h-5 px-2">zaległe</Badge>}
              </Td>
              {!open && <Td className="text-ink-2" title={l.temat || undefined}>{l.temat}</Td>}
              {!open && <Td className="text-ink-2">{l.site?.miejscowosc}</Td>}
              <Td>{l._tmp ? 'zapisywanie' : l.status}</Td>
              {!open && <Td num>{l.wartoscGr != null ? fmtZl(l.wartoscGr) : <span className="text-ink-2">—</span>}</Td>}
              <Td><Next l={l} overdue={overdue} /></Td>
            </Tr>
          );
        })}
        </tbody>
        );
      })}
    </Table>
  );
}

function LeadRow({ l, on, overdue }: { l: Rec; on: boolean; overdue?: string }) {
  const nazwa = nazwaOf(l);
  const next = l.nastepny && <Next l={l} overdue={overdue} />;
  return (
    <li>
      <a href={`#ld/${l.id}`} aria-current={on ? 'page' : undefined}
        className={cn('grid grid-cols-[minmax(0,1fr)] gap-1 rounded-[4px] border bg-card px-4 py-3 transition-colors duration-200 hover:border-ink-2', on ? 'border-action ring-2 ring-action/25' : overdue ? 'border-danger/60' : 'border-line')}>
        <span className="flex items-center gap-2 text-sm">
          {l.kategoria && <><CatTab name={l.kategoria} flush className="-ml-4" /><span className="sr-only">{l.kategoria}</span></>}
          {l._tmp && <span className="font-semibold text-ink-2">zapisywanie</span>}
          <span className="truncate text-ink-2">{l.status}</span>
          {overdue && <Badge tone="warn">zaległe</Badge>}
          {next && <span className="ml-auto inline-flex">{next}</span>}
        </span>
        <span className="truncate text-lg font-extrabold leading-tight">{nazwa}</span>
        <span className="flex items-end gap-2 text-sm text-ink-2">
          <span className="min-w-0 truncate">{[l.temat, l.site?.miejscowosc].filter(Boolean).join(', ')}</span>
        </span>
      </a>
    </li>
  );
}
