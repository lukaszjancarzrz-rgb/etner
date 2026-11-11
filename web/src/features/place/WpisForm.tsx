import { RODZAJE_WPISU, RODZAJ_WPISU_LABEL, type RodzajWpisu } from '@etner/shared';
import { useState } from 'react';
import type { Rec } from '../../core/store.js';
import { Textarea } from '../../core/ui/bits.js';
import { Button } from '../../core/ui/button.js';
import { Field, Input } from '../../core/ui/input.js';
import { Select } from '../../core/ui/select.js';
import { Dialog, Sheet } from '../../core/ui/sheet.js';
import { parseZl } from '../leady/model.js';
import { zlText } from './fmt.js';
import { zapisz } from './zapis.js';

/** Zaliczka, przelew, premia albo inny koszt osoby w miesiącu (nowy albo edycja po kliknięciu). */
export function WpisForm({ wpis, osoby, osoba, miesiac, onClose }: { wpis?: Rec; osoby: { id: string; nazwa: string }[]; osoba?: string; miesiac: string; onClose: () => void }) {
  const [f, setF] = useState({
    personId: (wpis?.personId as string) ?? osoba ?? osoby[0]?.id ?? '', miesiac: (wpis?.miesiac as string) ?? miesiac, dzien: (wpis?.dzien as string) ?? '',
    rodzaj: ((wpis?.rodzaj as RodzajWpisu) ?? 'zaliczka') as RodzajWpisu, kwota: wpis ? zlText(wpis.kwotaGr) : '', opis: (wpis?.opis as string) ?? '',
  });
  const [err, setErr] = useState<Record<string, string>>({});
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    const kwota = parseZl(f.kwota);
    if ('error' in kwota) er.kwota = kwota.error;
    if (!f.personId) er.personId = 'Wybierz osobę';
    if (!/^\d{4}-\d{2}$/.test(f.miesiac)) er.miesiac = 'Podaj miesiąc';
    setErr(er);
    if (Object.keys(er).length || 'error' in kwota) return;
    const body = { miesiac: f.miesiac, dzien: f.dzien || null, rodzaj: f.rodzaj, kwotaGr: kwota.gr, opis: f.opis.trim() };
    void zapisz('payroll_entries', wpis, { kind: 'płace: wpis', url: wpis ? `/api/payroll/entries/${wpis.id}` : '/api/payroll/entries', method: wpis ? 'PUT' : 'POST', body: wpis ? body : { personId: f.personId, ...body } }, { personId: f.personId, ...body });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <Sheet title={wpis ? 'Wpis w płacach' : 'Nowy wpis w płacach'} className="desk:w-[min(560px,92vw)]">
        <form onSubmit={submit} noValidate className="grid gap-4">
          <div className="grid gap-4 min-[560px]:grid-cols-2">
            <Field label="Osoba" error={err.personId}>{(id, d) => wpis ? <Input id={id} value={osoby.find((o) => o.id === f.personId)?.nazwa ?? ''} readOnly /> : <Select id={id} aria-describedby={d} value={f.personId} onValueChange={(personId) => set({ personId })} options={osoby.map((o) => ({ value: o.id, label: o.nazwa }))} placeholder="Osoba" />}</Field>
            <Field label="Rodzaj">{(id) => <Select id={id} value={f.rodzaj} onValueChange={(rodzaj) => set({ rodzaj: rodzaj as RodzajWpisu })} options={RODZAJE_WPISU.map((r) => ({ value: r, label: RODZAJ_WPISU_LABEL[r] }))} />}</Field>
            <Field label="Miesiąc" error={err.miesiac}>{(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!err.miesiac} type="month" value={f.miesiac} onChange={(e) => set({ miesiac: e.target.value })} />}</Field>
            <Field label="Data (nieobowiązkowa)" error={err.dzien}>{(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!err.dzien} type="date" value={f.dzien} onChange={(e) => set({ dzien: e.target.value })} />}</Field>
            <Field label="Kwota (zł)" error={err.kwota}>{(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!err.kwota} inputMode="decimal" value={f.kwota} onChange={(e) => set({ kwota: e.target.value })} />}</Field>
          </div>
          <Field label="Opis">{(id) => <Textarea id={id} value={f.opis} onChange={(e) => set({ opis: e.target.value })} className="min-h-16" />}</Field>
          <div className="flex justify-end gap-3 border-t border-line pt-4">
            <Button variant="secondary" onClick={onClose}>Anuluj</Button><Button type="submit">Zapisz wpis</Button>
          </div>
        </form>
      </Sheet>
    </Dialog>
  );
}
