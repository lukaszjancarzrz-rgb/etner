import { fmtZl, SPOSOB_LABEL, type Sposob } from '@etner/shared';
import { CaretDown, CaretRight, Coins, Plus } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { fmtDay, matches } from '../../core/data.js';
import { useDesk } from '../../core/layout/status.js';
import { useEntities, type Rec } from '../../core/store.js';
import { Empty } from '../../core/ui/bits.js';
import { Button } from '../../core/ui/button.js';
import { CatTab } from '../../core/ui/category.js';
import { Table, Td, Th, Tr, useSort } from '../../core/ui/table.js';
import { TitleCount } from '../../core/layout/TopBar.js';
import { miesiacWiersza, rozliczoneBezPrzychodu, sumaMiesiaca, wOkresie } from './model.js';
import { RevenueForm } from './RevenueForm.js';

export type Filtry = { q: string; okres: string; filtr: string };

/** Przychody wybranego okresu: tabela (komputer) albo karty (telefon), suma netto, zlecenia „Rozliczone” bez przychodu. */
export function Przychody({ q, okres, filtr }: Filtry) {
  const desk = useDesk();
  const revenues = useEntities('revenues');
  const jobs = useEntities('jobs');
  const clients = useEntities('clients');
  const sites = useEntities('sites');
  const [form, setForm] = useState<{ revenue?: Rec; prefill?: Partial<Rec> } | null>(null);
  const [open, setOpen] = useState(false);
  const numer = useMemo(() => new Map(jobs.map((j) => [j.id, j.numer as string])), [jobs]);

  const list = useMemo(() => revenues
    .filter((r) => !r.deletedAt && wOkresie(r, okres) && (!filtr || r.kategoria === filtr) && (!q || matches(q, r.klient, r.miejscowosc, r.opis, r.nrFaktury, r.jobId && numer.get(r.jobId))))
    .sort((a, b) => String(b.dzien ?? b.innyMiesiac).localeCompare(String(a.dzien ?? a.innyMiesiac))), [revenues, okres, filtr, q, numer]);
  const { rows, by } = useSort(list, {
    kat: (r) => r.kategoria, nr: (r) => numer.get(r.jobId), klient: (r) => r.klient, miejsc: (r) => r.miejscowosc, sposob: (r) => SPOSOB_LABEL[r.sposob as Sposob],
    kwota: (r) => r.kwotaGr, netto: (r) => r.nettoGr, faktura: (r) => r.nrFaktury, mies: (r) => miesiacWiersza(r),
  });
  const bez = useMemo(() => rozliczoneBezPrzychodu(jobs, revenues), [jobs, revenues]);
  const prefill = (j: Rec): Partial<Rec> => {
    const site = sites.find((s) => s.id === j.siteId);
    return { jobId: j.id, kategoria: j.kategoria, klient: clients.find((c) => c.id === j.clientId)?.nazwa ?? '', miejscowosc: site?.miejscowosc ?? '', opis: '' };
  };
  const suma = sumaMiesiaca(list, okres);
  const zlecenie = (r: Rec) => (r.jobId && numer.get(r.jobId) ? <a href={`#zl/${r.jobId}`} className="font-semibold text-action hover:underline">{numer.get(r.jobId)}</a> : <span className="text-ink-2">—</span>);

  return (
    <div className="grid gap-4">
      <TitleCount n={list.length} />
      <div className="flex justify-end"><Button onClick={() => setForm({})}><Plus className="h-5 w-5" weight="bold" />Przychód</Button></div>
      {bez.length > 0 && (
        <div className="rounded-[4px] border border-line bg-card">
          <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm font-semibold">
            {open ? <CaretDown className="h-4 w-4" aria-hidden /> : <CaretRight className="h-4 w-4" aria-hidden />}Rozliczone bez przychodu: {bez.length}
          </button>
          {open && (
            <ul className="divide-y divide-rule border-t border-line">
              {bez.map((j) => (
                <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span><a href={`#zl/${j.id}`} className="font-semibold text-action hover:underline">{j.numer}</a> <span className="text-ink-2">{prefill(j).klient}{prefill(j).miejscowosc ? `, ${prefill(j).miejscowosc}` : ''}</span></span>
                  <Button size="sm" variant="secondary" onClick={() => setForm({ prefill: prefill(j) })}>Dodaj przychód</Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {!rows.length ? <Empty icon={Coins} title="Brak przychodów w tym okresie" hint="Dodaj przychód przyciskiem u góry albo ze zlecenia „Rozliczone”." /> : desk ? (
        <Table aria-label="Przychody">
          <thead><tr>
            <Th sort={by('kat')} className="w-14" pad="px-0">Br.</Th><Th sort={by('nr')} className="w-[7rem]">Zlecenie</Th><Th sort={by('klient')}>Klient</Th><Th sort={by('miejsc')} className="w-[9rem]">Miejscowość</Th>
            <Th sort={by('sposob')} className="w-[9.5rem]">Sposób</Th><Th sort={by('kwota')} num className="w-[7.5rem]">Kwota</Th><Th sort={by('netto')} num className="w-[7.5rem]">Netto</Th>
            <Th sort={by('faktura')} className="w-[8rem]">Nr faktury</Th><Th sort={by('mies')} className="w-[6rem]">Miesiąc</Th>
          </tr></thead>
          <tbody>{rows.map((r) => (
            <Tr key={r.id} onOpen={r._tmp ? undefined : () => setForm({ revenue: r })}>
              <Td pad="pr-2.5 py-1.5">{r.kategoria ? <CatTab name={r.kategoria} flush /> : null}</Td>
              <Td>{zlecenie(r)}</Td><Td title={r.opis}>{r.klient}</Td><Td>{r.miejscowosc}</Td><Td className="text-sm text-ink-2">{SPOSOB_LABEL[r.sposob as Sposob]}</Td>
              <Td num>{fmtZl(r.kwotaGr)}</Td><Td num className="font-semibold">{fmtZl(r.nettoGr)}</Td><Td>{r.nrFaktury}</Td><Td>{miesiacWiersza(r)}</Td>
            </Tr>))}
          </tbody>
        </Table>
      ) : (
        <ul className="grid gap-3">{rows.map((r) => (
          <li key={r.id} className="rounded-[4px] border border-line bg-card">
            <button type="button" disabled={!!r._tmp} onClick={() => setForm({ revenue: r })} className="grid w-full gap-1 px-4 py-3 text-left">
              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0"><span className="block truncate font-extrabold">{r.klient || 'Przychód'}</span><span className="block truncate text-sm text-ink-2">{[r.miejscowosc, r.opis].filter(Boolean).join(' · ')}</span></span>
                <span className="shrink-0 text-right tabular-nums"><span className="block font-extrabold">{fmtZl(r.nettoGr)}</span><span className="block text-xs text-ink-2">netto</span></span>
              </span>
              <span className="flex flex-wrap items-center gap-x-3 text-sm text-ink-2">{r.kategoria && <CatTab name={r.kategoria} />}<span>{SPOSOB_LABEL[r.sposob as Sposob]}</span>{r.dzien && <span>{fmtDay(r.dzien)}</span>}{r.nrFaktury && <span>{r.nrFaktury}</span>}</span>
            </button>
            {r.jobId && numer.get(r.jobId) && <a href={`#zl/${r.jobId}`} className="mx-4 mb-3 inline-flex min-h-8 items-center text-sm font-semibold text-action">Zlecenie {numer.get(r.jobId)}</a>}
          </li>))}
        </ul>
      )}
      <p className="text-right text-lg font-extrabold tabular-nums">Razem netto: {fmtZl(suma)}</p>
      {form && <RevenueForm {...form} onClose={() => setForm(null)} />}
    </div>
  );
}
