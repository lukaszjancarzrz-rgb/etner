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
import { wynikRoku, type MiesiacWyniku } from './model.js';

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

/** Wynik firmy jak arkusz „Wyniki firmy”: miesiące roku, koszty pracowników wpisywane ręcznie (do czasu modułu Płace). */
export function Wynik({ rok }: { rok: string }) {
  const desk = useDesk();
  const revenues = useEntities('revenues'), costs = useEntities('costs');
  const [place, setPlace] = useState<Record<string, number>>({});
  const [edit, setEdit] = useState<string | null>(null);
  useEffect(() => { api<Record<string, number>>('/api/finanse/place').then(setPlace, () => { /* bez sieci: płace 0 */ }); }, []);
  const w = useMemo(() => wynikRoku(revenues, costs, place, rok), [revenues, costs, place, rok]);
  const val = (r: MiesiacWyniku, k: keyof MiesiacWyniku, t: string) => {
    const v = r[k] as number | null;
    if (t === 'pct') return proc(v);
    if (t === 'n') return String(v);
    return v === null ? '—' : <span className={cn((t === 'sum' || k === 'narastajaco') && (v as number) < 0 && 'text-danger')}>{zl(v)}</span>;
  };

  if (!desk) {
    const m = today().slice(0, 7);
    const karty = [w.find((r) => r.miesiac === m) ?? w[11]!, w[12]!];
    return (
      <div className="grid gap-3">
        {karty.map((r, i) => (
          <section key={r.miesiac} className="grid gap-2 rounded-[4px] border border-line bg-card p-4" aria-label={i ? `Rok ${rok}` : 'Ten miesiąc'}>
            <h2 className="text-lg font-bold">{i ? `Rok ${rok}` : 'Ten miesiąc'}</h2>
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
    <div className="overflow-x-auto rounded-[4px] border border-line bg-card">
      <table className="w-full text-sm tabular-nums" aria-label={`Wynik firmy ${rok} (zł netto)`}>
        <thead>
          <tr className="border-b-2 border-ink">
            <th scope="col" className="sticky left-0 bg-card px-2.5 py-2 text-left font-cond font-semibold text-ink-2">zł netto</th>
            {MIES.map((m) => <th key={m} scope="col" className="px-2 py-2 text-right font-cond font-semibold text-ink-2">{m}</th>)}
            <th scope="col" className="px-2.5 py-2 text-right font-cond font-semibold">Razem</th>
          </tr>
        </thead>
        <tbody>
          {WIERSZE.map(([k, label, t]) => (
            <tr key={k} className={cn('border-b border-rule', (t === 'bold' || t === 'sum') && 'font-bold', t === 'sum' && 'bg-bg/60')}>
              <th scope="row" className="sticky left-0 bg-inherit px-2.5 py-1.5 text-left font-semibold whitespace-nowrap">{label}</th>
              {w.slice(0, 12).map((r) => (
                <td key={r.miesiac} className="px-2 py-1.5 text-right whitespace-nowrap">
                  {k === 'kosztyPracownikow'
                    ? <button type="button" onClick={() => setEdit(r.miesiac)} className="inline-flex items-center gap-1 hover:text-action" aria-label={`Koszty pracowników ${r.miesiac}: ${zl(r.kosztyPracownikow)} zł, zmień`}>{zl(r.kosztyPracownikow)}<PencilSimple className="h-3.5 w-3.5 text-ink-2" aria-hidden /></button>
                    : val(r, k, t)}
                </td>
              ))}
              <td className="px-2.5 py-1.5 text-right font-bold whitespace-nowrap">{val(w[12]!, k, t)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {edit && <PlaceForm miesiac={edit} kwota={place[edit]} onClose={() => setEdit(null)} onSaved={setPlace} />}
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
