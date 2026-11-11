import { fmtZl } from '@etner/shared';
import { useState } from 'react';
import { useDict } from '../../core/data.js';
import type { Rec } from '../../core/store.js';
import { Segmented, Textarea } from '../../core/ui/bits.js';
import { Button } from '../../core/ui/button.js';
import { Field, Input } from '../../core/ui/input.js';
import { Select } from '../../core/ui/select.js';
import { Dialog, Sheet } from '../../core/ui/sheet.js';
import { toast } from '../../core/ui/toast.js';
import { updateVia } from '../../core/write.js';
import { parseZl } from '../leady/model.js';

const KOLUMNY = [['12', '12 towary'], ['13', '13 uboczne'], ['14', '14 wynagr.'], ['15', '15 pozostałe']] as const;

/** Edycja kosztu (np. źle przypisana kategoria po imporcie KPiR). Zapis przez kolejkę jak przychody. */
export function CostForm({ cost, onClose }: { cost: Rec; onClose: () => void }) {
  const kategorie = useDict('kategoria_kosztu');
  const [f, setF] = useState({
    dzien: cost.dzien ?? '', miesiac: cost.miesiac ?? '', nrDokumentu: cost.nrDokumentu ?? '', kontrahent: cost.kontrahent ?? '', opis: cost.opis ?? '',
    kategoria: cost.kategoria ?? '', netto: fmtZl(cost.nettoGr).replace(/\s?zł$/, ''), kolumnaKpir: String(cost.kolumnaKpir) as '12' | '13' | '14' | '15',
    doWyniku: cost.doWyniku ? 'tak' : 'nie', uwagi: cost.uwagi ?? '',
  });
  const [err, setErr] = useState<Record<string, string>>({});
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    const kw = parseZl(f.netto);
    if ('error' in kw) er.netto = kw.error;
    if (!f.dzien) er.dzien = 'Podaj datę';
    if (!f.miesiac) er.miesiac = 'Podaj miesiąc';
    setErr(er);
    if (Object.keys(er).length || 'error' in kw) return;
    const body = {
      dzien: f.dzien, miesiac: f.miesiac, nrDokumentu: f.nrDokumentu.trim(), kontrahent: f.kontrahent.trim(), opis: f.opis.trim(), kategoria: f.kategoria,
      nettoGr: kw.gr, kolumnaKpir: Number(f.kolumnaKpir), doWyniku: f.doWyniku === 'tak', uwagi: f.uwagi.trim(),
    };
    void updateVia('costs', cost.id, body, { kind: 'koszt', url: `/api/costs/${cost.id}`, method: 'PUT', body })
      .catch((x: Error) => toast('Koszt nie został zapisany', { body: x.message, tone: 'error' }));
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <Sheet title="Koszt" className="desk:w-[min(640px,92vw)]">
        <form onSubmit={submit} noValidate className="grid gap-4">
          <div className="grid gap-4 min-[560px]:grid-cols-2">
            <Field label="Data" error={err.dzien}>{(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!err.dzien} type="date" value={f.dzien} onChange={(e) => set({ dzien: e.target.value })} />}</Field>
            <Field label="Miesiąc (KPiR)" error={err.miesiac}>{(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!err.miesiac} type="month" value={f.miesiac} onChange={(e) => set({ miesiac: e.target.value })} />}</Field>
            <Field label="Nr dokumentu">{(id) => <Input id={id} value={f.nrDokumentu} onChange={(e) => set({ nrDokumentu: e.target.value })} />}</Field>
            <Field label="Kontrahent">{(id) => <Input id={id} value={f.kontrahent} onChange={(e) => set({ kontrahent: e.target.value })} />}</Field>
            <Field label="Opis">{(id) => <Input id={id} value={f.opis} onChange={(e) => set({ opis: e.target.value })} />}</Field>
            <Field label="Kategoria">{(id) => <Select id={id} value={f.kategoria} onValueChange={(kategoria) => set({ kategoria })} options={[...new Set([f.kategoria, ...kategorie.map((x) => x.wartosc as string)])].filter(Boolean).map((v) => ({ value: v, label: v }))} />}</Field>
            <Field label="Netto (zł)" error={err.netto}>{(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!err.netto} inputMode="decimal" value={f.netto} onChange={(e) => set({ netto: e.target.value })} />}</Field>
          </div>
          <Segmented label="Kolumna KPiR" value={f.kolumnaKpir} onChange={(kolumnaKpir) => set({ kolumnaKpir })} options={KOLUMNY.map(([v, label]) => ({ v, label }))} className="[&>button]:h-auto [&>button]:min-h-11 [&>button]:whitespace-normal [&>button]:py-1" />
          <Segmented label="Do wyniku" value={f.doWyniku} onChange={(doWyniku) => set({ doWyniku })} options={[{ v: 'tak', label: 'Liczy się do wyniku' }, { v: 'nie', label: 'Poza wynikiem' }]} className="[&>button]:h-auto [&>button]:min-h-11 [&>button]:whitespace-normal [&>button]:py-1" />
          <Field label="Uwagi">{(id) => <Textarea id={id} value={f.uwagi} onChange={(e) => set({ uwagi: e.target.value })} />}</Field>
          <div className="flex justify-end gap-3 border-t border-line pt-4">
            <Button variant="secondary" onClick={onClose}>Anuluj</Button><Button type="submit">Zapisz koszt</Button>
          </div>
        </form>
      </Sheet>
    </Dialog>
  );
}
