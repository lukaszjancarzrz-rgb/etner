import { PencilSimple } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../core/api.js';
import { today } from '../../core/data.js';
import { useDesk } from '../../core/layout/status.js';
import { useEntities } from '../../core/store.js';
import { Button } from '../../core/ui/button.js';
import { cn } from '../../core/ui/cn.js';
import { Field, Input } from '../../core/ui/input.js';
import { Dialog, Sheet } from '../../core/ui/sheet.js';
import { toast } from '../../core/ui/toast.js';
import { parseZl } from '../leady/model.js';
import { sumaOkresu, wynikRoku, type MiesiacWyniku } from './model.js';
import { Select } from '../../core/ui/select.js';
import { useKosztyPracownikow } from '../place/dane.js';

const MIES_PELNE = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];
const MIES = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru'];
/** Kwota w pełnych złotych (gęsta tabela 13 kolumn). */
export const zl = (gr: number) => Math.round(gr / 100).toLocaleString('pl-PL');
const proc = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);

const WIERSZE: [keyof MiesiacWyniku, string, 'sum' | 'bold' | 'pct' | 'n' | ''][] = [
  ['zFaktura', 'Przychód z fakturą (netto)', ''], ['bezFaktury', 'Przychód bez faktury', ''], ['przychod', 'PRZYCHÓD NETTO RAZEM', 'bold'],
  ['kosztyFirmy', 'Koszty firmy', ''], ['kosztyPracownikow', 'Koszty pracowników', ''], ['koszty', 'KOSZTY RAZEM', 'bold'],
  ['wynik', 'WYNIK (przychód − koszty)', 'sum'], ['narastajaco', 'Wynik narastająco', ''], ['marza', 'Marża', 'pct'],
  ['zlecen', 'Liczba zleceń', 'n'], ['srednia', 'Średnia wartość zlecenia', ''], ['zwrotVat', 'Zwrot VAT z US', ''], ['wynikZeZwrotem', 'WYNIK ze zwrotem VAT', 'sum'],
];

