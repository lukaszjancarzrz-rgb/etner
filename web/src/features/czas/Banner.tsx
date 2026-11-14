import { fmtMinuty } from '@etner/shared';
import { lazy, Suspense, useState } from 'react';
import { useMe } from '../../core/data.js';
import { Button } from '../../core/ui/button.js';
import { useNow, useOpisZlecenia, useWpisy } from './dane.js';
import { minuty, trwajacy } from './model.js';

const StopDialog = lazy(() => import('./StopDialog.js'));

/** Pasek na górze Harmonogramu, gdy licznik działa: link do #czas i Stop. */
export function CzasBanner() {
  const me = useMe();
  const r = trwajacy(useWpisy(), me?.id);
  const opis = useOpisZlecenia();
  const now = useNow(30_000);
  const [stop, setStop] = useState(false);
  if (!r) return null;
  return (
    <div className="flex items-center gap-3 rounded-[4px] bg-ok px-4 py-2 text-ok-ink">
      <a href="#czas" className="block min-w-0 flex-1 truncate py-2 font-semibold hover:underline focus-visible:outline-offset-2">
        Pracujesz: {opis(r.jobId).klient} · {fmtMinuty(minuty(r, new Date(now)))}
      </a>
      <Button size="sm" variant="secondary" onClick={() => setStop(true)}>Stop</Button>
      {stop && <Suspense fallback={null}><StopDialog entry={r} onClose={() => setStop(false)} /></Suspense>}
    </div>
  );
}
