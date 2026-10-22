import { fmtZl, toGr } from '@etner/shared';
import { useState } from 'react';
import { go } from '../../routes.js';
import { useDict } from '../../core/data.js';
import type { Rec } from '../../core/store.js';
import { Textarea } from '../../core/ui/bits.js';
import { Button } from '../../core/ui/button.js';
import { Field, Input } from '../../core/ui/input.js';
import { Select } from '../../core/ui/select.js';
import { Dialog, Sheet } from '../../core/ui/sheet.js';
import { toast } from '../../core/ui/toast.js';
import { createVia, updateVia } from '../../core/write.js';
import { ClientPicker, newClientBody, type NewClient } from '../klienci/ClientPicker.js';

const opts = (d: Rec[]) => d.map((x) => ({ value: x.wartosc as string, label: x.wartosc as string }));
const zlText = (gr: number | null | undefined) => (gr == null ? '' : fmtZl(gr).replace(/\s?zł$/, ''));

/** Nowy lead albo edycja: klient (też nowy z obiektem), kategoria, temat, źródło, opis, wartość, następny kontakt, status. */
export function LeadForm({ lead, onClose }: { lead?: Rec; onClose: () => void }) {
  const statusy = useDict('status_leada');
  const kategorie = useDict('kategoria');
  const zrodla = useDict('zrodlo');
  const [f, setF] = useState({
    clientId: lead?.clientId ?? '', siteId: lead?.siteId ?? '', status: lead?.status ?? statusy[0]?.wartosc ?? '', kategoria: lead?.kategoria ?? '',
    temat: lead?.temat ?? '', zrodlo: lead?.zrodlo ?? '', opis: lead?.opis ?? '', wartosc: zlText(lead?.wartoscGr), nastepny: lead?.nastepny ?? '',
  });
  const [nowy, setNowy] = useState<NewClient | null>(null);
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!f.temat.trim()) er.temat = 'Podaj temat leada';
    if (nowy && !nowy.nazwa.trim()) er.nazwa = 'Podaj nazwę klienta';
    let wartoscGr: number | null = null;
    if (f.wartosc.trim()) {
      try { wartoscGr = toGr(f.wartosc); if (wartoscGr < 0) throw new Error(); } catch { er.wartosc = 'Wpisz kwotę, np. 12 000 albo 12000,50'; }
    }
    setErr(er);
    if (Object.keys(er).length) return;

    const body: Record<string, unknown> = {
      status: f.status, kategoria: f.kategoria, temat: f.temat.trim(), zrodlo: f.zrodlo, opis: f.opis.trim(), wartoscGr, nastepny: f.nastepny,
    };
    // Lead może nie mieć klienta (zapytanie bez danych); przy edycji klient idzie tylko po zmianie.
    if (nowy) Object.assign(body, newClientBody(nowy));
    else if (!lead ? f.clientId : f.clientId !== (lead.clientId ?? '') || f.siteId !== (lead.siteId ?? '')) { body.clientId = f.clientId || null; body.siteId = f.siteId || null; }
    const p = lead
      ? updateVia('leads', lead.id, body, { kind: 'lead', url: `/api/leads/${lead.id}`, method: 'PUT', body })
      : createVia<Rec>('leads', { kind: 'lead', url: '/api/leads', method: 'POST', body }, { ...body, clientId: f.clientId || null, newClient: body.newClient });
    if (!navigator.onLine) {
      toast('Zapisane w telefonie', { body: 'Lead wyśle się, gdy wróci zasięg.' });
      p.catch((x: Error) => toast('Lead nie został zapisany', { body: x.message, tone: 'error' }));
      return onClose();
    }
    setBusy(true);
    try {
      const r = (await p) as Rec;
      onClose();
      if (!lead && r?.id) go(`#ld/${r.id}`);
    } catch (x) {
      const m = (x as Error).message;
      setErr(/temat/i.test(m) ? { temat: m } : { form: m });
    } finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <Sheet title={lead ? `Lead ${lead.numer ?? ''}` : 'Nowy lead'} className="desk:w-[min(640px,92vw)]">
        <form onSubmit={(e) => void submit(e)} className="grid gap-4" noValidate>
          {err.form && <p role="alert" className="rounded-xl border border-danger/40 p-3 text-sm text-danger">{err.form}</p>}
          <ClientPicker clientId={f.clientId} siteId={f.siteId} onChange={set} nowy={nowy} onNowy={setNowy} err={err} />
          <Field label="Temat" error={err.temat}>{(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!err.temat} value={f.temat} onChange={(e) => set({ temat: e.target.value })} placeholder="np. Klimatyzacja do biura" />}</Field>
          <div className="grid gap-4 min-[560px]:grid-cols-2">
            <Field label="Kategoria">{(id) => <Select id={id} value={f.kategoria || undefined} onValueChange={(kategoria) => set({ kategoria })} options={opts(kategorie)} placeholder="Wybierz" />}</Field>
            <Field label="Źródło">{(id) => <Select id={id} value={f.zrodlo || undefined} onValueChange={(zrodlo) => set({ zrodlo })} options={opts(zrodla)} placeholder="Skąd przyszło zapytanie" />}</Field>
            <Field label="Wartość (zł netto)" error={err.wartosc} hint={!err.wartosc && f.wartosc.trim() ? (() => { try { return fmtZl(toGr(f.wartosc)); } catch { return undefined; } })() : undefined}>
              {(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!err.wartosc} inputMode="decimal" value={f.wartosc} onChange={(e) => set({ wartosc: e.target.value })} placeholder="np. 12 000" />}
            </Field>
            <Field label="Następny kontakt">{(id) => <Input id={id} type="date" value={f.nastepny} onChange={(e) => set({ nastepny: e.target.value })} />}</Field>
            <Field label="Status">{(id) => <Select id={id} value={f.status} onValueChange={(status) => set({ status })} options={opts(statusy)} />}</Field>
          </div>
          <Field label="Opis" hint="Trafi jako pierwszy punkt zakresu prac, gdy zrobisz zlecenie.">{(id, d) => <Textarea id={id} aria-describedby={d} value={f.opis} onChange={(e) => set({ opis: e.target.value })} />}</Field>
          <div className="flex justify-end gap-3 border-t border-line pt-4">
            <Button variant="secondary" onClick={onClose}>Anuluj</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Zapisywanie…' : 'Zapisz'}</Button>
          </div>
        </form>
      </Sheet>
    </Dialog>
  );
}
