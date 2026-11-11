import { fmtZl, rozbij, SPOSOBY, SPOSOB_LABEL, type Sposob } from '@etner/shared';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../core/api.js';
import { outbox } from '../../core/outbox.js';
import { today, useDict } from '../../core/data.js';
import type { Rec } from '../../core/store.js';
import { Segmented, Textarea } from '../../core/ui/bits.js';
import { Button } from '../../core/ui/button.js';
import { cn } from '../../core/ui/cn.js';
import { Field, Input } from '../../core/ui/input.js';
import { Select } from '../../core/ui/select.js';
import { Dialog, Sheet } from '../../core/ui/sheet.js';
import { toast } from '../../core/ui/toast.js';
import { createVia, updateVia } from '../../core/write.js';
import { parseZl } from '../leady/model.js';

const zlText = (gr: number | null | undefined) => (gr == null ? '' : fmtZl(gr).replace(/\s?zł$/, ''));
const NONE = '-';

/** Przychód: nowy (z `prefill`, np. ze zlecenia) albo edycja. Kwota brutto przy fakturze VAT, bez VAT przy „bez faktury” i zwrocie; netto i VAT na żywo. */
export function RevenueForm({ revenue, prefill, onClose }: { revenue?: Rec; prefill?: Partial<Rec>; onClose: () => void }) {
  const kategorie = useDict('kategoria');
  const src: Partial<Rec> = revenue ?? prefill ?? {};
  const [f, setF] = useState({
    kwota: zlText(revenue?.kwotaGr), sposob: (revenue?.sposob ?? 'bez') as Sposob, dzien: (revenue ? revenue.dzien : today()) ?? '', innyMiesiac: revenue?.innyMiesiac ?? '',
    nrFaktury: revenue?.nrFaktury ?? '', materialy: zlText(revenue?.materialyGr), kategoria: src.kategoria ?? '', klient: src.klient ?? '', miejscowosc: src.miejscowosc ?? '',
    opis: src.opis ?? '', uwagi: revenue?.uwagi ?? '',
  });
  const touched = useRef(!!revenue);
  const [err, setErr] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState(false);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  // domyślny sposób z ustawień, dopóki nikt go nie wybrał
  useEffect(() => {
    if (revenue) return;
    api<{ domyslnySposob: Sposob }>('/api/settings/finanse').then((s) => setF((x) => (touched.current ? x : { ...x, sposob: s.domyslnySposob })), () => {});
  }, [revenue]);

  const kw = f.kwota.trim() ? parseZl(f.kwota) : null;
  const podzial = kw && 'gr' in kw ? rozbij(kw.gr, f.sposob) : null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!kw) er.kwota = 'Wpisz kwotę'; else if ('error' in kw) er.kwota = kw.error;
    let materialyGr: number | null = null;
    if (f.materialy.trim()) { const m = parseZl(f.materialy); if ('error' in m) er.materialy = m.error; else materialyGr = m.gr; }
    if (!f.dzien && !f.innyMiesiac) er.dzien = 'Podaj datę zakończenia albo inny miesiąc';
    setErr(er);
    if (Object.keys(er).length || !kw || 'error' in kw) return;
    const body = {
      jobId: (src.jobId as string | null | undefined) ?? null, kategoria: f.kategoria || null, klient: f.klient.trim(), miejscowosc: f.miejscowosc.trim(), opis: f.opis.trim(),
      sposob: f.sposob, kwotaGr: kw.gr, dzien: f.dzien || null, innyMiesiac: f.innyMiesiac || null, nrFaktury: f.nrFaktury.trim(), materialyGr, uwagi: f.uwagi.trim(),
    };
    const fail = (x: Error) => toast('Przychód nie został zapisany', { body: x.message, tone: 'error' });
    const opt = { ...body, ...podzial, miesiac: body.innyMiesiac || body.dzien?.slice(0, 7) };
    void (revenue
      ? updateVia('revenues', revenue.id, opt, { kind: 'przychod', url: `/api/revenues/${revenue.id}`, method: 'PUT', body })
      : createVia('revenues', { kind: 'przychod', url: '/api/revenues', method: 'POST', body }, opt)).catch(fail);
    onClose();
  }
  function remove() {
    if (!confirm) return setConfirm(true);
    void outbox.enqueue({ kind: 'przychod', url: `/api/revenues/${revenue!.id}`, method: 'DELETE', optimistic: (s) => s.remove('revenues', revenue!.id) })
      .catch((x: Error) => toast('Nie usunięto przychodu', { body: x.message, tone: 'error' }));
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <Sheet title={revenue ? 'Przychód' : 'Nowy przychód'} className="desk:w-[min(640px,92vw)]">
        <form onSubmit={submit} noValidate className="grid gap-4">
          <Field label={f.sposob === 'vat8' || f.sposob === 'vat23' ? 'Kwota brutto (zł)' : 'Kwota (zł)'} error={err.kwota}
            hint={podzial ? undefined : 'Przy fakturze VAT wpisz kwotę brutto.'}>
            {(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!err.kwota} inputMode="decimal" value={f.kwota} onChange={(e) => set({ kwota: e.target.value })} placeholder="np. 12 000" autoFocus />}
          </Field>
          <Segmented label="Sposób rozliczenia" value={f.sposob} onChange={(sposob) => { touched.current = true; set({ sposob }); }} options={SPOSOBY.map((v) => ({ v, label: SPOSOB_LABEL[v] }))} className="[&>button]:h-auto [&>button]:min-h-11 [&>button]:whitespace-normal [&>button]:py-1" />
          <p className={cn('text-sm font-semibold tabular-nums', !podzial && 'text-ink-2')} role="status">{podzial ? `Netto ${fmtZl(podzial.nettoGr)} · VAT ${fmtZl(podzial.vatGr)}` : 'Netto … · VAT …'}</p>
          <div className="grid gap-4 min-[560px]:grid-cols-2">
            <Field label="Data zakończenia" error={err.dzien}>{(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!err.dzien} type="date" value={f.dzien} onChange={(e) => set({ dzien: e.target.value })} />}</Field>
            <Field label="Inny miesiąc (opcjonalnie)" hint="Gdy przychód liczy się do innego miesiąca niż data.">{(id, d) => <Input id={id} aria-describedby={d} type="month" value={f.innyMiesiac} onChange={(e) => set({ innyMiesiac: e.target.value })} />}</Field>
            <Field label="Nr faktury">{(id) => <Input id={id} value={f.nrFaktury} onChange={(e) => set({ nrFaktury: e.target.value })} />}</Field>
            <Field label="Materiały (szacunek, zł)" error={err.materialy}>{(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!err.materialy} inputMode="decimal" value={f.materialy} onChange={(e) => set({ materialy: e.target.value })} />}</Field>
            <Field label="Branża">{(id) => <Select id={id} value={f.kategoria || NONE} onValueChange={(v) => set({ kategoria: v === NONE ? '' : v })} options={[{ value: NONE, label: 'Bez branży' }, ...kategorie.map((x) => ({ value: x.wartosc as string, label: x.wartosc as string }))]} />}</Field>
            <Field label="Klient">{(id) => <Input id={id} value={f.klient} onChange={(e) => set({ klient: e.target.value })} />}</Field>
            <Field label="Miejscowość">{(id) => <Input id={id} value={f.miejscowosc} onChange={(e) => set({ miejscowosc: e.target.value })} />}</Field>
            <Field label="Opis">{(id) => <Input id={id} value={f.opis} onChange={(e) => set({ opis: e.target.value })} />}</Field>
          </div>
          <Field label="Uwagi">{(id) => <Textarea id={id} value={f.uwagi} onChange={(e) => set({ uwagi: e.target.value })} />}</Field>
          <div className="flex flex-wrap justify-between gap-3 border-t border-line pt-4">
            {revenue ? <Button variant={confirm ? 'danger' : 'ghost'} onClick={remove} className={cn(!confirm && 'text-danger')}>{confirm ? 'Na pewno usunąć?' : 'Usuń przychód'}</Button> : <span />}
            <div className="flex gap-3"><Button variant="secondary" onClick={onClose}>Anuluj</Button><Button type="submit">Zapisz przychód</Button></div>
          </div>
        </form>
      </Sheet>
    </Dialog>
  );
}
