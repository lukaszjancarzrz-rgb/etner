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
const H: F = { tick: (v) => (v ? lb(v) : '0'), tip: (v) => `${lb(v)} h` };
const DNI: F = { tick: (v) => (v ? lb(v) : '0'), tip: (v) => `${lb(v)} dni` };
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
  // linia kończy się na ostatnim miesiącu z danymi (bez spadku do zera w przyszłych miesiącach)
  const pkt = line ? line.values.slice(0, line.values.length - [...line.values].reverse().findIndex((v) => v !== 0)) : [];
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
        <polyline fill="none" stroke={line.color} strokeWidth="2" points={pkt.map((v, i) => `${L + i * slot + slot / 2},${ly(v)}`).join(' ')} />
        {pkt.map((v, i) => <circle key={i} cx={L + i * slot + slot / 2} cy={ly(v)} r="4" fill={line.color} stroke="var(--card)" strokeWidth="2"><title>{`${MIES[i]}: ${line.name} ${(line.f ?? f).tip(v)}`}</title></circle>)}
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

const KOSZT = [
  { k: 'wyplata', name: 'Wypłaty za godziny', color: SLOT[0]! }, { k: 'urlop', name: 'Urlop płatny', color: SLOT[2]! }, { k: 'premie', name: 'Premie i dodatki', color: SLOT[4]! },
  { k: 'kosztUmowy', name: 'Koszty umowy (ZUS, zdrow., PIT)', color: SLOT[1]! }, { k: 'inne', name: 'Inne koszty', color: SLOT[3]! },
] as const;

/** Wykresy płac roku jak w arkuszu (Podsumowanie płac, Statystyki urlopów): godziny, wypłaty, koszty, urlopy i nieobecności; dokładne liczby w pozostałych zakładkach. */
export function Wykresy({ rok }: { rok: string }) {
  const dane = useDane();
  const P = useMemo(() => przygotuj(dane), [dane]);
  const x = useMemo(() => {
    const ms = MIESIACE.map((mm) => `${rok}-${mm}`);
    const u = P.urlopyRoku(rok);
    const os = P.lista.map((o, j) => {
      const id = o.personId as string, wr = ms.map((m) => wierszRozliczenia(P, dane, id, m)), uu = u.get(id)!;
      return { name: P.nazwa(id), color: SLOT[j % SLOT.length]!, wr, uu, h: wr.map((r) => r.godziny) };
    });
    const mies = (g: (o: (typeof os)[number], i: number) => number) => MIES.map((_, i) => sum(os.map((o) => g(o, i))));
    // te same składniki kosztu co w arkuszu „Podsumowanie płac”
    const sk = KOSZT.map((k) => ({ ...k, values: mies((o, i) => o.wr[i]![k.k]) }));
    const nieobOsoby = (o: (typeof os)[number]) => o.uu.mies.map((n) => n.wypoczynkowy + n.naZadanie + n.L4 + n.okolicznosciowy + n.bezplatny);
    return {
      os,
      godz: os.map((o) => ({ name: o.name, color: o.color, values: o.h })), wyp: os.map((o) => ({ name: o.name, color: o.color, values: o.wr.map((r) => r.wyplata) })),
      struktura: sk.filter((x) => sum(x.values)),
      razemH: { name: 'Godziny', color: 'var(--ink)', values: mies((o, i) => o.h[i]!), right: true, f: H },
      razemW: { name: 'Wypłaty za godziny', color: SLOT[0]!, values: mies((o, i) => o.wr[i]!.wyplata) },
      nieob: os.map((o) => ({ name: o.name, color: o.color, values: nieobOsoby(o) })).filter((x) => sum(x.values)),
    };
  }, [P, dane, rok]);
  const ludzie = x.os.map((o) => ({ name: o.name, color: o.color }));
  const urlop = [{ name: 'Płatny', color: SLOT[2]! }, { name: 'Darmowy (ponad limit)', color: SLOT[1]! }, { name: 'Pozostało płatnych', color: GREY }];
  return (
    <div className="grid gap-4 min-[1400px]:grid-cols-2">
      <Wykres title="Godziny pracy w miesiącach — każdy pracownik" opis="Słupki skumulowane: godziny osób w miesiącach." legend={<Legenda s={ludzie} />}><Slupki s={x.godz} f={H} stacked /></Wykres>
      <Wykres title="Wypłaty za godziny w miesiącach — każdy pracownik" opis="Słupki skumulowane: godziny × stawka każdej osoby." legend={<Legenda s={ludzie} />}><Slupki s={x.wyp} f={ZL} stacked /></Wykres>
      <Wykres title={`Godziny w roku ${rok} — na pracownika`} opis="Ranking osób wg godzin w roku.">
        <Poziome f={H} rows={x.os.map((o) => ({ name: o.name, parts: [{ color: o.color, v: sum(o.h) }] })).sort((a, b) => b.parts[0]!.v - a.parts[0]!.v)} />
      </Wykres>
      <Wykres title={`Koszt roczny ${rok} na pracownika`} opis="Dla każdej osoby: wypłaty za godziny, urlop płatny, premie, koszty umowy i inne koszty." legend={<Legenda s={[...KOSZT]} />}>
        <Poziome f={ZL} rows={x.os.map((o) => ({ name: o.name, parts: KOSZT.map((k) => ({ color: k.color, label: k.name, v: sum(o.wr.map((r) => r[k.k])) })) }))} />
      </Wykres>
      <Wykres title="Koszty firmy w miesiącach — struktura" opis="Słupki skumulowane: wypłaty za godziny, urlop płatny, premie, koszty umów, inne koszty." legend={<Legenda s={x.struktura} />}><Slupki s={x.struktura} f={ZL} stacked /></Wykres>
      <Wykres title="Łącznie w miesiącach: wypłaty za godziny i godziny" opis="Słupki: wypłaty za godziny wszystkich osób; linia: godziny (oś po prawej)." legend={<Legenda s={[x.razemW, { ...x.razemH, line: true }]} />}><Slupki s={[x.razemW]} f={ZL} line={x.razemH} /></Wykres>
      <Wykres title={`Urlop ${rok}: płatny, darmowy, pozostały (dni)`} opis="Dla każdej osoby dni urlopu płatnego, darmowego i pozostałych do limitu." legend={<Legenda s={urlop} />}>
        <Poziome f={DNI} rows={x.os.map((o) => ({ name: o.name, parts: [{ color: urlop[0]!.color, label: urlop[0]!.name, v: o.uu.platneRazem }, { color: urlop[1]!.color, label: urlop[1]!.name, v: o.uu.darmowe }, { color: urlop[2]!.color, label: urlop[2]!.name, v: Math.max(0, o.uu.pozostalo) }] }))} />
      </Wykres>
      <Wykres title="Nieobecności w miesiącach — wszyscy (dni)" opis="Słupki skumulowane: urlopy, L4 i inne nieobecności każdej osoby (dni robocze)." legend={<Legenda s={x.nieob} />}><Slupki s={x.nieob} f={DNI} stacked /></Wykres>
    </div>
  );
}
