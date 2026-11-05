import { BellRinging, Briefcase, CalendarBlank, MapPin, Phone } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { fmtDay, telHref, today, useDict, useLoading } from '../../core/data.js';
import { useEntities, type Rec } from '../../core/store.js';
import { Empty, SectionTitle } from '../../core/ui/bits.js';
import { Button } from '../../core/ui/button.js';
import { catStripe, CatTab, useCatColor } from '../../core/ui/category.js';
import { cn } from '../../core/ui/cn.js';
import { Table, Td, Th, Tr, useSort } from '../../core/ui/table.js';
import { useDesk } from '../../core/layout/status.js';
import { Skeleton } from '../../core/ui/skeleton.js';
import { toast } from '../../core/ui/toast.js';
import { createVia } from '../../core/write.js';
import { go } from '../../routes.js';
import { doSerwisu, type DoSerwisuRow } from './model.js';
import { pszHash, SerwisBadge, siteHash } from './Paszport.js';
import { FolderForm } from './Teczka.js';

type Wiersz = DoSerwisuRow;

/** Teczki, dla których w tej sesji zlecenie serwisowe już wysłano lub czeka w kolejce (podwójne dotknięcie offline = dwa zlecenia). */
const ordered = new Set<string>();

/** `#serwis` „Do serwisu” (admin, P13): teczki z serwisem w 30 dni i zaległe, od najwcześniejszego; teczki bez paszportu też (P15). */
export function DoSerwisu() {
  const loading = useLoading();
  const folders = useEntities('passport_folders');
  const sites = useEntities('sites');
  const clients = useEntities('clients');
  const day = today();
  const rows = useMemo(() => doSerwisu(folders, day, sites, clients), [folders, sites, clients, day]);
  const desk = useDesk();

  if (loading) return <div className="mx-auto grid max-w-3xl gap-3 p-4" aria-busy="true">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-40" />)}</div>;
  const groups: [string, Wiersz[]][] = [['Zaległe', rows.filter((r) => r.f.nastepnySerwis < day)], ['W ciągu 30 dni', rows.filter((r) => r.f.nastepnySerwis >= day)]];
  return (
    <section className={cn('mx-auto grid grid-cols-[minmax(0,1fr)] gap-6', desk ? 'max-w-[1400px] px-8 py-5' : 'max-w-3xl px-4 py-4')} aria-label="Do serwisu">
      {!rows.length ? <Empty icon={BellRinging} title="Brak serwisów w najbliższych 30 dniach" hint="Termin następnego serwisu ustawisz w teczce albo przy wpisie serwisowym." /> : (
        groups.map(([title, list]) => !!list.length && (
          <div key={title} className="grid grid-cols-[minmax(0,1fr)] gap-3">
            <SectionTitle count={list.length}>{title}</SectionTitle>
            {desk ? <SerwisTable title={title} list={list} /> : <ul className="grid grid-cols-[minmax(0,1fr)] gap-3" aria-label={title}>{list.map((r) => <Row key={r.f.id} {...r} />)}</ul>}
          </div>
        ))
      )}
    </section>
  );
}

/** Komputer: tabela grupy z sortowaniem; akcje w ostatniej kolumnie. */
function SerwisTable({ title, list }: { title: string; list: Wiersz[] }) {
  const { rows, by } = useSort(list, {
    klient: (r) => r.client?.nazwa, obiekt: (r) => [r.site.miejscowosc, r.site.nazwa, r.site.adres].filter(Boolean).join(' '), kat: (r) => r.f.kategoria, termin: (r) => r.f.nastepnySerwis,
  });
  return (
    <Table aria-label={title}>
      <thead>
        <tr>
          <Th sort={by('klient')} className="w-[16%]">Klient</Th>
          <Th sort={by('obiekt')}>Obiekt</Th>
          <Th sort={by('kat')} className="w-[11rem]">Kategoria</Th>
          <Th sort={by('termin')} className="w-[17rem]">Termin</Th>
          <Th className="w-[30rem]">Akcje</Th>
        </tr>
      </thead>
      <tbody>{rows.map((r) => <Row key={r.f.id} {...r} desk />)}</tbody>
    </Table>
  );
}

