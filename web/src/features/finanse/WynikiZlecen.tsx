import { Briefcase } from '@phosphor-icons/react';
import { fmtZl } from '@etner/shared';
import { useMemo } from 'react';
import { useDesk } from '../../core/layout/status.js';
import { useEntities } from '../../core/store.js';
import { Empty, SectionTitle } from '../../core/ui/bits.js';
import { CatTab } from '../../core/ui/category.js';
import { cn } from '../../core/ui/cn.js';
import { Table, Td, Th, Tr, useSort } from '../../core/ui/table.js';
import { wynikiZlecen } from './model.js';
import { useKosztDnia } from '../place/dane.js';

const proc = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);

/** Wyniki zleceń z przychodem w roku: przychód, materiały i robocizna (szacunki), wynik, marża; średnia marża wg branży. */
export function WynikiZlecen({ rok }: { rok: string }) {
  const desk = useDesk();
  const jobs = useEntities('jobs'), revenues = useEntities('revenues'), entries = useEntities('schedule_entries'), clients = useEntities('clients');
  const koszt = useKosztDnia();
  const klient = useMemo(() => new Map(clients.map((c) => [c.id as string, c.nazwa as string])), [clients]);
  const list = useMemo(() => wynikiZlecen(jobs, revenues, entries, koszt, rok), [jobs, revenues, entries, koszt, rok]);
  const branze = useMemo(() => {
    const m = new Map<string, { p: number; w: number; n: number }>();
    for (const r of list) { const k = (r.job.kategoria as string) || 'Bez branży'; const v = m.get(k) ?? { p: 0, w: 0, n: 0 }; v.p += r.przychod; v.w += r.wynik; v.n++; m.set(k, v); }
    return [...m].map(([k, v]) => ({ k, n: v.n, marza: v.p ? v.w / v.p : null })).sort((a, b) => b.n - a.n);
  }, [list]);
  const { rows, by } = useSort(list, { nr: (r) => r.job.numer, klient: (r) => klient.get(r.job.clientId as string), kat: (r) => r.job.kategoria, p: (r) => r.przychod, m: (r) => r.materialy, rob: (r) => r.robocizna, w: (r) => r.wynik, marza: (r) => r.marza ?? -99 });
  if (!list.length) return <Empty icon={Briefcase} title="Brak zleceń z przychodem w tym roku" hint="Przychody z importu arkusza nie są powiązane ze zleceniami – wynik zlecenia liczy się dla przychodów dodanych przy zleceniu." />;
  return (
    <div className="grid gap-4">
      <p className="text-sm text-ink-2">Materiały i robocizna to szacunki: materiały wpisane przy przychodzie, robocizna = dni z harmonogramu × koszt dnia osoby z Płac (koszt całkowity osoby w miesiącu ÷ jej dni pracy; bez danych płac – stawka osobodnia z Ustawień).</p>
      <section aria-label="Średnia marża wg branży" className="grid gap-2">
        <SectionTitle>Średnia marża wg branży</SectionTitle>
        <ul className="flex flex-wrap gap-2">{branze.map((b) => <li key={b.k} className="inline-flex items-center gap-2 rounded-[4px] border border-line bg-card px-3 py-1.5 text-sm"><CatTab name={b.k} /><span className="font-semibold">{b.k}</span><span className="tabular-nums">{proc(b.marza)}</span><span className="text-ink-2">({b.n})</span></li>)}</ul>
      </section>
      {desk ? (
        <Table aria-label="Wyniki zleceń">
          <thead><tr>
            <Th sort={by('kat')} className="w-14" pad="pl-2 pr-2.5">Br.</Th><Th sort={by('nr')} className="w-[6.5rem]">Zlecenie</Th><Th sort={by('klient')}>Klient</Th>
            <Th sort={by('p')} num className="w-[8rem]">Przychód</Th><Th sort={by('m')} num className="w-[8rem]">Materiały</Th><Th sort={by('rob')} num className="w-[8rem]">Robocizna</Th>
            <Th sort={by('w')} num className="w-[8rem]">Wynik</Th><Th sort={by('marza')} num className="w-[6rem]">Marża</Th>
          </tr></thead>
          <tbody>{rows.map((r) => (
            <Tr key={r.job.id} href={`#zl/${r.job.id}`}>
              <Td pad="pr-2.5 py-1.5">{r.job.kategoria ? <CatTab name={r.job.kategoria} flush /> : null}</Td>
              <Td><a href={`#zl/${r.job.id}`} className="font-semibold text-action hover:underline">{r.job.numer}</a></Td>
              <Td>{klient.get(r.job.clientId as string)}</Td>
              <Td num>{fmtZl(r.przychod)}</Td><Td num className="text-ink-2">{fmtZl(r.materialy)}</Td><Td num className="text-ink-2">{fmtZl(r.robocizna)}</Td>
              <Td num className={cn('font-semibold', r.wynik < 0 && 'text-danger')}>{fmtZl(r.wynik)}</Td><Td num>{proc(r.marza)}</Td>
            </Tr>
          ))}</tbody>
        </Table>
      ) : (
        <ul className="grid gap-2">{rows.map((r) => (
          <li key={r.job.id}><a href={`#zl/${r.job.id}`} className="grid gap-1 rounded-[4px] border border-line bg-card p-4">
            <span className="flex items-center gap-2">{r.job.kategoria && <CatTab name={r.job.kategoria} />}<span className="font-bold">{klient.get(r.job.clientId as string)}</span><span className="text-sm text-ink-2">{r.job.numer}</span></span>
            <span className="flex flex-wrap gap-x-4 text-sm tabular-nums"><span>Przychód {fmtZl(r.przychod)}</span><span className={cn('font-semibold', r.wynik < 0 && 'text-danger')}>Wynik {fmtZl(r.wynik)} · {proc(r.marza)}</span></span>
          </a></li>
        ))}</ul>
      )}
    </div>
  );
}
