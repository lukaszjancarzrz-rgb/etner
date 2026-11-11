import { ArrowCounterClockwise, Clock } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';
import { Empty, SectionTitle } from '../../core/ui/bits.js';
import { Button } from '../../core/ui/button.js';
import { cn } from '../../core/ui/cn.js';
import { Input } from '../../core/ui/input.js';
import { toast } from '../../core/ui/toast.js';
import { parseZl } from '../leady/model.js';
import { useDane } from './dane.js';
import { kw, lb, MIES, MIES_PELNE, parseH, poprzedniMiesiac, zlText } from './fmt.js';
import { useDesk } from '../../core/layout/status.js';
import { Select } from '../../core/ui/select.js';
import { MIESIACE, przygotuj } from './model.js';
import { zapiszMiesiac } from './zapis.js';

/** Pole w komórce tabeli: lokalny tekst, zapis przy opuszczeniu pola; Enter przechodzi do osoby poniżej. */
function Komorka({ value, label, pos, onSave, hi, className }: { value: string; label: string; pos: string; onSave: (t: string) => string | void; hi?: boolean; className?: string }) {
  const [t, setT] = useState(value);
  useEffect(() => setT(value), [value]);
  return (
    <Input aria-label={label} data-g={pos} inputMode="decimal" value={t} onChange={(e) => setT(e.target.value)} onFocus={(e) => e.currentTarget.select()}
      onBlur={() => { if (t !== value) { const err = onSave(t); if (err) { toast('Nie zapisano', { body: err, tone: 'error' }); setT(value); } } }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const [r, c] = pos.split('-').map(Number) as [number, number];
        const next = e.currentTarget.closest('table')?.querySelector<HTMLInputElement>(`[data-g="${r + 1}-${c}"]`);
        if (next) next.focus(); else e.currentTarget.blur();
      }}
      className={cn(className ?? 'h-11 w-[4.75rem] px-2 text-right text-sm desk:h-8', hi && 'border-action bg-action/8 font-bold')} />
  );
}

const th = 'px-1.5 py-2 text-right font-cond font-semibold text-ink-2';

