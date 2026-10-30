import { ArrowsMerge } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { go } from '../../routes.js';
import { outbox } from '../../core/outbox.js';
import { useEntities, type Rec } from '../../core/store.js';
import { Button } from '../../core/ui/button.js';
import { cn } from '../../core/ui/cn.js';
import { Combobox } from '../../core/ui/combobox.js';
import { Field } from '../../core/ui/input.js';
import { Dialog, Sheet } from '../../core/ui/sheet.js';
import { toast } from '../../core/ui/toast.js';
import { mergedClient } from './forms.js';

/** Tabele z `clientId`, które przechodzą do głównego klienta (jak na serwerze w klienci.merge). */
const REFS = ['jobs', 'leads', 'sites', 'tasks'] as const;

/** Krótko o kliencie do porównania: telefon, miejscowość, liczba zleceń i leadów. */
function useSummary() {
  const sites = useEntities('sites');
  const jobs = useEntities('jobs');
  const leads = useEntities('leads');
  return (c: Rec) => {
    const n = (l: Rec[]) => l.filter((x) => x.clientId === c.id).length;
    const place = sites.find((s) => s.clientId === c.id)?.miejscowosc;
    return [c.telefony?.[0], c.emaile?.[0], place, `zleceń ${n(jobs)}`, `leadów ${n(leads)}`].filter(Boolean).join(' · ');
  };
}

/**
 * „Połącz” (admin, R58): wybór klienta głównego; zlecenia, leady, obiekty i zadania drugiego przechodzą do głównego,
 * puste pola głównego są uzupełniane, drugi znika z listy. Bez `b` – wybór drugiego klienta z listy („Połącz z…”).
 */
export function MergeDialog({ a, b: initialB, onClose }: { a: Rec; b?: Rec; onClose: () => void }) {
  const clients = useEntities('clients');
  const summary = useSummary();
  const [bId, setBId] = useState(initialB?.id ?? '');
  const b = initialB ?? clients.find((c) => c.id === bId);
  const [mainId, setMainId] = useState(a.id);
  const opts = useMemo(() => clients.filter((c) => c.id !== a.id).sort((x, y) => x.nazwa.localeCompare(y.nazwa, 'pl')).map((c) => ({ value: c.id, label: c.nazwa as string })), [clients, a.id]);

  function submit() {
    if (!b) return;
    const [main, dup] = mainId === b.id ? [b, a] : [a, b];
    void outbox.enqueue({
      kind: 'klient', url: `/api/clients/${main.id}/merge`, method: 'POST', body: { from: dup.id },
      optimistic: (s) => {
        for (const e of REFS) for (const r of s.all(e).filter((x) => x.clientId === dup.id)) s.put(e, { ...r, clientId: main.id });
        s.put('clients', mergedClient(main as Rec & { id: string; nazwa: string }, dup as Rec & { id: string; nazwa: string }));
        s.remove('clients', dup.id);
      },
    }).then(() => toast('Klienci połączeni', { body: `${dup.nazwa} → ${main.nazwa}` }), (x: Error) => toast('Nie połączono klientów', { body: x.message, tone: 'error' }));
    if (location.hash.startsWith(`#kl/${dup.id}`)) go(`#kl/${main.id}`);
    onClose();
  }

  // karta klienta jako opcja „zostaje” (dwie takie same nazwy rozróżnia telefon, miejscowość i liczby)
  const side = (c: Rec) => (
    <button type="button" role="radio" aria-checked={c.id === mainId} onClick={() => setMainId(c.id)}
      className={cn('grid gap-0.5 rounded-xl border-2 p-3 text-left transition-colors duration-200', c.id === mainId ? 'border-ok bg-ok/6' : 'border-line hover:border-ink-2')}>
      <span className={cn('text-xs font-semibold uppercase tracking-wide', c.id === mainId ? 'text-ok' : 'text-ink-2')}>{c.id === mainId ? 'Zostaje' : 'Znika, dane przechodzą'}</span>
      <span className="font-semibold">{c.nazwa}</span>
      <span className="text-sm text-ink-2 tabular-nums">{summary(c)}</span>
    </button>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <Sheet title="Połącz klientów" description="Zlecenia, leady, obiekty i zadania przejdą do klienta, który zostaje. Brakujące dane uzupełnimy, telefony i e-maile dodamy." className="desk:w-[min(640px,92vw)]">
        <div className="grid gap-3">
          {!initialB && (
            <Field label="Połącz z">
              {(id) => <Combobox id={id} value={bId} onValueChange={(v) => { setBId(v); setMainId(a.id); }} options={opts} placeholder="Wybierz klienta" search="Nazwisko, firma" empty="Nie ma takiego klienta." />}
            </Field>
          )}
          {b && (
            <>
              <p className="text-sm font-semibold" id="merge-main">Który klient zostaje</p>
              <div role="radiogroup" aria-labelledby="merge-main" className="grid gap-2 min-[560px]:grid-cols-2">{side(a)}{side(b)}</div>
            </>
          )}
          <div className="flex justify-end gap-3 border-t border-line pt-4">
            <Button variant="secondary" onClick={onClose}>Anuluj</Button>
            <Button onClick={submit} disabled={!b}><ArrowsMerge className="h-5 w-5" />Połącz</Button>
          </div>
        </div>
      </Sheet>
    </Dialog>
  );
}
