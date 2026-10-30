import { Handshake, MagnifyingGlass, Phone, Plus } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { fmtDay, matches, today, useLoading, useStatusGroup } from '../../core/data.js';
import { useEntities, type Rec } from '../../core/store.js';
import { Badge, Empty, SectionTitle } from '../../core/ui/bits.js';
import { Button } from '../../core/ui/button.js';
import { CategoryPill, useCatColor } from '../../core/ui/category.js';
import { cn } from '../../core/ui/cn.js';
import { Input } from '../../core/ui/input.js';
import { Skeleton } from '../../core/ui/skeleton.js';
import { useDesk } from '../../core/layout/status.js';
import type { Route } from '../../routes.js';
import { LeadCard } from './LeadCard.js';
import { LeadForm } from './LeadForm.js';
import { leadSections } from './model.js';

/** Leady (admin): `#leady` lista, `#ld/<id>~<wpis>` karta; na komputerze lista obok karty. */
export function Leady({ route }: { route: Route }) {
  const id = route.screen === 'ld' ? route.param : undefined;
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
  const ul = (frame = 'border-line') => desk ? `divide-y divide-line overflow-hidden rounded-2xl border bg-card ${frame}` : 'grid gap-2';

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
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Szukaj leada</span>
          <MagnifyingGlass className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-ink-2" />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Klient, temat, miejscowość" className="pl-11" />
        </label>
        <Button onClick={() => setCreating(true)} aria-label="Nowy lead" className="desk:px-4"><Plus className="h-5 w-5" weight="bold" /><span className="hidden min-[420px]:inline">Nowy</span></Button>
      </div>
      {!view.length && (
        q ? <Empty icon={MagnifyingGlass} title="Nic nie znaleziono" hint="Sprawdź pisownię albo wpisz samo nazwisko lub miejscowość." />
          : <Empty icon={Handshake} title="Nie ma jeszcze leadów" hint="Dodaj zapytanie klienta przyciskiem Nowy." />
      )}
      {sec.zalegle.length > 0 && (
        <div className="grid gap-2">
          <SectionTitle count={sec.zalegle.length} className="border-danger text-danger">Zaległe kontakty</SectionTitle>
          <ul className={ul('border-danger/60')}>{sec.zalegle.map((l) => <LeadRow key={l.id} desk={desk} l={l} on={l.id === selected} overdue={day} />)}</ul>
        </div>
      )}
      {SECTIONS.map(({ k, title }) => {
        const items = sec[k];
        if (!items.length) return null;
        const collapsed = k === 'zamkniete' && !closedOpen && !q;
        return (
          <div key={k} className="grid gap-2">
            <SectionTitle count={items.length} toggle={k === 'zamkniete' && !q ? { open: !collapsed, onToggle: () => setClosedOpen((o) => !o) } : undefined}>{title}</SectionTitle>
            {!collapsed && <ul className={ul()}>{items.map((l) => <LeadRow key={l.id} desk={desk} l={l} on={l.id === selected} />)}</ul>}
          </div>
        );
      })}
      {creating && <LeadForm onClose={() => setCreating(false)} />}
    </section>
  );
}

function LeadRow({ l, on, overdue, desk }: { l: Rec; on: boolean; overdue?: string; desk: boolean }) {
  const cat = useCatColor();
  const nazwa = l.client?.nazwa ?? l.newClient?.nazwa ?? 'Bez klienta';
  const next = l.nastepny && (
    <span className={cn('inline-flex shrink-0 items-center gap-1', overdue ? 'font-bold text-danger' : 'text-ink-2')}>
      <Phone className="h-4 w-4" weight={overdue ? 'fill' : 'regular'} aria-hidden />
      <span className="sr-only">{overdue ? 'Kontakt zaległy:' : 'Następny kontakt:'}</span>
      {l.nastepny === overdue ? 'dziś' : fmtDay(l.nastepny)}
    </span>
  );
  // komputer: zwarty wiersz jak w Zleceniach (klient, status / temat, miejscowość, termin kontaktu, kategoria)
  if (desk) return (
    <li>
      <a href={`#ld/${l.id}`} aria-current={on ? 'page' : undefined}
        className={cn('grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 border-l-4 px-3 py-2 transition-colors duration-200', on ? 'border-l-action bg-action/8' : overdue ? 'border-l-danger hover:bg-bg' : 'border-l-transparent hover:bg-bg')}>
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-semibold">{nazwa}</span>
          {overdue && <Badge tone="warn" className="h-5 px-2">zaległe</Badge>}
        </span>
        <span className="truncate text-right text-sm text-ink-2">{l._tmp ? 'zapisywanie' : l.status}</span>
        <span className="flex min-w-0 items-center gap-1.5 text-sm text-ink-2">
          {next}{next && (l.temat || l.site?.miejscowosc) && <span aria-hidden>·</span>}
          <span className="truncate">{[l.temat, l.site?.miejscowosc].filter(Boolean).join(', ')}</span>
        </span>
        <span className="flex justify-end">{l.kategoria && <CategoryPill name={l.kategoria} color={cat(l.kategoria)} className="max-w-[9rem]" />}</span>
      </a>
    </li>
  );
  return (
    <li>
      <a href={`#ld/${l.id}`} aria-current={on ? 'page' : undefined}
        className={cn('grid grid-cols-[minmax(0,1fr)] gap-1 rounded-2xl border bg-card px-4 py-3 transition-colors duration-200 hover:border-ink-2', on ? 'border-action ring-2 ring-action/25' : overdue ? 'border-danger/60' : 'border-line', overdue && 'border-l-4 border-l-danger')}>
        <span className="flex items-center gap-2 text-sm">
          {l._tmp && <span className="font-semibold text-ink-2">zapisywanie</span>}
          <span className="truncate text-ink-2">{l.status}</span>
          {overdue && <Badge tone="warn">zaległe</Badge>}
          {next && <span className="ml-auto inline-flex">{next}</span>}
        </span>
        <span className="truncate font-wide text-lg font-extrabold leading-tight">{nazwa}</span>
        <span className="flex items-end gap-2 text-sm text-ink-2">
          <span className="min-w-0 truncate">{[l.temat, l.site?.miejscowosc].filter(Boolean).join(', ')}</span>
          {l.kategoria && <CategoryPill name={l.kategoria} color={cat(l.kategoria)} className="ml-auto shrink-0" />}
        </span>
      </a>
    </li>
  );
}
