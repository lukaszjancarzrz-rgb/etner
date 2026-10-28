import { ListChecks } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { useEntities } from '../../core/store.js';
import { updateVia } from '../../core/write.js';
import { Button } from '../../core/ui/button.js';
import { Checkbox } from '../../core/ui/checkbox.js';
import { cn } from '../../core/ui/cn.js';
import { toast } from '../../core/ui/toast.js';
import { Card } from './card.js';
import { reviewList, reviewWhere } from './przeniesienie.js';

const PAGE = 50;

/** Lista „do przejrzenia” po przeniesieniu danych ze starego arkusza (R51): co sprawdzić ręcznie, odhaczanie „Przejrzane”. */
export function Przeniesienie() {
  const recs = useEntities('migration_review');
  const [showDone, setShowDone] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const { open, items } = useMemo(() => reviewList(recs, showDone), [recs, showDone]);
  const tick = (id: string, przejrzane: boolean) =>
    void updateVia('migration_review', id, { przejrzane }, { kind: 'przeniesienie', url: `/api/migration-review/${id}`, method: 'PUT', body: { przejrzane } })
      .catch((x: Error) => toast('Nie zapisano', { body: x.message, tone: 'error' }));

  return (
    <Card title="Do przejrzenia po przeniesieniu" icon={ListChecks}
      hint="Wpisy ze starego arkusza, które trzeba sprawdzić albo poprawić ręcznie (np. wpis w harmonogramie bez pasującego zlecenia). Odhacz, gdy sprawdzone.">
      {!recs.length ? <p className="text-sm text-ink-2">Brak pozycji. Lista pojawi się po przeniesieniu danych ze starego arkusza.</p> : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={cn('text-sm font-semibold', open ? 'text-ink' : 'text-ok')} role="status">
              {open ? `Do przejrzenia: ${open} z ${recs.length}` : `Wszystko przejrzane (${recs.length})`}
            </p>
            <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-semibold">
              <Checkbox checked={showDone} onCheckedChange={(v) => { setShowDone(v === true); setLimit(PAGE); }} />Pokaż przejrzane
            </label>
          </div>
          {items.length > 0 && (
            <ol className="grid gap-2" aria-label="Pozycje do przejrzenia">
              {items.slice(0, limit).map((r) => (
                <li key={r.id} className={cn('grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-xl border border-line px-3 py-2', r.przejrzane && 'opacity-70')}>
                  <Checkbox className="mt-0.5" checked={!!r.przejrzane} onCheckedChange={(v) => tick(r.id, v === true)} aria-label={`Przejrzane: ${r.opis}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold break-words">{r.opis}</p>
                    <p className="text-xs text-ink-2">
                      {reviewWhere(r)}
                      {r.pominiete && <span className="ml-2 rounded-full bg-danger/10 px-2 py-0.5 font-semibold text-danger">nie przeniesiono</span>}
                    </p>
                    {r.tekst && <p className="mt-0.5 text-sm break-words">„{r.tekst}”</p>}
                  </div>
                </li>
              ))}
            </ol>
          )}
          {items.length > limit && <Button variant="ghost" onClick={() => setLimit((l) => l + PAGE)}>Pokaż kolejne ({items.length - limit})</Button>}
        </>
      )}
    </Card>
  );
}
