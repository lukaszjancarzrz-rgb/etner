import { useMemo } from 'react';
import { useDane } from './dane.js';
import { MIES } from './fmt.js';
import { przygotuj } from './model.js';
import { TabelaSum, type Kol } from './ui.js';

const KOL: Kol[] = [
  { k: 'limit', label: 'Limit', t: 'h' }, { k: 'wykorzystany', label: 'Wykorzystany', t: 'h' }, { k: 'naZadanie', label: 'w tym na żądanie', t: 'h' }, { k: 'platne', label: 'Płatne', t: 'h', b: true },
  { k: 'darmowe', label: 'Darmowe', t: 'h' }, { k: 'pozostalo', label: 'Pozostało', t: 'h', b: true }, { k: 'L4', label: 'L4', t: 'h' }, { k: 'okolicznosciowy', label: 'Okolicznościowy', t: 'h' },
  { k: 'bezplatny', label: 'Bezpłatny', t: 'h' }, { k: 'razem', label: 'Razem nieobecności', t: 'h' }, { k: 'ustawowy', label: 'Urlop ustawowy (papier)', t: 'h' },
];

/** Urlopy jak arkusz „Statystyki urlopów”: limit, wykorzystanie, płatne i darmowe dni, inne nieobecności; płatne dni w miesiącach. */
export function Urlopy({ rok }: { rok: string }) {
  const d = useDane();
  const P = useMemo(() => przygotuj(d), [d]);
  const u = P.urlopyRoku(rok);
  const osoby = P.lista.map((o) => u.get(o.personId as string)!);
  const suma = (x: (typeof osoby)[number], k: 'wypoczynkowy' | 'naZadanie' | 'L4' | 'okolicznosciowy' | 'bezplatny') => x.mies.reduce((s, n) => s + n[k], 0);
  const wiersz = (x: (typeof osoby)[number]) => ({
    limit: x.limit, wykorzystany: x.wykorzystany, naZadanie: suma(x, 'naZadanie'), platne: x.platneRazem, darmowe: x.darmowe, pozostalo: x.pozostalo, L4: suma(x, 'L4'),
    okolicznosciowy: suma(x, 'okolicznosciowy'), bezplatny: suma(x, 'bezplatny'), razem: x.wykorzystany + suma(x, 'L4') + suma(x, 'okolicznosciowy') + suma(x, 'bezplatny'), ustawowy: x.ustawowy,
  });
  const wiersze = osoby.map((x) => ({ id: x.personId, label: P.nazwa(x.personId), v: wiersz(x) as Record<string, number | null> }));
  const razem = Object.fromEntries(KOL.map((c) => [c.k, wiersze.reduce((s, r) => s + (r.v[c.k] ?? 0), 0)]));
  const mies = MIES.map((m, i) => ({ k: String(i), label: m, t: 'h' as const }));
  const platne = osoby.map((x) => ({ id: x.personId, label: P.nazwa(x.personId), v: { ...Object.fromEntries(x.platne.map((n, i) => [String(i), n])), suma: x.platneRazem } as Record<string, number> }));
  return (
    <div className="grid gap-6">
      <p className="text-sm text-ink-2">Dni robocze z harmonogramu w {rok} r. (pół dnia = 0,5). Urlop wypoczynkowy i na żądanie liczy się do limitu; ponad limit to dni darmowe (bez płatnego urlopu).</p>
      <TabelaSum title={`Urlopy ${rok}`} first="Osoba" cols={KOL} rows={wiersze} razem={razem} />
      <TabelaSum title="Płatne dni urlopu w miesiącach" first="Osoba" cols={[...mies, { k: 'suma', label: 'Razem', t: 'h', b: true }]} rows={platne}
        razem={Object.fromEntries([...mies.map((c) => [c.k, platne.reduce((s, r) => s + (r.v[c.k] ?? 0), 0)]), ['suma', platne.reduce((s, r) => s + (r.v.suma ?? 0), 0)]])} />
    </div>
  );
}
