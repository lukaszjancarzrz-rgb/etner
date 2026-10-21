import { ArrowRight, CheckCircle, NotePencil, WarningCircle } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { api } from '../../core/api.js';
import { dayShort, useNames } from '../../core/data.js';
import { outbox } from '../../core/outbox.js';
import type { Rec } from '../../core/store.js';
import { Button } from '../../core/ui/button.js';
import { Dialog, Sheet } from '../../core/ui/sheet.js';
import { Skeleton } from '../../core/ui/skeleton.js';
import { toast } from '../../core/ui/toast.js';
import type { Ctx } from './Harmonogram.js';
import { CellView } from './Harmonogram.js';
import { cellKey, cellsOf, type Slot } from './model.js';

type DraftOut = { key: string; dzien: string; personId: string | null; proposal: Slot[] | { tekst: string }; proposalHash: string; by: string };
type Result = { applied: string[]; skipped: string[] };

/** Pasek szkiców (admin): liczba zmian, przegląd, zatwierdzenie z powiadomieniem. */
export function DraftBar({ drafts, people, entries, ctx }: { drafts: Rec[]; people: Rec[]; entries: Rec[]; ctx: Ctx }) {
  const [open, setOpen] = useState(false);
  if (!drafts.length) return null;
  const n = drafts.length;
  return (
    <>
      <div role="status" className="sticky top-[calc(3.75rem+env(safe-area-inset-top))] z-20 flex items-center gap-3 rounded-2xl border border-action/40 bg-card px-4 py-2.5 shadow-card desk:top-20">
        <NotePencil className="h-6 w-6 shrink-0 text-action" weight="duotone" />
        <p className="min-w-0 flex-1 text-sm leading-tight">
          <span className="font-bold">{n} {n === 1 ? 'zmiana' : n < 5 ? 'zmiany' : 'zmian'} w szkicu</span>
          <span className="block text-ink-2">Pracownicy jeszcze ich nie widzą.</span>
        </p>
        <Button size="sm" onClick={() => setOpen(true)}>Przejrzyj</Button>
      </div>
      {open && <Review drafts={drafts} people={people} entries={entries} ctx={ctx} onClose={() => setOpen(false)} />}
    </>
  );
}

function Review({ drafts, people, entries, ctx, onClose }: { drafts: Rec[]; people: Rec[]; entries: Rec[]; ctx: Ctx; onClose: () => void }) {
  const [list, setList] = useState<DraftOut[] | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const names = useNames();
  const personName = new Map(people.map((p) => [p.id, p.nazwa as string]));

  // Hashy szkiców, które admin widzi, bierzemy z serwera: zatwierdzenie obejmie tylko te wersje.
  const load = () => {
    const ds = drafts.map((d) => d.dzien as string).sort();
    setErr('');
    api<{ drafts?: DraftOut[] }>(`/api/schedule?from=${ds[0]}&to=${ds.at(-1)}`)
      .then((r) => setList(r.drafts ?? []), () => setErr('Brak połączenia. Szkice można przejrzeć i zatwierdzić, gdy będzie zasięg.'));
  };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cells = cellsOf(entries);
  async function act(kind: 'approve' | 'discard') {
    if (!list?.length) return;
    setBusy(true);
    try {
      if (kind === 'approve') {
        const r = (await outbox.enqueue({ kind: 'harmonogram', url: '/api/schedule/approve', method: 'POST', body: { items: list.map((d) => ({ key: d.key, proposalHash: d.proposalHash })) } })) as Result;
        setRes(r);
        if (!r.skipped.length) { toast(`Zatwierdzono ${r.applied.length}`, { body: 'Pracownicy dostali powiadomienie o zmianach.', tone: 'ok' }); onClose(); }
        else { setList(null); load(); }
      } else {
        const keys = list.map((d) => d.key);
        await outbox.enqueue({ kind: 'harmonogram', url: '/api/schedule/discard', method: 'POST', body: { keys },
          optimistic: (s) => { for (const d of s.all('schedule_drafts')) if (keys.includes(cellKey(d.dzien, d.personId))) s.remove('schedule_drafts', d.id); } });
        toast('Szkice odrzucone', { tone: 'info' });
        onClose();
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <Sheet title="Szkice harmonogramu" description="Przed i po zmianie. Zatwierdzenie wysyła powiadomienia do osób, których dotyczy." className="desk:w-[min(720px,92vw)]">
        {res?.skipped.length ? (
          <p role="alert" className="mb-4 flex gap-2 rounded-xl border border-danger/40 p-3 text-sm">
            <WarningCircle className="h-5 w-5 shrink-0 text-danger" />
            <span>Zatwierdzono {res.applied.length}. Pominięto {res.skipped.length}: inny administrator zmienił te komórki w międzyczasie. Sprawdź je poniżej.</span>
          </p>
        ) : null}
        {err && <p role="alert" className="mb-4 rounded-xl border border-danger/40 p-3 text-sm text-danger">{err}</p>}
        {list === null && !err ? (
          <div className="grid gap-2" aria-busy="true">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>
        ) : list && !list.length ? (
          <p className="flex items-center gap-2 py-6 text-ink-2"><CheckCircle className="h-5 w-5 text-ok" />Wszystkie szkice są już zatwierdzone.</p>
        ) : list && (
          <ul className="grid max-h-[50dvh] gap-2 overflow-y-auto">
            {list.map((d) => {
              const note = !Array.isArray(d.proposal);
              return (
                <li key={d.key} className="grid gap-2 rounded-xl border border-line p-3">
                  <p className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                    <span className="font-bold">{d.personId ? personName.get(d.personId) ?? 'Osoba' : 'Uwagi dnia'}, {dayShort(d.dzien)}</span>
                    <span className="text-ink-2">szkic: {names(d.by)}</span>
                  </p>
                  {note ? (
                    <p className="text-sm">{(d.proposal as { tekst: string }).tekst || <span className="text-ink-2">usunięcie uwagi</span>}</p>
                  ) : (
                    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                      <div className="opacity-70"><CellView slots={cells.get(d.key) ?? []} ctx={ctx} compact /></div>
                      <ArrowRight className="h-4 w-4 text-ink-2" aria-label="zmiana na" />
                      <CellView slots={d.proposal as Slot[]} ctx={ctx} compact />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <Button variant="secondary" disabled={busy || !list?.length} onClick={() => void act('discard')}>Odrzuć</Button>
          <Button variant="ok" disabled={busy || !list?.length} onClick={() => void act('approve')}><CheckCircle className="h-5 w-5" weight="bold" />Zatwierdź i powiadom</Button>
        </div>
      </Sheet>
    </Dialog>
  );
}
