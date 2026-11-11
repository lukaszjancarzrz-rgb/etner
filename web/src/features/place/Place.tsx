import { useState } from 'react';
import { today } from '../../core/data.js';
import { useDesk } from '../../core/layout/status.js';
import { useEntities } from '../../core/store.js';
import { Segmented } from '../../core/ui/bits.js';
import { cn } from '../../core/ui/cn.js';
import { Select } from '../../core/ui/select.js';
import { MIES_PELNE, poprzedniMiesiac } from './fmt.js';
import { Godziny } from './Godziny.js';
import { Podsumowanie } from './Podsumowanie.js';
import { Pracownicy } from './Pracownicy.js';
import { Rozliczenie } from './Rozliczenie.js';
import { Urlopy } from './Urlopy.js';
import { Wpisy } from './Wpisy.js';
import { Wykresy } from './Wykresy.js';

// zakładka, rok i miesiąc zostają po wyjściu z ekranu
const prev = poprzedniMiesiac(today());
const pamiec: { tab?: string; rok?: string; mies?: string } = {};

/** Płace (admin): rozliczenie miesiąca, godziny, zaliczki i dodatki, urlopy, podsumowanie roku, wykresy i dane pracowników. */
export function Place() {
  const desk = useDesk();
  type Tab = 'rozliczenie' | 'godziny' | 'wpisy' | 'urlopy' | 'podsumowanie' | 'wykresy' | 'pracownicy';
  const TABS: { v: Tab; label: string }[] = [{ v: 'rozliczenie', label: 'Rozliczenie miesiąca' }, { v: 'godziny', label: 'Godziny' }, { v: 'wpisy', label: 'Zaliczki i dodatki' }, { v: 'urlopy', label: 'Urlopy' }, { v: 'podsumowanie', label: 'Podsumowanie' }, { v: 'wykresy', label: 'Wykresy' }, { v: 'pracownicy', label: 'Pracownicy' }];
  const [tab, setTabState] = useState<Tab>(() => (pamiec.tab as Tab) ?? 'rozliczenie');
  const [rok, setRokState] = useState(pamiec.rok ?? prev.slice(0, 4));
  const [mies, setMiesState] = useState(pamiec.mies ?? prev.slice(5));
  const setTab = (t: Tab) => { pamiec.tab = t; setTabState(t); };
  const setRok = (r: string) => { pamiec.rok = r; setRokState(r); };
  const setMies = (m: string) => { pamiec.mies = m; setMiesState(m); };
  const months = useEntities('payroll_months'), wpisy = useEntities('payroll_entries');
  // lata z danymi + bieżący i poprzedni miesiąc
  const lata = [...new Set([today().slice(0, 4), prev.slice(0, 4), ...months.map((r) => String(r.miesiac).slice(0, 4)), ...wpisy.map((r) => String(r.miesiac).slice(0, 4))].filter((y) => /^\d{4}$/.test(y)))].sort().reverse();

  return (
    <section className={cn('mx-auto grid grid-cols-[minmax(0,1fr)] gap-4', desk ? 'max-w-[1400px] px-8 py-5' : 'max-w-3xl px-4 py-4')} aria-label="Płace">
      {/* telefon: 7 zakładek nie mieści się w jednym rzędzie – lista wyboru */}
      {desk ? <Segmented label="Widok" value={tab} onChange={setTab} options={TABS} className="max-w-5xl" />
        : <Select aria-label="Widok" value={tab} onValueChange={(v) => setTab(v as Tab)} options={TABS.map((o) => ({ value: o.v, label: o.label }))} />}
      {tab !== 'pracownicy' && (
        <div className="flex flex-wrap gap-3">
          <div className="w-40"><Select aria-label="Rok" value={rok} onValueChange={setRok} options={lata.map((y) => ({ value: y, label: y }))} /></div>
          {tab === 'rozliczenie' && <div className="w-52"><Select aria-label="Miesiąc" value={mies} onValueChange={setMies} options={MIES_PELNE.map((m, i) => ({ value: String(i + 1).padStart(2, '0'), label: m }))} /></div>}
        </div>
      )}
      {tab === 'rozliczenie' ? <Rozliczenie rok={rok} mies={mies} /> : tab === 'godziny' ? <Godziny rok={rok} /> : tab === 'wpisy' ? <Wpisy rok={rok} /> : tab === 'urlopy' ? <Urlopy rok={rok} />
        : tab === 'podsumowanie' ? <Podsumowanie rok={rok} /> : tab === 'wykresy' ? <Wykresy rok={rok} /> : <Pracownicy />}
    </section>
  );
}
