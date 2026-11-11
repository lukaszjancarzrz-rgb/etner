import { Coins, Plus } from '@phosphor-icons/react';
import { fmtZl, SPOSOB_LABEL, type Sposob } from '@etner/shared';
import { useMemo } from 'react';
import { store, useEntities, type Rec } from '../../core/store.js';
import { Button } from '../../core/ui/button.js';
import { cn } from '../../core/ui/cn.js';
import { wynikZlecenia } from './model.js';
import { openRevenue } from './RevenueHost.js';
import { prefillZlecenia } from './przychodZeZlecenia.js';
import { useKosztDnia } from '../place/dane.js';

const dni = (v: number) => v.toLocaleString('pl-PL', { maximumFractionDigits: 1 });

/** Karta zlecenia (admin): przychody zlecenia i wynik = przychód − materiały (szacunek) − robocizna z harmonogramu (pełny koszt firmy z Płac). */
export default function Rozliczenie({ jobId }: { jobId: string }) {
  const revenues = useEntities('revenues'), entries = useEntities('schedule_entries');
  const koszt = useKosztDnia();
  const przychody = revenues.filter((r) => r.jobId === jobId && !r.deletedAt);
  const w = useMemo(() => wynikZlecenia(jobId, revenues, entries, koszt), [jobId, revenues, entries, koszt]);
  const dodaj = () => { const job = store.get('jobs', jobId); if (job) openRevenue({ prefill: prefillZlecenia(job), fromJob: true }); };
  const Wiersz = ({ k, sub, v, strong }: { k: string; sub?: string; v: number; strong?: boolean }) => (
    <div className={cn('grid grid-cols-[minmax(0,1fr)_auto] gap-x-3', strong && 'border-t-2 border-ink pt-2 text-lg font-extrabold')}>
      <span>{k}{sub && <span className="block text-sm font-normal text-ink-2">{sub}</span>}</span>
      <span className={cn('tabular-nums whitespace-nowrap', strong && w.wynik < 0 && 'text-danger')}>{fmtZl(v)}</span>
    </div>
  );
  return (
    <section aria-label="Rozliczenie zlecenia" className="grid gap-3 rounded-[4px] border border-line bg-card p-4">
      <h2 className="flex items-center gap-2 text-lg font-bold"><Coins className="h-6 w-6 text-ok" weight="duotone" aria-hidden />Rozliczenie</h2>
      {!przychody.length ? (
        <div className="flex flex-wrap items-center gap-3"><p className="min-w-0 flex-1 basis-48 text-sm text-ink-2">Brak przychodu – wynik policzy się po dodaniu przychodu.</p>
          <Button size="sm" onClick={dodaj}><Plus className="h-4 w-4" weight="bold" />Dodaj przychód</Button></div>
      ) : (
        <>
          <ul className="flex flex-wrap gap-2">
            {przychody.map((r: Rec) => (
              <li key={r.id}><button type="button" onClick={() => openRevenue({ revenue: r })} className="inline-flex min-h-11 items-center gap-2 rounded-[4px] border border-line px-3 text-sm font-semibold hover:border-ink-2 desk:min-h-9">
                {r.nrFaktury || SPOSOB_LABEL[r.sposob as Sposob]} · <span className="tabular-nums">{fmtZl(r.kwotaGr as number)}</span></button></li>
            ))}
          </ul>
          <div className="grid gap-2">
            <Wiersz k="Przychód netto" v={w.przychod} />
            <Wiersz k="− Materiały" sub="szacunek z przychodu" v={-w.materialy || 0} />
            <Wiersz k="− Robocizna" sub={w.dni && !w.robocizna ? 'brak danych w Płacach – uzupełnij Płace albo stawkę osobodnia (Ustawienia → Finanse)' : `${dni(w.dni)} osobodni × koszt dnia osoby (Płace)`} v={-w.robocizna || 0} />
            <Wiersz k={`Wynik zlecenia${w.marza === null ? '' : ` · ${Math.round(w.marza * 100)}%`}`} v={w.wynik} strong />
          </div>
        </>
      )}
    </section>
  );
}
