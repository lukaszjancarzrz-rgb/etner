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

const siteLabel = (s: Rec) => s.nazwa || [s.adres, s.miejscowosc].filter(Boolean).join(', ') || 'Obiekt';

/**
 * „Połącz z…” na obiekcie (admin, R70): obiekty tego samego klienta różniące się pisownią. Zlecenia, leady, teczki i paszport
 * przechodzą do obiektu, który zostaje (teczki tej samej kategorii się scalają), puste pola są uzupełniane, drugi znika.
 */
export function SiteMergeDialog({ a, sites, onClose }: { a: Rec; sites: Rec[]; onClose: () => void }) {
  const jobs = useEntities('jobs');
  const others = sites.filter((s) => s.id !== a.id && !s._tmp);
  const [bId, setBId] = useState(others.length === 1 ? others[0]!.id : '');
  const b = others.find((s) => s.id === bId);
  const [mainId, setMainId] = useState(a.id);

  function submit() {
    if (!b) return;
    const [main, dup] = mainId === b.id ? [b, a] : [a, b];
    void outbox.enqueue({
      kind: 'klient', url: `/api/sites/${main.id}/merge`, method: 'POST', body: { from: dup.id },
      optimistic: (s) => {
        for (const e of ['jobs', 'leads'] as const) for (const r of s.all(e).filter((x) => x.siteId === dup.id)) s.put(e, { ...r, siteId: main.id });
        // teczka tej samej kategorii scala się na serwerze; do synchronizacji widać teczkę głównego obiektu
        const kats = new Set(s.all('passport_folders').filter((f) => f.siteId === main.id).map((f) => f.kategoria));
        for (const f of s.all('passport_folders').filter((x) => x.siteId === dup.id)) {
          if (kats.has(f.kategoria)) s.remove('passport_folders', f.id);
          else s.put('passport_folders', { ...f, siteId: main.id });
        }
        const fill = (k: string) => main[k] || dup[k] || '';
        s.put('sites', { ...main, nazwa: fill('nazwa'), adres: fill('adres'), miejscowosc: fill('miejscowosc'), mapa: fill('mapa'), opis: main.opis && dup.opis && main.opis !== dup.opis ? `${main.opis}\n${dup.opis}` : fill('opis') });
        s.remove('sites', dup.id);
      },
    }).then(() => toast('Obiekty połączone', { body: `${siteLabel(dup)} → ${siteLabel(main)}` }), (x: Error) => toast('Nie połączono obiektów', { body: x.message, tone: 'error' }));
    if (location.hash.startsWith(`#psz/${dup.id}`)) go(location.hash.replace(dup.id, main.id));
    onClose();
  }

  const side = (s: Rec) => (
    <button type="button" role="radio" aria-checked={s.id === mainId} onClick={() => setMainId(s.id)}
      className={cn('grid gap-0.5 rounded-xl border-2 p-3 text-left transition-colors duration-200', s.id === mainId ? 'border-ok bg-ok/6' : 'border-line hover:border-ink-2')}>
      <span className={cn('text-xs font-semibold uppercase tracking-wide', s.id === mainId ? 'text-ok' : 'text-ink-2')}>{s.id === mainId ? 'Zostaje' : 'Znika, dane przechodzą'}</span>
      <span className="font-semibold">{siteLabel(s)}</span>
      <span className="text-sm text-ink-2 tabular-nums">{[[s.adres, s.miejscowosc].filter(Boolean).join(', '), `zleceń ${jobs.filter((j) => j.siteId === s.id).length}`].filter(Boolean).join(' · ')}</span>
    </button>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <Sheet title="Połącz obiekty" description="Zlecenia, leady, teczki i paszport przejdą do obiektu, który zostaje. Teczki tej samej kategorii się scalą, brakujące dane uzupełnimy." className="desk:w-[min(640px,92vw)]">
        <div className="grid gap-3">
          {others.length > 1 && (
            <Field label="Połącz z">
              {(id) => <Combobox id={id} value={bId} onValueChange={(v) => { setBId(v); setMainId(a.id); }} options={others.map((s) => ({ value: s.id, label: [siteLabel(s), s.nazwa ? [s.adres, s.miejscowosc].filter(Boolean).join(', ') : ''].filter(Boolean).join(' – ') }))} placeholder="Wybierz obiekt" search="Adres, miejscowość" empty="Nie ma takiego obiektu." />}
            </Field>
          )}
          {b && (
            <>
              <p className="text-sm font-semibold" id="merge-site-main">Który obiekt zostaje</p>
              <div role="radiogroup" aria-labelledby="merge-site-main" className="grid gap-2 min-[560px]:grid-cols-2">{side(a)}{side(b)}</div>
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
