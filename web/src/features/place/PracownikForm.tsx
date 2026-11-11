import { FORMA_LABEL, FORMY, parametryMiesiaca, type Forma } from '@etner/shared';
import { Plus } from '@phosphor-icons/react';
import { useState } from 'react';
import { useEntities, type Rec } from '../../core/store.js';
import { Segmented, Textarea } from '../../core/ui/bits.js';
import { Button } from '../../core/ui/button.js';
import { Field, Input } from '../../core/ui/input.js';
import { Select } from '../../core/ui/select.js';
import { Dialog, Sheet } from '../../core/ui/sheet.js';
import { parseZl } from '../leady/model.js';
import { kw, zlText } from './fmt.js';
import { kalkulatorUmowy, type Dane } from './model.js';
import { Usun } from './ui.js';
import { zapisz } from './zapis.js';

const gr = (t: string): number | null | { error: string } => { if (!t.trim()) return null; const k = parseZl(t); return 'error' in k ? k : k.gr; };
const liczba = (t: string) => Number(t.trim().replace(',', '.'));
const zlOpt = (v: unknown) => (v == null ? '' : zlText(v as number));

/** Dane płacowe osoby z harmonogramu: umowa, brutto, urlop, uwagi; historia stawek godzinowych; podgląd netto i kosztu umowy. */
export function PracownikForm({ osoba, dane, rec, onClose }: { osoba: Rec; dane: Dane; rec?: Rec; onClose: () => void }) {
  const [f, setF] = useState({
    forma: ((rec?.forma as Forma) ?? 'brak') as Forma, umowaOd: (rec?.umowaOd as string) ?? '', umowaDo: (rec?.umowaDo as string) ?? '', brutto: zlOpt(rec?.bruttoGr), koszt: zlOpt(rec?.kosztRecznyGr), kup: zlOpt(rec?.kupGr),
    urlopDni: String(rec?.urlopDni ?? 0).replace('.', ','), etat: String(rec?.etat ?? 1).replace('.', ','), staz10: rec?.staz10 ? 'tak' : 'nie', uwagi: (rec?.uwagi as string) ?? '',
  });
  const [err, setErr] = useState<Record<string, string>>({});
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const stawki = useEntities('payroll_rates').filter((s) => s.personId === osoba.id).sort((a, b) => String(b.odMiesiaca).localeCompare(String(a.odMiesiaca)));
  const [nowa, setNowa] = useState({ od: dane.dzis.slice(0, 7), stawka: '' });
  const [errS, setErrS] = useState('');

  const umowa = f.forma === 'uop' || f.forma === 'zlecenie';
  const b = gr(f.brutto), kup = gr(f.kup);
  const kalk = umowa && typeof b === 'number' && b > 0 ? kalkulatorUmowy(b, f.forma, typeof kup === 'number' ? kup : null, parametryMiesiaca(dane.parametry, dane.dzis)) : null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    const k = gr(f.koszt), urlop = liczba(f.urlopDni || '0'), etat = liczba(f.etat || '1');
    for (const [n, v] of [['brutto', b], ['koszt', k], ['kup', kup]] as const) if (v && typeof v === 'object') er[n] = v.error;
    if (!(urlop >= 0 && urlop <= 40)) er.urlopDni = 'Limit urlopu: 0–40 dni';
    if (!(etat > 0 && etat <= 1)) er.etat = 'Etat: od 0,1 do 1';
    if (f.umowaOd && f.umowaDo && f.umowaDo < f.umowaOd) er.umowaDo = 'Koniec umowy przed początkiem';
    setErr(er);
    if (Object.keys(er).length) return;
    const body = {
      forma: f.forma, umowaOd: f.umowaOd || null, umowaDo: f.umowaDo || null, bruttoGr: umowa ? (b as number | null) : null, kosztRecznyGr: f.forma === 'brak' ? null : (k as number | null),
      kupGr: f.forma === 'uop' ? (kup as number | null) : null, urlopDni: urlop, etat, staz10: f.staz10 === 'tak', uwagi: f.uwagi.trim(),
    };
    void zapisz('payroll_people', rec, { kind: 'płace: pracownik', url: `/api/payroll/people/${osoba.id}`, method: 'PUT', body }, { personId: osoba.id, ...body });
    onClose();
  }

  function dodajStawke() {
    const s = parseZl(nowa.stawka);
    if ('error' in s) return setErrS(s.error);
    if (!/^\d{4}-\d{2}$/.test(nowa.od)) return setErrS('Podaj miesiąc');
    const body = { personId: osoba.id, odMiesiaca: nowa.od, stawkaGr: s.gr };
    void zapisz('payroll_rates', undefined, { kind: 'płace: stawka', url: '/api/payroll/rates', method: 'POST', body }, body);
    setNowa({ ...nowa, stawka: '' }); setErrS('');
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <Sheet title={osoba.nazwa as string} description="Dane płacowe pracownika" className="desk:w-[min(680px,92vw)]">
        <form onSubmit={submit} noValidate className="grid gap-4">
          <div className="grid gap-4 min-[560px]:grid-cols-2">
            <Field label="Forma umowy">{(id) => <Select id={id} value={f.forma} onValueChange={(forma) => set({ forma: forma as Forma })} options={FORMY.map((v) => ({ value: v, label: FORMA_LABEL[v] }))} />}</Field>
            <Field label="Limit urlopu (dni)" error={err.urlopDni}>{(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!err.urlopDni} inputMode="decimal" value={f.urlopDni} onChange={(e) => set({ urlopDni: e.target.value })} />}</Field>
            <Field label="Umowa od">{(id) => <Input id={id} type="date" value={f.umowaOd} onChange={(e) => set({ umowaOd: e.target.value })} />}</Field>
            <Field label="Umowa do" error={err.umowaDo}>{(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!err.umowaDo} type="date" value={f.umowaDo} onChange={(e) => set({ umowaDo: e.target.value })} />}</Field>
            {umowa && <Field label="Brutto miesięcznie (zł)" error={err.brutto}>{(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!err.brutto} inputMode="decimal" value={f.brutto} onChange={(e) => set({ brutto: e.target.value })} />}</Field>}
            {f.forma === 'uop' && <Field label="Koszty uzyskania przychodu (zł)" hint="Puste = wartość z parametrów" error={err.kup}>{(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!err.kup} inputMode="decimal" value={f.kup} onChange={(e) => set({ kup: e.target.value })} />}</Field>}
            {f.forma !== 'brak' && <Field label="Koszt umowy ręcznie (zł)" hint="Puste = liczony z brutto" error={err.koszt}>{(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!err.koszt} inputMode="decimal" value={f.koszt} onChange={(e) => set({ koszt: e.target.value })} />}</Field>}
            <Field label="Etat (1 = pełny)" error={err.etat}>{(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!err.etat} inputMode="decimal" value={f.etat} onChange={(e) => set({ etat: e.target.value })} />}</Field>
          </div>
          <Segmented label="Staż pracy co najmniej 10 lat" value={f.staz10} onChange={(staz10) => set({ staz10 })} options={[{ v: 'nie', label: 'Staż poniżej 10 lat' }, { v: 'tak', label: 'Staż 10 lat i więcej' }]} />
          {kalk && (
            <dl className="grid grid-cols-2 gap-2 rounded-[4px] border border-line bg-bg/60 px-3 py-2 text-sm tabular-nums" aria-label="Podgląd kalkulatora umowy">
              <div><dt className="text-ink-2">Netto (na rękę)</dt><dd className="text-lg font-extrabold">{kw(kalk.netto)} zł</dd></div>
              <div><dt className="text-ink-2">Koszt umowy (koszt firmy − netto)</dt><dd className="text-lg font-extrabold">{kw(kalk.kosztUmowy)} zł</dd></div>
            </dl>
          )}
          <Field label="Uwagi">{(id) => <Textarea id={id} value={f.uwagi} onChange={(e) => set({ uwagi: e.target.value })} className="min-h-16" />}</Field>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={onClose}>Anuluj</Button><Button type="submit">Zapisz dane</Button>
          </div>
        </form>

        <section className="mt-5 grid gap-2 border-t border-line pt-4" aria-label="Stawki godzinowe">
          <h3 className="font-extrabold">Stawki godzinowe</h3>
          <p className="text-sm text-ink-2">Zapisują się od razu. Obowiązuje najnowsza stawka „od miesiąca” nie późniejszego niż rozliczany miesiąc.</p>
          {stawki.length ? <ul className="divide-y divide-rule rounded-[4px] border border-line">{stawki.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-1">
              <span className="tabular-nums">od {String(s.odMiesiaca).slice(5)}.{String(s.odMiesiaca).slice(0, 4)}</span>
              <span className="flex items-center gap-1"><b className="tabular-nums">{kw(s.stawkaGr)} zł/h</b><Usun entity="payroll_rates" id={s.id} url={`/api/payroll/rates/${s.id}`} opis={`stawka od ${s.odMiesiaca}`} tmp={!!s._tmp} /></span>
            </li>))}
          </ul> : <p className="text-sm text-ink-2">Brak stawek.</p>}
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2">
            <Field label="Od miesiąca">{(id) => <Input id={id} type="month" value={nowa.od} onChange={(e) => setNowa({ ...nowa, od: e.target.value })} />}</Field>
            <Field label="Stawka (zł/h)">{(id) => <Input id={id} inputMode="decimal" value={nowa.stawka} onChange={(e) => setNowa({ ...nowa, stawka: e.target.value })} />}</Field>
            <Button variant="secondary" onClick={dodajStawke} aria-label="Dodaj stawkę"><Plus className="h-5 w-5" weight="bold" />Dodaj</Button>
          </div>
          {errS && <p role="alert" className="text-sm font-semibold text-danger">{errS}</p>}
        </section>
      </Sheet>
    </Dialog>
  );
}
