import { RODZAJ_WPISU_LABEL, RODZAJE_WPISU, type RodzajWpisu } from '@etner/shared';
import { Plus, Receipt } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { today } from '../../core/data.js';
import { useDesk } from '../../core/layout/status.js';
import { TitleCount } from '../../core/layout/TopBar.js';
import type { Rec } from '../../core/store.js';
import { Empty } from '../../core/ui/bits.js';
import { Button } from '../../core/ui/button.js';
import { Select } from '../../core/ui/select.js';
import { Table, Td, Th, Tr } from '../../core/ui/table.js';
import { useDane } from './dane.js';
import { kw, MIES_PELNE } from './fmt.js';
import { przygotuj } from './model.js';
import { Usun } from './ui.js';
import { WpisForm } from './WpisForm.js';

const WSZ = '*';
const dm = (w: Rec) => (w.dzien ? `${String(w.dzien).slice(8)}.${String(w.dzien).slice(5, 7)}` : '');

/** Zaliczki, przelewy, premie i inne koszty: lista roku z filtrem osoby i miesiąca, dodawanie i edycja po kliknięciu. */
export function Wpisy({ rok }: { rok: string }) {
  const desk = useDesk();
  const d = useDane();
  const P = useMemo(() => przygotuj(d), [d]);
  const [osoba, setOsoba] = useState(WSZ), [mies, setMies] = useState(WSZ);
  const [edit, setEdit] = useState<Rec | 'nowy' | null>(null);
  const osoby = P.lista.map((o) => ({ id: o.personId as string, nazwa: P.nazwa(o.personId) }));
  const list = useMemo(() => P.wpisy.filter((w) => String(w.miesiac).startsWith(rok) && (osoba === WSZ || w.personId === osoba) && (mies === WSZ || w.miesiac === `${rok}-${mies}`))
    .sort((a, b) => String(b.miesiac).localeCompare(String(a.miesiac)) || String(b.dzien ?? '').localeCompare(String(a.dzien ?? ''))), [P, rok, osoba, mies]);
  const razem = (r: RodzajWpisu) => list.filter((w) => w.rodzaj === r).reduce((s, w) => s + (w.kwotaGr as number), 0);
  const mp = (w: Rec) => `${MIES_PELNE[Number(String(w.miesiac).slice(5)) - 1]}${dm(w) ? ` (${dm(w)})` : ''}`;
  const del = (w: Rec) => <Usun entity="payroll_entries" id={w.id} url={`/api/payroll/entries/${w.id}`} opis={`${RODZAJ_WPISU_LABEL[w.rodzaj as RodzajWpisu]} ${P.nazwa(w.personId)}`} tmp={!!w._tmp} />;

  return (
    <div className="grid gap-4">
      <TitleCount n={list.length} />
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-52"><Select aria-label="Osoba" value={osoba} onValueChange={setOsoba} options={[{ value: WSZ, label: 'Wszystkie osoby' }, ...osoby.map((o) => ({ value: o.id, label: o.nazwa }))]} /></div>
        <div className="w-48"><Select aria-label="Miesiąc" value={mies} onValueChange={setMies} options={[{ value: WSZ, label: 'Cały rok' }, ...MIES_PELNE.map((m, i) => ({ value: String(i + 1).padStart(2, '0'), label: m }))]} /></div>
        <Button className="desk:ml-auto" onClick={() => setEdit('nowy')} disabled={!osoby.length}><Plus className="h-5 w-5" weight="bold" />Wpis</Button>
      </div>
      {!list.length ? <Empty icon={Receipt} title="Brak wpisów" hint="Dodaj zaliczkę, przelew, premię albo inny koszt." /> : desk ? (
        <Table aria-label="Zaliczki i dodatki">
          <thead><tr><Th className="w-[11rem]">Miesiąc</Th><Th className="w-[12rem]">Osoba</Th><Th className="w-[13rem]">Rodzaj</Th><Th num className="w-[8rem]">Kwota</Th><Th>Opis</Th><Th className="w-12"><span className="sr-only">Usuń</span></Th></tr></thead>
          <tbody>{list.map((w) => (
            <Tr key={w.id} onOpen={w._tmp ? undefined : () => setEdit(w)}>
              <Td>{mp(w)}</Td><Td>{P.nazwa(w.personId)}</Td><Td>{RODZAJ_WPISU_LABEL[w.rodzaj as RodzajWpisu]}</Td><Td num className="font-semibold">{kw(w.kwotaGr)}</Td><Td title={w.opis}>{w.opis}</Td>
              <Td pad="p-0" className="text-center">{del(w)}</Td>
            </Tr>))}
          </tbody>
        </Table>
      ) : (
        <ul className="grid gap-3">{list.map((w) => (
          <li key={w.id} className="flex items-start justify-between gap-3 rounded-[4px] border border-line bg-card px-4 py-3">
            <button type="button" disabled={!!w._tmp} onClick={() => setEdit(w)} className="min-w-0 flex-1 text-left">
              <span className="block font-semibold leading-snug">{P.nazwa(w.personId)} · {RODZAJ_WPISU_LABEL[w.rodzaj as RodzajWpisu]}</span>
              <span className="block text-sm text-ink-2">{[mp(w), w.opis].filter(Boolean).join(' · ')}</span>
            </button>
            <div className="flex shrink-0 items-center gap-1"><span className="font-extrabold tabular-nums">{kw(w.kwotaGr)}</span>{del(w)}</div>
          </li>))}
        </ul>
      )}
      <p className="text-right text-sm text-ink-2 tabular-nums">{RODZAJE_WPISU.map((r) => `${RODZAJ_WPISU_LABEL[r]}: ${kw(razem(r)) === '—' ? '0,00' : kw(razem(r))} zł`).join(' · ')}</p>
      {edit && <WpisForm wpis={edit === 'nowy' ? undefined : edit} osoby={osoby} osoba={osoba === WSZ ? undefined : osoba} miesiac={mies === WSZ ? `${rok}-${today().slice(5, 7)}` : `${rok}-${mies}`} onClose={() => setEdit(null)} />}
    </div>
  );
}