function Row({ f, site, client, desk }: Wiersz & { desk?: boolean }) {
  const cat = useCatColor();
  const status = useDict('status_zlecenia').find((d) => d.grupa === 'aktualne')?.wartosc;
  const [move, setMove] = useState(false);
  const [busy, setBusy] = useState(() => ordered.has(f.id));
  const tel = (client?.telefony as string[] | undefined)?.[0];
  const where = [site.miejscowosc, [site.nazwa, site.adres].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
  const note = [!f.przypomnienia ? 'przypomnienia e-mail wyłączone' : !(client?.emaile as string[] | undefined)?.length && 'klient bez e-maila – przypomnienie nie pójdzie'].filter(Boolean)[0];

  // serwer: klient i obiekt teczki, kategoria, rodzaj „serwis”, termin = miesiąc serwisu, pierwszy status „aktualne”
  async function zlecenie() {
    if (ordered.has(f.id)) return;
    ordered.add(f.id);
    setBusy(true);
    const p = createVia<Rec>('jobs', { kind: 'zlecenie', url: `/api/folders/${f.id}/zlecenie-serwisowe`, method: 'POST', body: {} },
      { clientId: site.clientId, siteId: site.id, kategoria: f.kategoria, rodzaj: 'serwis', termin: f.nastepnySerwis.slice(0, 7), status, ekipa: null });
    const failed = (x: Error) => { ordered.delete(f.id); setBusy(false); toast('Zlecenie nie zostało zapisane', { body: x.message, tone: 'error' }); };
    if (!navigator.onLine) {
      toast('Zapisane w telefonie', { body: 'Zlecenie wyśle się, gdy wróci zasięg.' });
      p.catch(failed);
      return;
    }
    try {
      const r = await p;
      if (r?.id) go(`#zl/${r.id}`);
    } catch (x) { failed(x as Error); }
  }

  const form = move && <FolderForm t={{ folder: f, kategoria: f.kategoria }} siteId={site.id} onClose={() => setMove(false)} />;
  if (desk) return (
    <Tr href={siteHash(site.id)}>
      <Td><a href={siteHash(site.id)} className="font-bold hover:text-action">{client?.nazwa || 'Klient'}</a></Td>
      <Td className="text-ink-2" title={note || undefined}>{where || 'Obiekt'}{note && <span className="text-sm">{' – '}{note}</span>}</Td>
      <Td pad="py-1.5 pr-2.5">
        <a href={pszHash(site.id, f.kategoria)} className="inline-flex items-center gap-2 font-semibold hover:text-action">
          <CatTab name={f.kategoria} flush /><span><span className="sr-only">Teczka: </span>{f.kategoria}</span>
        </a>
      </Td>
      <Td><span className="flex items-center gap-2"><span className="font-bold">{fmtDay(f.nastepnySerwis)}</span><SerwisBadge nastepny={f.nastepnySerwis} /></span></Td>
      <Td pad="px-2.5">
        <span className="flex items-center gap-1.5">
          <Button size="sm" disabled={busy} onClick={() => void zlecenie()}><Briefcase className="h-4 w-4" weight="bold" />Zrób zlecenie serwisowe</Button>
          <Button size="sm" variant="secondary" onClick={() => setMove(true)}><CalendarBlank className="h-4 w-4" />Przesuń termin</Button>
          {tel && <a href={telHref(tel)} aria-label={`Zadzwoń: ${tel}`} title={tel} className="inline-flex h-10 w-10 items-center justify-center rounded-[4px] border border-line hover:border-ink-2"><Phone className="h-4 w-4" /></a>}
        </span>
        {form}
      </Td>
    </Tr>
  );
  return (
    <li className="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-2xl border border-line bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <a href={siteHash(site.id)} className="min-w-0 hover:underline">
          <span className="block text-lg font-extrabold leading-tight break-words">{client?.nazwa || 'Klient'}</span>
          <span className="mt-0.5 flex min-w-0 items-start gap-1.5 text-sm text-ink-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span className="min-w-0 break-words">{where || 'Obiekt'}</span></span>
        </a>
        <span className="grid shrink-0 justify-items-end gap-1">
          <span className="font-extrabold tabular-nums">{fmtDay(f.nastepnySerwis)}</span>
          <SerwisBadge nastepny={f.nastepnySerwis} />
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <a href={pszHash(site.id, f.kategoria)} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-3 text-sm font-semibold hover:border-ink-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: catStripe(cat(f.kategoria)) }} aria-hidden />
          Teczka: {f.kategoria}
        </a>
        {note && <span className="text-sm text-ink-2">{note}</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy} onClick={() => void zlecenie()}><Briefcase className="h-4 w-4" weight="bold" />Zrób zlecenie serwisowe</Button>
        <Button size="sm" variant="secondary" onClick={() => setMove(true)}><CalendarBlank className="h-4 w-4" />Przesuń termin</Button>
        {tel && <a href={telHref(tel)} aria-label={`Zadzwoń: ${tel}`} className="inline-flex h-10 items-center gap-2 rounded-full border border-line px-4 text-sm font-semibold hover:border-ink-2"><Phone className="h-4 w-4" />Zadzwoń</a>}
      </div>
      {form}
    </li>
  );
}
