import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../../core/api.js';
import { today, useCrewColor } from '../../core/data.js';
import { useEntities, type Rec } from '../../core/store.js';
import { SectionTitle } from '../../core/ui/bits.js';
import { useCatColor } from '../../core/ui/category.js';
import { miesiacWiersza, statystyki, wynikRoku } from './model.js';
import { zl } from './Wynik.js';
import { useKosztyPracownikow } from '../place/dane.js';

const MIES = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru'];
// paleta referencyjna (zweryfikowana, kolejność stała) – dla serii bez własnego koloru w aplikacji (kategorie kosztów)
const SLOT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const GREY = 'var(--field)';
const live = (r: Rec) => !r.deletedAt;
const k = (gr: number) => (Math.abs(gr) >= 100_000 ? `${Math.round(gr / 100_000)} tys.` : zl(gr));

type Seria = { name: string; color: string; values: number[] };

function Legenda({ s }: { s: { name: string; color: string; line?: boolean }[] }) {
  return <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-2" aria-hidden>{s.map((x) => <li key={x.name} className="inline-flex items-center gap-1.5"><span className={x.line ? 'h-0.5 w-4' : 'h-2.5 w-2.5 rounded-[2px]'} style={{ background: x.color }} />{x.name}</li>)}</ul>;
}

function Wykres({ title, children, legend, opis }: { title: string; children: ReactNode; legend?: ReactNode; opis: string }) {
  return (
    <figure className="grid gap-2 rounded-[4px] border border-line bg-card p-4" aria-label={title}>
      <figcaption className="grid gap-1"><SectionTitle>{title}</SectionTitle>{legend}</figcaption>
      <div role="img" aria-label={opis}>{children}</div>
    </figure>
  );
}

/** Słupki w miesiącach (jedna oś zł): obok siebie albo skumulowane, opcjonalnie linia. Podpowiedź po najechaniu (title). */
function Slupki({ s, stacked, line, upto = 12, h = 220 }: { s: Seria[]; stacked?: boolean; line?: Seria; upto?: number; h?: number }) {
  const W = 720, L = 56, B = 22, T = 8, n = 12, slot = (W - L) / n;
  const tops = Array.from({ length: n }, (_, i) => stacked ? s.reduce((a, x) => a + Math.max(0, x.values[i]!), 0) : Math.max(0, ...s.map((x) => x.values[i]!)));
  const all = [...tops, ...(line?.values ?? []), ...s.flatMap((x) => x.values), 0];
  const max = Math.max(...all) || 1, min = Math.min(...all);
  const y = (v: number) => T + (h - T - B) * (max - v) / (max - min || 1);
  // podpis minimum tylko gdy strata jest wyraźna (inaczej nachodzi na „0”)
  const ticks = [max, (max + Math.max(min, 0)) / 2, Math.max(min, 0), ...(min < -0.15 * max ? [min] : [])];
  const bw = stacked ? slot * 0.6 : (slot * 0.7) / s.length;
  return (
    <svg viewBox={`0 0 ${W} ${h}`} className="w-full text-ink-2" style={{ maxHeight: h }}>
      {ticks.map((t, i) => <g key={i}><line x1={L} x2={W} y1={y(t)} y2={y(t)} stroke="var(--rule)" /><text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="14" fill="currentColor">{k(t)}</text></g>)}
      {MIES.map((m, i) => {
        let acc = 0;
        return (
          <g key={m}>
            {s.map((x, j) => {
              const v = x.values[i]!;
              if (!v) return null;
              const x0 = L + i * slot + (stacked ? slot * 0.2 : slot * 0.15 + j * bw);
              const y0 = stacked ? y(acc + Math.max(v, 0)) : y(Math.max(v, 0)), y1 = stacked ? y(acc) : y(Math.min(v, 0));
              if (stacked) acc += Math.max(v, 0);
              return <rect key={x.name} x={x0 + 1} y={y0} width={Math.max(bw - 2, 2)} height={Math.max(y1 - y0 - (stacked ? 2 : 0), 1)} rx="2" fill={x.color}><title>{`${m}: ${x.name} ${zl(v)} zł`}</title></rect>;
            })}
            <text x={L + i * slot + slot / 2} y={h - 6} textAnchor="middle" fontSize="14" fill="currentColor">{m}</text>
          </g>
        );
      })}
      {line && <>
        <polyline fill="none" stroke={line.color} strokeWidth="2" points={line.values.slice(0, upto).map((v, i) => `${L + i * slot + slot / 2},${y(v)}`).join(' ')} />
        {line.values.slice(0, upto).map((v, i) => <circle key={i} cx={L + i * slot + slot / 2} cy={y(v)} r="4" fill={line.color} stroke="var(--card)" strokeWidth="2"><title>{`${MIES[i]}: ${line.name} ${zl(v)} zł`}</title></circle>)}
      </>}
    </svg>
  );
}