/** Wynik firmy jak arkusz „Wyniki firmy”: miesiące roku, koszty pracowników z Płac, a w miesiącach bez danych płac – wpisane ręcznie. */
export function Wynik({ rok }: { rok: string }) {
  const desk = useDesk();
  const revenues = useEntities('revenues'), costs = useEntities('costs');
  const [reczne, setPlace] = useState<Record<string, number>>({});
  const { place, zPlac } = useKosztyPracownikow(rok, reczne);
  const [edit, setEdit] = useState<string | null>(null);
  useEffect(() => { api<Record<string, number>>('/api/finanse/place').then(setPlace, () => { /* bez sieci: płace 0 */ }); }, []);
  const w = useMemo(() => wynikRoku(revenues, costs, place, rok), [revenues, costs, place, rok]);
  // wybrany okres (jak „Wybrany okres: od–do” w arkuszu): domyślnie od stycznia do bieżącego miesiąca
  const teraz = rok === today().slice(0, 4) ? Number(today().slice(5, 7)) : 12;
  const [od, setOd] = useState(1), [doM, setDo] = useState(teraz);
  const a = Math.min(od, doM), b = Math.max(od, doM);
  const okres = useMemo(() => sumaOkresu(w.slice(a - 1, b), 'okres'), [w, a, b]);
  const nazwaOkresu = a === b ? MIES_PELNE[a - 1]! : `${MIES_PELNE[a - 1]} – ${MIES_PELNE[b - 1]}`;
  const opcje = MIES_PELNE.map((m, i) => ({ value: String(i + 1), label: m }));
  const okresUI = (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">Wybrany okres:</span>
        <span className="w-40"><Select aria-label="Od miesiąca" value={String(od)} onValueChange={(v) => setOd(Number(v))} options={opcje} /></span>
        <span aria-hidden>–</span>
        <span className="w-40"><Select aria-label="Do miesiąca" value={String(doM)} onValueChange={(v) => setDo(Number(v))} options={opcje} /></span>
        <span className="text-sm text-ink-2">{nazwaOkresu} {rok} ({b - a + 1} mies.)</span>
      </div>
      <dl className="grid grid-cols-2 gap-2 min-[700px]:grid-cols-4 desk:grid-cols-8" aria-label={`Wybrany okres: ${nazwaOkresu} ${rok}`}>
        {([['przychod', 'Przychód netto'], ['kosztyFirmy', 'Koszty firmy'], ['kosztyPracownikow', 'Koszty pracowników'], ['wynik', 'Zysk (bez zwrotu VAT)'], ['marza', 'Marża'], ['zwrotVat', 'Zwrot VAT z US'], ['wynikZeZwrotem', 'Zysk ze zwrotem VAT'], ['zlecen', 'Liczba zleceń']] as const).map(([k, label]) => (
          <div key={k} className="rounded-[4px] border border-line bg-card px-3 py-2">
            <dt className="text-sm text-ink-2">{label}</dt>
            <dd className={cn('text-lg font-extrabold tabular-nums', (k === 'wynik' || k === 'wynikZeZwrotem') && okres[k] < 0 && 'text-danger')}>{k === 'marza' ? proc(okres.marza) : k === 'zlecen' ? okres.zlecen : `${zl(okres[k])} zł`}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
  const val = (r: MiesiacWyniku, k: keyof MiesiacWyniku, t: string) => {
    const v = r[k] as number | null;
    if (t === 'pct') return proc(v);
    if (t === 'n') return String(v);
    return v === null ? '—' : <span className={cn((t === 'sum' || k === 'narastajaco') && (v as number) < 0 && 'text-danger')}>{zl(v)}</span>;
  };

  if (!desk) {
    const karty = [w[12]!];
    return (
      <div className="grid gap-3">
        {okresUI}
        {karty.map((r, i) => (
          <section key={r.miesiac} className="grid gap-2 rounded-[4px] border border-line bg-card p-4" aria-label={`Rok ${rok}`}>
            <h2 className="text-lg font-bold">Cały rok {rok}</h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 tabular-nums">
              {(['przychod', 'koszty', 'wynik', 'marza'] as const).map((k) => (
                <div key={k}><dt className="text-sm text-ink-2">{{ przychod: 'Przychód netto', koszty: 'Koszty', wynik: 'Wynik', marza: 'Marża' }[k]}</dt><dd className="text-lg font-bold">{k === 'marza' ? proc(r.marza) : <>{val(r, k, 'sum')} zł</>}</dd></div>
              ))}
            </dl>
          </section>
        ))}
        <p className="text-sm text-ink-2">Pełna tabela miesięcy i wpisywanie kosztów pracowników – na komputerze.</p>
      </div>
    );
  }
  return (
    <div className="grid gap-4">
    {okresUI}
    <div className="overflow-x-auto rounded-[4px] border border-line bg-card">
      <table className="w-full text-sm tabular-nums" aria-label={`Wynik firmy ${rok} (zł netto)`}>
        <thead>
          <tr className="border-b-2 border-ink">
            <th scope="col" className="sticky left-0 bg-card px-2.5 py-2 text-left font-cond font-semibold text-ink-2">zł netto</th>
            {MIES.map((m, i) => <th key={m} scope="col" className={cn('px-2 py-2 text-right font-cond font-semibold text-ink-2', i + 1 >= a && i + 1 <= b && 'bg-action/8 text-ink')}>{m}</th>)}
            <th scope="col" className="px-2.5 py-2 text-right font-cond font-semibold">Razem</th>
          </tr>
        </thead>
        <tbody>
          {WIERSZE.map(([k, label, t]) => (
            <tr key={k} className={cn('border-b border-rule', (t === 'bold' || t === 'sum') && 'font-bold', t === 'sum' && 'bg-bg/60')}>
              <th scope="row" className="sticky left-0 bg-inherit px-2.5 py-1.5 text-left font-semibold whitespace-nowrap">{label}</th>
              {w.slice(0, 12).map((r, i) => (
                <td key={r.miesiac} className={cn('px-2 py-1.5 text-right whitespace-nowrap', i + 1 >= a && i + 1 <= b && 'bg-action/8')}>
                  {k === 'kosztyPracownikow' && !(r.miesiac in zPlac)
                    ? <button type="button" onClick={() => setEdit(r.miesiac)} className="inline-flex items-center gap-1 hover:text-action" aria-label={`Koszty pracowników ${r.miesiac}: ${zl(r.kosztyPracownikow)} zł, zmień`}>{zl(r.kosztyPracownikow)}<PencilSimple className="h-3.5 w-3.5 text-ink-2" aria-hidden /></button>
                    : val(r, k, t)}
                </td>
              ))}
              <td className="px-2.5 py-1.5 text-right font-bold whitespace-nowrap">{val(w[12]!, k, t)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {edit && <PlaceForm miesiac={edit} kwota={reczne[edit]} onClose={() => setEdit(null)} onSaved={setPlace} />}
    </div>
    </div>
  );
}

function PlaceForm({ miesiac, kwota, onClose, onSaved }: { miesiac: string; kwota?: number; onClose: () => void; onSaved: (v: Record<string, number>) => void }) {
  const [t, setT] = useState(kwota ? (kwota / 100).toFixed(2).replace('.', ',') : '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const p = t.trim() ? parseZl(t) : null;
    if (p && 'error' in p) return setErr(p.error);
    const gr = p ? p.gr : null;
    if (gr !== null && gr < 0) return setErr('Kwota nie może być ujemna');
    setBusy(true);
    try { onSaved(await api<Record<string, number>>(`/api/finanse/place/${miesiac}`, { method: 'PUT', json: { kwotaGr: gr } })); onClose(); }
    catch (x) { toast('Nie zapisano', { body: (x as Error).message, tone: 'error' }); setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <Sheet title={`Koszty pracowników ${miesiac.slice(5)}.${miesiac.slice(0, 4)}`} description="Do czasu modułu Płace: całkowity koszt pracowników w miesiącu (zł). Puste = 0.">
        <form onSubmit={(e) => void save(e)} className="grid gap-4" noValidate>
          <Field label="Kwota (zł)" error={err}>{(id, d) => <Input id={id} aria-describedby={d} inputMode="decimal" value={t} onChange={(e) => setT(e.target.value)} autoFocus />}</Field>
          <div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={onClose}>Anuluj</Button><Button type="submit" disabled={busy}>Zapisz</Button></div>
        </form>
      </Sheet>
    </Dialog>
  );
}
