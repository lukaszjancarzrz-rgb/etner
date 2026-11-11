import { FileArrowUp, Plus } from '@phosphor-icons/react';
import { useState } from 'react';
import { today, useDict } from '../../core/data.js';
import { useDesk } from '../../core/layout/status.js';
import { Segmented } from '../../core/ui/bits.js';
import { Button } from '../../core/ui/button.js';
import { cn } from '../../core/ui/cn.js';
import { Input } from '../../core/ui/input.js';
import { Search } from '../../core/ui/search.js';
import { Select } from '../../core/ui/select.js';
import { KpirImport } from './KpirImport.js';
import { Koszty } from './Koszty.js';
import { Przychody } from './Przychody.js';
import { RevenueForm } from './RevenueForm.js';
import { KontrolaKpir } from './KontrolaKpir.js';
import { Statystyki } from './Statystyki.js';
import { Wynik } from './Wynik.js';
import { Wykresy } from './Wykresy.js';
import { useEntities } from '../../core/store.js';

const ALL = '';

/** Finanse (admin): przychody i koszty wybranego miesiąca albo całego roku, import miesiąca z KPiR. */
export function Finanse() {
  const desk = useDesk();
  type Tab = 'przychody' | 'koszty' | 'wynik' | 'wykresy' | 'kpir' | 'stat';
  const TABS: { v: Tab; label: string }[] = [{ v: 'przychody', label: 'Przychody' }, { v: 'koszty', label: 'Koszty' }, { v: 'wynik', label: 'Wynik' }, { v: 'wykresy', label: 'Wykresy' }, { v: 'kpir', label: 'KPiR' }, { v: 'stat', label: 'Statystyki' }];
  const [tab, setTab] = useState<Tab>('przychody');
  const [rok, setRok] = useState(today().slice(0, 4));
  const revenues = useEntities('revenues');
  // lata z danymi + bieżący (wybór roku dla Wyniku, KPiR i Statystyk)
  const lata = [...new Set([today().slice(0, 4), ...revenues.map((r) => String(r.miesiac ?? r.dzien ?? '').slice(0, 4)).filter((y) => /^\d{4}$/.test(y))])].sort().reverse();
  const lista = tab === 'przychody' || tab === 'koszty';
  const [q, setQ] = useState('');
  const [mies, setMies] = useState(''); // pusty = cały rok (domyślnie: właściciel po imporcie nie widział danych z wcześniejszych miesięcy)
  const [filtr, setFiltr] = useState({ przychody: ALL, koszty: ALL });
  const kat = useDict(tab === 'koszty' ? 'kategoria_kosztu' : 'kategoria');
  const [imp, setImp] = useState(false);
  const [nowy, setNowy] = useState(false);
  const okres = mies || today().slice(0, 4);

  return (
    <section className={cn('mx-auto grid grid-cols-[minmax(0,1fr)] gap-4', desk ? 'max-w-[1400px] px-8 py-5' : 'max-w-3xl px-4 py-4')} aria-label="Finanse">
      {/* telefon: 6 zakładek nie mieści się w jednym rzędzie – lista wyboru */}
      {desk ? <Segmented label="Widok" value={tab} onChange={setTab} options={TABS} className="max-w-3xl" />
        : <Select aria-label="Widok" value={tab} onValueChange={(v) => setTab(v as Tab)} options={TABS.map((o) => ({ value: o.v, label: o.label }))} />}
      {!lista && <div className="w-40"><Select aria-label="Rok" value={rok} onValueChange={setRok} options={lata.map((y) => ({ value: y, label: y }))} /></div>}
      {lista && <div className="flex flex-wrap items-center gap-3">
        <div className="w-full desk:w-[24rem]"><Search value={q} onChange={setQ} label="Szukaj" placeholder="Klient, opis, kontrahent" /></div>
        <div className="w-52"><Input type="month" aria-label="Miesiąc" value={mies} onChange={(e) => setMies(e.target.value)} /></div>
        <Button variant={mies ? 'secondary' : 'primary'} onClick={() => setMies(mies ? '' : today().slice(0, 7))} aria-pressed={!mies}>Cały rok</Button>
        <div className="w-56"><Select aria-label={tab === 'przychody' ? 'Branża' : 'Kategoria'} value={filtr[tab as 'przychody' | 'koszty'] || '*'} onValueChange={(v) => setFiltr({ ...filtr, [tab as 'przychody' | 'koszty']: v === '*' ? ALL : v })}
          options={[{ value: '*', label: tab === 'przychody' ? 'Wszystkie branże' : 'Wszystkie kategorie' }, ...kat.map((x) => ({ value: x.wartosc as string, label: x.wartosc as string }))]} /></div>
        <div className="flex flex-wrap gap-3 desk:ml-auto">
          <Button variant="secondary" onClick={() => setImp(true)}><FileArrowUp className="h-5 w-5" />Importuj miesiąc z KPiR</Button>
          {tab === 'przychody' && <Button onClick={() => setNowy(true)}><Plus className="h-5 w-5" weight="bold" />Przychód</Button>}
        </div>
      </div>}
      {tab === 'przychody' ? <Przychody q={q} okres={okres} filtr={filtr.przychody} /> : tab === 'koszty' ? <Koszty q={q} okres={okres} filtr={filtr.koszty} />
        : tab === 'wynik' ? <Wynik rok={rok} /> : tab === 'wykresy' ? <Wykresy rok={rok} /> : tab === 'kpir' ? <KontrolaKpir rok={rok} /> : <Statystyki rok={rok} />}
      {nowy && <RevenueForm onClose={() => setNowy(false)} />}
      {imp && <KpirImport onClose={() => setImp(false)} />}
    </section>
  );
}
