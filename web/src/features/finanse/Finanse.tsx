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

const ALL = '';

/** Finanse (admin): przychody i koszty wybranego miesiąca albo całego roku, import miesiąca z KPiR. */
export function Finanse() {
  const desk = useDesk();
  const [tab, setTab] = useState<'przychody' | 'koszty'>('przychody');
  const [q, setQ] = useState('');
  const [mies, setMies] = useState(today().slice(0, 7)); // pusty = cały rok
  const [filtr, setFiltr] = useState({ przychody: ALL, koszty: ALL });
  const kat = useDict(tab === 'przychody' ? 'kategoria' : 'kategoria_kosztu');
  const [imp, setImp] = useState(false);
  const [nowy, setNowy] = useState(false);
  const okres = mies || today().slice(0, 4);

  return (
    <section className={cn('mx-auto grid gap-4', desk ? 'max-w-[1400px] px-8 py-5' : 'max-w-3xl px-4 py-4')} aria-label="Finanse">
      <Segmented label="Widok" value={tab} onChange={setTab} options={[{ v: 'przychody', label: 'Przychody' }, { v: 'koszty', label: 'Koszty' }]} className="max-w-sm" />
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full desk:w-[24rem]"><Search value={q} onChange={setQ} label="Szukaj" placeholder="Klient, opis, kontrahent" /></div>
        <div className="w-52"><Input type="month" aria-label="Miesiąc" value={mies} onChange={(e) => setMies(e.target.value)} /></div>
        <Button variant={mies ? 'secondary' : 'primary'} onClick={() => setMies(mies ? '' : today().slice(0, 7))} aria-pressed={!mies}>Cały rok</Button>
        <div className="w-56"><Select aria-label={tab === 'przychody' ? 'Branża' : 'Kategoria'} value={filtr[tab] || '*'} onValueChange={(v) => setFiltr({ ...filtr, [tab]: v === '*' ? ALL : v })}
          options={[{ value: '*', label: tab === 'przychody' ? 'Wszystkie branże' : 'Wszystkie kategorie' }, ...kat.map((x) => ({ value: x.wartosc as string, label: x.wartosc as string }))]} /></div>
        <div className="flex flex-wrap gap-3 desk:ml-auto">
          <Button variant="secondary" onClick={() => setImp(true)}><FileArrowUp className="h-5 w-5" />Importuj miesiąc z KPiR</Button>
          {tab === 'przychody' && <Button onClick={() => setNowy(true)}><Plus className="h-5 w-5" weight="bold" />Przychód</Button>}
        </div>
      </div>
      {tab === 'przychody' ? <Przychody q={q} okres={okres} filtr={filtr.przychody} /> : <Koszty q={q} okres={okres} filtr={filtr.koszty} />}
      {nowy && <RevenueForm onClose={() => setNowy(false)} />}
      {imp && <KpirImport onClose={() => setImp(false)} />}
    </section>
  );
}