/** Poziome słupki z podpisem i wartością (ranking: rok wg branży, źródła, osobodni). */
function Poziome({ rows, fmt }: { rows: { name: string; v: number; color: string }[]; fmt: (v: number) => string }) {
  const max = Math.max(...rows.map((r) => r.v), 1);
  return (
    <ul className="grid gap-1.5">
      {rows.map((r) => (
        <li key={r.name} className="grid grid-cols-[minmax(7rem,11rem)_minmax(0,1fr)_auto] items-center gap-3 text-sm">
          <span className="truncate font-semibold">{r.name}</span>
          <span className="h-4 rounded-r-[4px]" style={{ width: `${(r.v / max) * 100}%`, minWidth: 2, background: r.color }} />
          <span className="tabular-nums text-ink-2">{fmt(r.v)}</span>
        </li>
      ))}
    </ul>
  );
}

const sumBy = <T,>(rows: T[], key: (r: T) => string, val: (r: T) => number) => {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + val(r));
  return [...m].sort((a, b) => b[1] - a[1]);
};

/** Wykresy jak w arkuszu (Wyniki firmy, Statystyki zleceń); dokładne liczby – zakładki Wynik i Statystyki. */
export function Wykresy({ rok }: { rok: string }) {
  const revenues = useEntities('revenues'), costs = useEntities('costs'), jobs = useEntities('jobs'), leads = useEntities('leads'), entries = useEntities('schedule_entries');
  const cat = useCatColor(), crew = useCrewColor();
  const [reczne, setPlace] = useState<Record<string, number>>({});
  const { place } = useKosztyPracownikow(rok, reczne);
  useEffect(() => { api<Record<string, number>>('/api/finanse/place').then(setPlace, () => {}); }, []);
  const d = useMemo(() => {
    const w = wynikRoku(revenues, costs, place, rok).slice(0, 12);
    const rev = revenues.filter((r) => live(r) && r.sposob !== 'zwrot' && miesiacWiersza(r)?.startsWith(rok));
    const mi = (r: Rec) => Number(miesiacWiersza(r)!.slice(5)) - 1;
    const katRok = sumBy(rev, (r) => (r.kategoria as string) || 'Bez branży', (r) => r.nettoGr as number);
    const katMies = katRok.map(([name]) => ({ name, color: cat(name) ?? GREY, values: MIES.map((_, i) => rev.filter((r) => mi(r) === i && ((r.kategoria as string) || 'Bez branży') === name).reduce((a, r) => a + (r.nettoGr as number), 0)) }));
    const cst = costs.filter((c) => live(c) && c.doWyniku && String(c.miesiac).startsWith(rok));
    const top = sumBy(cst, (c) => c.kategoria as string, (c) => c.nettoGr as number).slice(0, 5).map(([n]) => n);
    const grupa = (c: Rec) => (top.includes(c.kategoria as string) ? (c.kategoria as string) : 'Pozostałe');
    const koszty: Seria[] = [...top, 'Pozostałe'].map((name, j) => ({ name, color: name === 'Pozostałe' ? GREY : SLOT[j]!, values: MIES.map((_, i) => cst.filter((c) => Number(String(c.miesiac).slice(5)) - 1 === i && grupa(c) === name).reduce((a, c) => a + (c.nettoGr as number), 0)) }));
    koszty.push({ name: 'Pracownicy', color: SLOT[6]!, values: w.map((r) => r.kosztyPracownikow) });
    const job = new Map(jobs.map((j) => [j.id as string, j])), lead = new Map(leads.map((l) => [l.id as string, l]));
    const zrodla = sumBy(rev, (r) => { const j = job.get(r.jobId as string); const l = j?.leadId ? lead.get(j.leadId as string) : undefined; return (l?.zrodlo as string) || 'Bez leada'; }, (r) => r.nettoGr as number);
    return { w, katRok, katMies, koszty: koszty.filter((x) => x.values.some(Boolean)), zrodla, s: statystyki(entries, jobs, rok) };
  }, [revenues, costs, place, rok, jobs, leads, entries, cat]);
  // linia wyniku tylko do bieżącego miesiąca (przyszłe miesiące to nie strata zero)
  const upto = rok === today().slice(0, 4) ? Number(today().slice(5, 7)) : 12;
  const przychod = { name: 'Przychód netto', color: SLOT[0]!, values: d.w.map((r) => r.przychod) };
  const koszty = { name: 'Koszty razem', color: SLOT[1]!, values: d.w.map((r) => r.koszty) };
  const wynik = { name: 'Wynik', color: 'var(--ink)', values: d.w.map((r) => r.wynik) };
  const ekipy = d.s.ekipy.map((e, i) => ({ name: e.nazwa, color: crew(e.nazwa) ?? SLOT[i % SLOT.length]! }));
  return (
    <div className="grid gap-4 min-[1400px]:grid-cols-2">
      <Wykres title="Przychody, koszty i wynik w miesiącach" opis="Słupki przychodu i kosztów, linia wyniku; liczby w zakładce Wynik." legend={<Legenda s={[przychod, koszty, { ...wynik, line: true }]} />}>
        <Slupki s={[przychod, koszty]} line={wynik} upto={upto} />
      </Wykres>
      <Wykres title="Wynik narastająco od początku roku" opis="Linia wyniku narastająco; liczby w zakładce Wynik.">
        <Slupki s={[]} line={{ name: 'Wynik narastająco', color: SLOT[0]!, values: d.w.map((r) => r.narastajaco) }} upto={upto} />
      </Wykres>
      <Wykres title="Przychód netto wg branży w miesiącach" opis="Słupki skumulowane wg branży." legend={<Legenda s={d.katMies} />}>
        <Slupki s={d.katMies} stacked />
      </Wykres>
      <Wykres title={`Przychód netto w ${rok} wg branży`} opis="Ranking branż wg przychodu.">
        <Poziome rows={d.katRok.map(([name, v]) => ({ name, v, color: cat(name) ?? GREY }))} fmt={(v) => `${zl(v)} zł`} />
      </Wykres>
      <Wykres title="Koszty w miesiącach – struktura" opis="Słupki skumulowane: 5 największych kategorii, pozostałe i pracownicy." legend={<Legenda s={d.koszty} />}>
        <Slupki s={d.koszty} stacked />
      </Wykres>
      <Wykres title="Przychód netto wg źródła klienta" opis="Źródło z leada, z którego powstało zlecenie." legend={<p className="text-sm text-ink-2">Źródło znamy tylko dla przychodów ze zleceń utworzonych z leada.</p>}>
        <Poziome rows={d.zrodla.map(([name, v], i) => ({ name, v, color: name === 'Bez leada' ? GREY : SLOT[i % SLOT.length]! }))} fmt={(v) => `${zl(v)} zł`} />
      </Wykres>
      <Wykres title="Osobodni wg branży" opis="Dni w harmonogramie wg branży.">
        <Poziome rows={d.s.kategorie.map((r) => ({ name: r.nazwa, v: r.dni, color: cat(r.nazwa) ?? GREY }))} fmt={(v) => v.toLocaleString('pl-PL', { maximumFractionDigits: 1 })} />
      </Wykres>
      <Wykres title="Średnio osobodni na jedno zlecenie" opis="Średnia liczba dni na zlecenie wg branży.">
        <Poziome rows={d.s.kategorie.map((r) => ({ name: r.nazwa, v: r.srednio, color: cat(r.nazwa) ?? GREY }))} fmt={(v) => v.toLocaleString('pl-PL', { maximumFractionDigits: 1 })} />
      </Wykres>
      <Wykres title="Osobodni wg branży i ekipy" opis="Dla każdej branży podział dni na ekipy." legend={<Legenda s={ekipy} />}>
        <ul className="grid gap-1.5">
          {d.s.kategorie.map((kk) => (
            <li key={kk.nazwa} className="grid grid-cols-[minmax(7rem,11rem)_minmax(0,1fr)_auto] items-center gap-3 text-sm">
              <span className="truncate font-semibold">{kk.nazwa}</span>
              <span className="flex h-4 gap-0.5" style={{ width: `${(kk.dni / (d.s.kategorie[0]?.dni || 1)) * 100}%` }}>
                {ekipy.map((e) => { const v = d.s.krzyz.get(`${kk.nazwa}\u0000${e.name}`) ?? 0; return v ? <span key={e.name} title={`${e.name}: ${v}`} className="h-full first:rounded-l-[2px] last:rounded-r-[4px]" style={{ flexGrow: v, background: e.color }} /> : null; })}
              </span>
              <span className="tabular-nums text-ink-2">{kk.dni.toLocaleString('pl-PL', { maximumFractionDigits: 1 })}</span>
            </li>
          ))}
        </ul>
      </Wykres>
    </div>
  );
}
