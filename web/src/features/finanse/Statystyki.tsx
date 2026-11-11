import { ChartBar } from '@phosphor-icons/react';
import { useMemo } from 'react';
import { useEntities } from '../../core/store.js';
import { Empty, SectionTitle } from '../../core/ui/bits.js';
import { CatTab } from '../../core/ui/category.js';
import { statystyki } from './model.js';

const dni = (v: number) => v.toLocaleString('pl-PL', { maximumFractionDigits: 1 });

/** Czas pracy z harmonogramu (osobodni) wg branży, ekipy i branża × ekipa – jak arkusz „Statystyki zleceń”. */
export function Statystyki({ rok }: { rok: string }) {
  const entries = useEntities('schedule_entries'), jobs = useEntities('jobs');
  const s = useMemo(() => statystyki(entries, jobs, rok), [entries, jobs, rok]);
  if (!s.razem) return <Empty icon={ChartBar} title="Brak dni w harmonogramie w tym roku" />;
  const ekipy = s.ekipy.map((e) => e.nazwa);
  const Tab = ({ title, rows, cat }: { title: string; rows: typeof s.kategorie; cat?: boolean }) => (
    <section className="grid gap-2" aria-label={title}>
      <SectionTitle>{title}</SectionTitle>
      <div className="overflow-x-auto rounded-[4px] border border-line bg-card">
        <table className="w-full text-sm tabular-nums">
          <thead><tr className="border-b-2 border-ink font-cond text-ink-2">
            <th scope="col" className="px-3 py-1.5 text-left font-semibold">{cat ? 'Branża' : 'Ekipa'}</th><th scope="col" className="px-3 text-right font-semibold">Zleceń</th>
            <th scope="col" className="px-3 text-right font-semibold">Osobodni</th><th scope="col" className="px-3 text-right font-semibold">Średnio na zlecenie</th><th scope="col" className="px-3 text-right font-semibold">Udział</th>
          </tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.nazwa} className="border-b border-rule last:border-0">
              <th scope="row" className="px-3 py-1.5 text-left font-semibold"><span className="inline-flex items-center gap-2">{cat && <CatTab name={r.nazwa} />}{r.nazwa}</span></th>
              <td className="px-3 text-right">{r.zlecen}</td><td className="px-3 text-right font-semibold">{dni(r.dni)}</td><td className="px-3 text-right">{dni(r.srednio)}</td><td className="px-3 text-right">{Math.round(r.udzial * 100)}%</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
  return (
    <div className="grid gap-6">
      <p className="text-sm text-ink-2">Liczą się dni zleceń wpisane w harmonogram w {rok} r. (pół dnia = 0,5). Razem: <span className="font-semibold">{dni(s.razem)} osobodni</span>.</p>
      <Tab title="Czas pracy wg branży" rows={s.kategorie} cat />
      <Tab title="Czas pracy wg ekipy" rows={s.ekipy} />
      <section className="grid gap-2" aria-label="Osobodni: branża × ekipa">
        <SectionTitle>Osobodni: branża × ekipa</SectionTitle>
        <div className="overflow-x-auto rounded-[4px] border border-line bg-card">
          <table className="w-full text-sm tabular-nums">
            <thead><tr className="border-b-2 border-ink font-cond text-ink-2"><th scope="col" className="px-3 py-1.5 text-left font-semibold">Branża</th>{ekipy.map((e) => <th key={e} scope="col" className="px-3 text-right font-semibold whitespace-nowrap">{e}</th>)}</tr></thead>
            <tbody>{s.kategorie.map((k) => (
              <tr key={k.nazwa} className="border-b border-rule last:border-0">
                <th scope="row" className="px-3 py-1.5 text-left font-semibold">{k.nazwa}</th>
                {ekipy.map((e) => { const v = s.krzyz.get(`${k.nazwa}\u0000${e}`); return <td key={e} className="px-3 text-right">{v ? dni(v) : <span className="text-ink-2">—</span>}</td>; })}
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