/** Godziny do wypłaty (wpisywane ręcznie raz w miesiącu) i koszt umowy: obliczony, z możliwością nadpisania w miesiącu. */
export function Godziny({ rok }: { rok: string }) {
  const d = useDane();
  const P = useMemo(() => przygotuj(d), [d]);
  const desk = useDesk();
  const u = P.urlopyRoku(rok);
  const [mi, setMi] = useState(() => { const p = poprzedniMiesiac(d.dzis); return p.startsWith(rok) ? Number(p.slice(5)) - 1 : 0; });
  if (!P.lista.length) return <Empty title="Brak pracowników w Płacach" hint="Dodaj dane umowy w zakładce Pracownicy." icon={Clock} />;
  // telefon: jeden miesiąc naraz, karta na osobę z dużymi polami (tabela 12 miesięcy nie mieści się na ekranie)
  if (!desk) {
    const mm = `${rok}-${MIESIACE[mi]}`;
    const m = P.mies;
    return (
      <section className="grid gap-3" aria-label="Godziny">
        <div className="w-52"><Select aria-label="Miesiąc" value={String(mi)} onValueChange={(v) => setMi(Number(v))} options={MIES_PELNE.map((n, i) => ({ value: String(i), label: n }))} /></div>
        <p className="text-sm text-ink-2">Wpisz godziny do wypłaty i wyjdź z pola – zapis od razu. Koszt umowy liczy się sam; wpisz kwotę tylko, gdy w tym miesiącu była inna.</p>
        <ul className="grid gap-2">
          {P.lista.map((o) => {
            const id = o.personId as string, rec = m.get(`${id}|${mm}`), nad = rec?.kosztUmowyGr != null, dni = u.get(id)?.dniPracy[mi] ?? 0;
            return (
              <li key={id} className="grid gap-2 rounded-[4px] border border-line bg-card p-4">
                <p className="flex items-baseline justify-between gap-2"><span className="font-bold">{P.nazwa(id)}</span><span className="text-sm text-ink-2">{dni ? `${lb(dni)} dni w harmonogramie` : 'brak dni w harmonogramie'}</span></p>
                <label className="grid grid-cols-[minmax(0,1fr)_8rem] items-center gap-3"><span>Godziny</span>
                  <Komorka className="h-12 w-full px-3 text-right text-base" label={`Godziny ${P.nazwa(id)}, ${MIES_PELNE[mi]} ${rok}`} pos={`t-${mi}`} value={rec?.godziny != null ? String(rec.godziny).replace('.', ',') : ''}
                    onSave={(t) => { const h = parseH(t); if (h === 'error') return 'Wpisz godziny, np. 168 albo 160,5 (do 744)'; zapiszMiesiac(id, mm, { godziny: h }); }} /></label>
                <div className="grid grid-cols-[minmax(0,1fr)_auto_8rem] items-center gap-2"><span>Koszt umowy (zł)</span>
                  {nad ? <Button variant="ghost" size="sm" aria-label={`Przywróć obliczony koszt umowy: ${P.nazwa(id)}`} className="h-11 w-11 px-0" onClick={() => zapiszMiesiac(id, mm, { kosztUmowyGr: null })}><ArrowCounterClockwise className="h-5 w-5" /></Button> : <span />}
                  <Komorka hi={nad} className="h-12 w-full px-3 text-right text-base" label={`Koszt umowy ${P.nazwa(id)}, ${MIES_PELNE[mi]} ${rok}`} pos={`k-${mi}`} value={zlText(P.kosztUmowy(id, mm))}
                    onSave={(t) => {
                      if (!t.trim()) return void zapiszMiesiac(id, mm, { kosztUmowyGr: null });
                      const k = parseZl(t);
                      if ('error' in k) return k.error;
                      if (!nad && k.gr === P.kosztUmowy(id, mm)) return;
                      zapiszMiesiac(id, mm, { kosztUmowyGr: k.gr });
                    }} /></div>
              </li>
            );
          })}
        </ul>
        <p className="rounded-[4px] border border-ink bg-bg/60 p-4 font-bold tabular-nums">Razem w {MIES_PELNE[mi]!.toLowerCase()}: {lb(P.lista.reduce((s, o) => s + Number(m.get(`${o.personId}|${mm}`)?.godziny ?? 0), 0))} h</p>
      </section>
    );
  }
  const mies = (id: string, i: number) => P.mies.get(`${id}|${rok}-${MIESIACE[i]}`);
  const sumaMies = (f: (id: string) => number) => P.lista.reduce((s, o) => s + f(o.personId as string), 0);
  const Glowa = ({ razem }: { razem: string }) => (
    <thead><tr className="border-b-2 border-ink">
      <th scope="col" className="sticky left-0 z-10 bg-card px-2.5 py-2 text-left font-cond font-semibold text-ink-2">Osoba</th>
      {MIES.map((m) => <th key={m} scope="col" className={th}>{m}</th>)}
      <th scope="col" className={cn(th, 'px-2.5')}>{razem}</th>
    </tr></thead>
  );
  return (
    <div className="grid gap-6">
      <section className="grid gap-2" aria-label="Godziny">
        <SectionTitle>Godziny do wypłaty w {rok}</SectionTitle>
        <p className="text-sm text-ink-2">Wpisz godziny i wyjdź z pola (Enter – osoba niżej, Tab – następny miesiąc). Szare: dni pracy z harmonogramu, tylko podpowiedź.</p>
        <div className="overflow-x-auto rounded-[4px] border border-line bg-card">
          <table className="w-full text-sm tabular-nums">
            <Glowa razem="Razem" />
            <tbody>
              {P.lista.map((o, r) => {
                const id = o.personId as string;
                return (
                  <tr key={id} className="border-b border-rule">
                    <th scope="row" className="sticky left-0 z-10 bg-card px-2.5 py-1 text-left font-semibold whitespace-nowrap">{P.nazwa(id)}</th>
                    {MIES.map((m, i) => (
                      <td key={m} className="px-1 py-1 text-right">
                        <Komorka label={`Godziny ${P.nazwa(id)}, ${m} ${rok}`} pos={`${r}-${i}`} value={mies(id, i)?.godziny != null ? String(mies(id, i)!.godziny).replace('.', ',') : ''}
                          onSave={(t) => { const h = parseH(t); if (h === 'error') return 'Wpisz godziny, np. 168 albo 160,5 (do 744)'; zapiszMiesiac(id, `${rok}-${MIESIACE[i]}`, { godziny: h }); }} />
                        <span className="block text-xs text-ink-2" title="dni pracy w harmonogramie">{u.get(id)?.dniPracy[i] ? `${lb(u.get(id)!.dniPracy[i])} dni` : '—'}</span>
                      </td>
                    ))}
                    <td className="px-2.5 py-1 text-right font-bold">{lb(MIESIACE.reduce((s, _, i) => s + Number(mies(id, i)?.godziny ?? 0), 0))}</td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-ink bg-bg/60 font-bold">
                <th scope="row" className="sticky left-0 bg-bg px-2.5 py-1.5 text-left">RAZEM</th>
                {MIES.map((m, i) => <td key={m} className="px-1.5 py-1.5 text-right">{lb(sumaMies((id) => Number(mies(id, i)?.godziny ?? 0)))}</td>)}
                <td className="px-2.5 py-1.5 text-right">{lb(MIESIACE.reduce((s, _, i) => s + sumaMies((id) => Number(mies(id, i)?.godziny ?? 0)), 0))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-2" aria-label="Koszt umowy">
        <SectionTitle>Koszt umowy w {rok} (zł)</SectionTitle>
        <p className="text-sm text-ink-2">Liczony z danych umowy (zakładka Pracownicy). Wpisz własną kwotę, żeby ją nadpisać w danym miesiącu; wyróżnione pole = kwota nadpisana, strzałka przywraca obliczoną.</p>
        <div className="overflow-x-auto rounded-[4px] border border-line bg-card">
          <table className="w-full text-sm tabular-nums">
            <Glowa razem="Razem" />
            <tbody>
              {P.lista.map((o, r) => {
                const id = o.personId as string;
                return (
                  <tr key={id} className="border-b border-rule">
                    <th scope="row" className="sticky left-0 z-10 bg-card px-2.5 py-1 text-left font-semibold whitespace-nowrap">{P.nazwa(id)}</th>
                    {MIES.map((m, i) => {
                      const mm = `${rok}-${MIESIACE[i]}`, nad = mies(id, i)?.kosztUmowyGr != null;
                      return (
                        <td key={m} className="px-1 py-1 text-right">
                          <div className="flex items-center justify-end gap-0.5">
                            {nad && <Button variant="ghost" size="sm" aria-label={`Przywróć obliczony koszt umowy: ${P.nazwa(id)}, ${m}`} className="h-11 w-8 shrink-0 px-0 desk:h-8" onClick={() => zapiszMiesiac(id, mm, { kosztUmowyGr: null })}><ArrowCounterClockwise className="h-4 w-4" /></Button>}
                            <Komorka hi={nad} label={`Koszt umowy ${P.nazwa(id)}, ${m} ${rok}`} pos={`${r}-${i}`} value={zlText(P.kosztUmowy(id, mm))}
                              onSave={(t) => {
                                if (!t.trim()) return void zapiszMiesiac(id, mm, { kosztUmowyGr: null });
                                const k = parseZl(t);
                                if ('error' in k) return k.error;
                                if (!nad && k.gr === P.kosztUmowy(id, mm)) return; // ta sama kwota inaczej zapisana – bez zamrażania
                                zapiszMiesiac(id, mm, { kosztUmowyGr: k.gr });
                              }} />
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-2.5 py-1 text-right font-bold">{kw(MIESIACE.reduce((s, _, i) => s + P.kosztUmowy(id, `${rok}-${MIESIACE[i]}`), 0))}</td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-ink bg-bg/60 font-bold">
                <th scope="row" className="sticky left-0 bg-bg px-2.5 py-1.5 text-left">RAZEM</th>
                {MIES.map((m, i) => <td key={m} className="px-1.5 py-1.5 text-right">{kw(sumaMies((id) => P.kosztUmowy(id, `${rok}-${MIESIACE[i]}`)))}</td>)}
                <td className="px-2.5 py-1.5 text-right">{kw(MIESIACE.reduce((s, _, i) => s + sumaMies((id) => P.kosztUmowy(id, `${rok}-${MIESIACE[i]}`)), 0))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
