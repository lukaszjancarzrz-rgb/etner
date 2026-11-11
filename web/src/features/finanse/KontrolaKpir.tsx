import { ListMagnifyingGlass, PencilSimple } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { useEntities, type Rec } from '../../core/store.js';
import { Empty } from '../../core/ui/bits.js';
import { Button } from '../../core/ui/button.js';
import { cn } from '../../core/ui/cn.js';
import { Field, Input } from '../../core/ui/input.js';
import { Dialog, Sheet } from '../../core/ui/sheet.js';
import { toast } from '../../core/ui/toast.js';
import { createVia, updateVia } from '../../core/write.js';
import { parseZl } from '../leady/model.js';
import { KPIR_KOL, kontrolaKpir, type KpirKol } from './model.js';
import { zl } from './Wynik.js';

const MIESIAC = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
const nazwa = (m: string) => `${MIESIAC[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`;

/** Kontrola z księgą: sumy „wg KPiR” (z importu albo wpisane) obok sum w aplikacji; różnica ≠ 0 na czerwono. */
export function KontrolaKpir({ rok }: { rok: string }) {
  const kpir = useEntities('kpir_months'), revenues = useEntities('revenues'), costs = useEntities('costs');
  const rows = useMemo(() => kontrolaKpir(kpir, revenues, costs, rok), [kpir, revenues, costs, rok]);
  const [edit, setEdit] = useState<string | null>(null);
  if (!rows.length) return <Empty icon={ListMagnifyingGlass} title="Brak danych w tym roku" hint="Sumy z księgi trafiają tu z importu miesiąca z KPiR." />;
  return (
    <div className="grid gap-3">
      {rows.map((r) => (
        <section key={r.miesiac} className="overflow-x-auto rounded-[4px] border border-line bg-card" aria-label={`KPiR ${nazwa(r.miesiac)}`}>
          <div className="flex items-center justify-between gap-3 px-3 py-2">
            <h2 className="font-bold capitalize">{nazwa(r.miesiac)}</h2>
            <Button size="sm" variant="ghost" onClick={() => setEdit(r.miesiac)}><PencilSimple className="h-4 w-4" />{r.ksiega ? 'Popraw sumy z KPiR' : 'Wpisz sumy z KPiR'}</Button>
          </div>
          <table className="w-full table-fixed text-sm tabular-nums"><colgroup><col /><col className="w-[22%]" /><col className="w-[22%]" /><col className="w-[18%]" /></colgroup>
            <thead><tr className="border-b-2 border-ink font-cond text-ink-2"><th scope="col" className="px-3 py-1.5 text-left font-semibold">Kolumna</th><th scope="col" className="px-3 text-right font-semibold">Wg KPiR</th><th scope="col" className="px-3 text-right font-semibold">W aplikacji</th><th scope="col" className="px-3 text-right font-semibold">Różnica</th></tr></thead>
            <tbody>
              {KPIR_KOL.map(([k, label]) => {
                const ks = r.ksiega?.[k], d = ks === undefined ? null : r.app[k] - ks;
                return (
                  <tr key={k} className="border-b border-rule last:border-0">
                    <th scope="row" className="px-3 py-1.5 text-left font-semibold">{label}</th>
                    <td className="px-3 text-right">{ks === undefined ? '—' : zl(ks)}</td>
                    <td className="px-3 text-right">{zl(r.app[k])}</td>
                    <td className={cn('px-3 text-right font-semibold', d ? 'text-danger' : 'text-ink-2')}>{d === null ? '—' : d ? zl(d) : '0'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
      <p className="text-sm text-ink-2">Kwoty w złotych netto. „W aplikacji”: przychód = przychody z fakturą (netto), koszty wg kolumny KPiR.</p>
      {edit && <KpirForm miesiac={edit} row={kpir.find((k) => !k.deletedAt && k.miesiac === edit)} onClose={() => setEdit(null)} />}
    </div>
  );
}

function KpirForm({ miesiac, row, onClose }: { miesiac: string; row?: Rec; onClose: () => void }) {
  const POLE: Record<KpirKol, string> = { przychod: 'przychodGr', towary: 'towaryGr', uboczne: 'uboczneGr', wynagrodzenia: 'wynagrodzeniaGr', pozostale: 'pozostaleGr' };
  const [f, setF] = useState<Record<KpirKol, string>>(() => Object.fromEntries(KPIR_KOL.map(([k]) => [k, row ? ((row[POLE[k]] as number) / 100).toFixed(2).replace('.', ',') : ''])) as Record<KpirKol, string>);
  const [err, setErr] = useState<Partial<Record<KpirKol, string>>>({});
  function save(e: React.FormEvent) {
    e.preventDefault();
    const body: Record<string, number> = {}, er: Partial<Record<KpirKol, string>> = {};
    for (const [k] of KPIR_KOL) {
      const p = f[k].trim() ? parseZl(f[k]) : { gr: 0 };
      if ('error' in p) er[k] = p.error; else body[POLE[k]] = p.gr;
    }
    if (Object.keys(er).length) return setErr(er);
    const t = { url: `/api/kpir/${miesiac}`, method: 'PUT', body, kind: 'kpir' } as const;
    void (row ? updateVia('kpir_months', row.id as string, body, t) : createVia('kpir_months', t, { miesiac, ...body })).catch((x: Error) => toast('Nie zapisano sum KPiR', { body: x.message, tone: 'error' }));
    onClose();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <Sheet title={`Sumy z KPiR – ${nazwa(miesiac)}`} description="Z linii „Razem” w księdze za miesiąc (zł netto).">
        <form onSubmit={save} className="grid gap-3" noValidate>
          {KPIR_KOL.map(([k, label]) => <Field key={k} label={label} error={err[k]}>{(id, d) => <Input id={id} aria-describedby={d} inputMode="decimal" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />}</Field>)}
          <div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={onClose}>Anuluj</Button><Button type="submit">Zapisz</Button></div>
        </form>
      </Sheet>
    </Dialog>
  );
}
