import { useMemo, type ReactNode } from 'react';
import { SectionTitle } from '../../core/ui/bits.js';
import { zl } from '../finanse/Wynik.js';
import { useDane } from './dane.js';
import { lb, MIES } from './fmt.js';
import { MIESIACE, przygotuj, wierszRozliczenia } from './model.js';

// paleta i budowa jak w finanse/Wykresy.tsx (tam bloki nie są eksportowane)
const SLOT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const GREY = 'var(--field)';
type Seria = { name: string; color: string; values: number[] };
type F = { tick: (v: number) => string; tip: (v: number) => string };
const ZL: F = { tick: (v) => (Math.abs(v) >= 100_000 ? `${Math.round(v / 100_000)} tys.` : zl(v)), tip: (v) => `${zl(v)} zł` };
const H: F = { tick: lb, tip: (v) => `${lb(v)} h` };
const DNI: F = { tick: lb, tip: (v) => `${lb(v)} dni` };
const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);

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

/** Słupki w miesiącach, skumulowane albo obok siebie; opcjonalnie linia (`right` = własna oś po prawej). Podpowiedź po najechaniu (title). */
function Slupki({ s, f, stacked, line, h = 220 }: { s: Seria[]; f: F; stacked?: boolean; line?: Seria & { right?: boolean; f?: F }; h?: number }) {
  const R = line?.right ? 48 : 0, W = 720, L = 56, B = 22, T = 8, slot = (W - L - R) / 12;
  const tops = MIES.map((_, i) => (stacked ? sum(s.map((x) => Math.max(0, x.values[i]!))) : Math.max(0, ...s.map((x) => x.values[i]!))));
  const max = Math.max(...tops, ...(line && !line.right ? line.values : []), 0) || 1;
  const y = (v: number) => T + (h - T - B) * (max - v) / max;
  const lmax = Math.max(...(line?.values ?? []), 0) || 1;
  const ly = (v: number) => (line?.right ? T + (h - T - B) * (lmax - v) / lmax : y(v));
  const bw = stacked ? slot * 0.6 : (slot * 0.7) / s.length;
  return (
    <svg viewBox={`0 0 ${W} ${h}`} className="w-full text-ink-2" style={{ maxHeight: h }}>
      {[max, max / 2, 0].map((t, i) => <g key={i}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--rule)" /><text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="14" fill="currentColor">{f.tick(t)}</text></g>)}
      {line?.right && [lmax, lmax / 2].map((t, i) => <text key={i} x={W - R + 6} y={ly(t) + 4} fontSize="14" fill={line.color}>{(line.f ?? f).tick(t)}</text>)}
      {MIES.map((m, i) => {
        let acc = 0;
        return (
          <g key={m}>
            {s.map((x, j) => {
              const v = x.values[i]!;
              if (!v) return null;
              const x0 = L + i * slot + (stacked ? slot * 0.2 : slot * 0.15 + j * bw);
              const y0 = stacked ? y(acc + v) : y(v), y1 = stacked ? y(acc) : y(0);
              if (stacked) acc += v;
              return <rect key={x.name} x={x0 + 1} y={y0} width={Math.max(bw - 2, 2)} height={Math.max(y1 - y0 - (stacked ? 2 : 0), 1)} rx="2" fill={x.color}><title>{`${m}: ${x.name} ${f.tip(v)}`}</title></rect>;
            })}
            <text x={L + i * slot + slot / 2} y={h - 6} textAnchor="middle" fontSize="14" fill="currentColor">{m}</text>
          </g>
        );
      })}
      {line && <>
        <polyline fill="none" stroke={line.color} strokeWidth="2" points={line.values.map((v, i) => `${L + i * slot + slot / 2},${ly(v)}`).join(' ')} />
        {line.values.map((v, i) => <circle key={i} cx={L + i * slot + slot / 2} cy={ly(v)} r="4" fill={line.color} stroke="var(--card)" strokeWidth="2"><title>{`${MIES[i]}: ${line.name} ${(line.f ?? f).tip(v)}`}</title></circle>)}
      </>}
    </svg>
  );
}

/** Wiersze z podpisem, słupkiem (pojedynczym albo ze składnikami obok siebie) i wartością. */
function Poziome({ rows, f }: { rows: { name: string; parts: { color: string; v: number; label?: string }[] }[]; f: F }) {
  const max = Math.max(...rows.map((r) => sum(r.parts.map((p) => p.v))), 1);
  return (
    <ul className="grid gap-1.5">
      {rows.map((r) => (
        <li key={r.name} className="grid grid-cols-[minmax(6rem,10rem)_minmax(0,1fr)_auto] items-center gap-3 text-sm">
          <span className="truncate font-semibold">{r.name}</span>
          <span className="flex h-4 gap-0.5" style={{ width: `${(sum(r.parts.map((p) => p.v)) / max) * 100}%`, minWidth: 2 }}>
            {r.parts.map((p, i) => (p.v > 0 ? <span key={i} title={`${p.label ?? r.name}: ${f.tip(p.v)}`} className="h-full first:rounded-l-[2px] last:rounded-r-[4px]" style={{ flexGrow: p.v, background: p.color }} /> : null))}
          </span>
          <span className="tabular-nums text-ink-2">{f.tip(sum(r.parts.map((p) => p.v)))}</span>
        </li>
      ))}
    </ul>
  );
}

/** Wykresy płac roku: godziny, wypłaty, koszty, urlopy i nieobecności; dokładne liczby w pozostałych zakładkach. */
export function Wykresy({ rok }: { rok: string }) {
  const dane = useDane();
  const P = useMemo(() => przygotuj(dane), [dane]);
  const x = useMemo(() => {
    const ms = MIESIACE.map((mm) => `${rok}-${mm}`);
    const u = P.urlopyRoku(rok);
    const os = P.lista.map((o, j) => {
      const id = o.personId as string, wr = ms.map((m) => wierszRozliczenia(P, dane, id, m)), uu = u.get(id)!;
      return { name: P.nazwa(id), color: SLOT[j % SLOT.length]!, wr, uu, h: wr.map((r) => r.godziny), nalezne: wr.map((r) => r.nalezne) };
    });
    const mies = (g: (o: (typeof os)[number], i: number) => number) => MIES.map((_, i) => sum(os.map((o) => g(o, i))));
    const nieob = (k: 'wypoczynkowy' | 'naZadanie' | 'L4' | 'okolicznosciowy' | 'bezplatny') => mies((o, i) => o.uu.mies[i]![k]);
    return {
      os,
      godz: os.map((o) => ({ name: o.name, color: o.color, values: o.h })), wyp: os.map((o) => ({ name: o.name, color: o.color, values: o.nalezne })),
      struktura: [
        { name: 'Wynagrodzenia', color: SLOT[0]!, values: mies((o, i) => o.wr[i]!.nalezne) }, { name: 'Koszt umowy', color: SLOT[1]!, values: mies((o, i) => o.wr[i]!.kosztUmowy) }, { name: 'Inne koszty', color: SLOT[3]!, values: mies((o, i) => o.wr[i]!.inne) },
      ].filter((s) => sum(s.values)),
      razemH: { name: 'Godziny razem', color: 'var(--ink)', values: mies((o, i) => o.h[i]!), right: true, f: H },
      razemW: { name: 'Wypłaty razem', color: SLOT[0]!, values: mies((o, i) => o.nalezne[i]!) },
      nieob: [
        { name: 'Urlop', color: SLOT[0]!, values: MIES.map((_, i) => nieob('wypoczynkowy')[i]! + nieob('naZadanie')[i]!) }, { name: 'L4', color: SLOT[1]!, values: nieob('L4') },
        { name: 'Okolicznościowy', color: SLOT[3]!, values: nieob('okolicznosciowy') }, { name: 'Bezpłatny', color: GREY, values: nieob('bezplatny') },
      ].filter((s) => sum(s.values)),
    };
  }, [P, dane, rok]);
  const ludzie = x.os.map((o) => ({ name: o.name, color: o.color }));
  const koszt = [{ name: 'Wynagrodzenia', color: SLOT[0]! }, { name: 'Koszt umowy', color: SLOT[1]! }, { name: 'Inne koszty', color: SLOT[3]! }];
  const urlop = [{ name: 'Płatny', color: SLOT[2]! }, { name: 'Darmowy', color: SLOT[1]! }, { name: 'Pozostały', color: GREY }];
  return (
    <div className="grid gap-4 min-[1400px]:grid-cols-2">
      <Wykres title="Godziny w miesiącach (na osobę)" opis="Słupki skumulowane: godziny osób w miesiącach." legend={<Legenda s={ludzie} />}><Slupki s={x.godz} f={H} stacked /></Wykres>
      <Wykres title="Wypłaty w miesiącach (na osobę)" opis="Słupki skumulowane: należne wypłaty osób w miesiącach." legend={<Legenda s={ludzie} />}><Slupki s={x.wyp} f={ZL} stacked /></Wykres>
      <Wykres title={`Godziny w ${rok} (na osobę)`} opis="Ranking osób wg godzin w roku.">
        <Poziome f={H} rows={x.os.map((o) => ({ name: o.name, parts: [{ color: o.color, v: sum(o.h) }] })).sort((a, b) => b.parts[0]!.v - a.parts[0]!.v)} />
      </Wykres>
      <Wykres title={`Koszt roczny ${rok} (na osobę)`} opis="Dla każdej osoby podział kosztu na wynagrodzenie, koszt umowy i inne koszty." legend={<Legenda s={koszt} />}>
        <Poziome f={ZL} rows={x.os.map((o) => ({ name: o.name, parts: [{ color: SLOT[0]!, label: 'Wynagrodzenia', v: sum(o.nalezne) }, { color: SLOT[1]!, label: 'Koszt umowy', v: sum(o.wr.map((r) => r.kosztUmowy)) }, { color: SLOT[3]!, label: 'Inne koszty', v: sum(o.wr.map((r) => r.inne)) }] }))} />
      </Wykres>
      <Wykres title="Struktura kosztów w miesiącach" opis="Słupki skumulowane: wynagrodzenia, koszt umowy, inne koszty." legend={<Legenda s={x.struktura} />}><Slupki s={x.struktura} f={ZL} stacked /></Wykres>
      <Wykres title="Wypłaty i godziny łącznie" opis="Słupki wypłat wszystkich osób, linia godzin (oś po prawej)." legend={<Legenda s={[x.razemW, { ...x.razemH, line: true }]} />}><Slupki s={[x.razemW]} f={ZL} line={x.razemH} /></Wykres>
      <Wykres title={`Urlop ${rok}: płatny, darmowy, pozostały (dni)`} opis="Dla każdej osoby dni urlopu płatnego, darmowego i pozostałych do limitu." legend={<Legenda s={urlop} />}>
        <Poziome f={DNI} rows={x.os.map((o) => ({ name: o.name, parts: [{ color: urlop[0]!.color, label: 'Płatny', v: o.uu.platneRazem }, { color: urlop[1]!.color, label: 'Darmowy', v: o.uu.darmowe }, { color: urlop[2]!.color, label: 'Pozostały', v: Math.max(0, o.uu.pozostalo) }] }))} />
      </Wykres>
      <Wykres title="Nieobecności w miesiącach (dni)" opis="Słupki skumulowane: urlop, L4, okolicznościowy, bezpłatny." legend={<Legenda s={x.nieob} />}><Slupki s={x.nieob} f={DNI} stacked /></Wykres>
    </div>
  );
}
