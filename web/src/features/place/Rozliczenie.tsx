import { Wallet } from '@phosphor-icons/react';
import { useMemo } from 'react';
import { FORMA_LABEL } from '@etner/shared';
import { useDesk } from '../../core/layout/status.js';
import { Empty } from '../../core/ui/bits.js';
import { useDane } from './dane.js';
import { kw, lb, MIES_PELNE } from './fmt.js';
import { rozliczenieMiesiaca, type Sumy, type WierszRozliczenia } from './model.js';
import { TabelaSum, type Kol } from './ui.js';

const KOL: Kol[] = [
  { k: 'godziny', label: 'Godziny', t: 'h' }, { k: 'stawka', label: 'Stawka / h' }, { k: 'wyplata', label: 'Wypłata' }, { k: 'urlopDni', label: 'Dni urlopu', t: 'h' }, { k: 'urlop', label: 'Urlop' },
  { k: 'premie', label: 'Premie' }, { k: 'nalezne', label: 'Należne', b: true }, { k: 'zaliczki', label: 'Zaliczki' }, { k: 'przelewy', label: 'Przelewy' },
  { k: 'doWyplaty', label: 'Do wypłaty', b: true }, { k: 'kosztUmowy', label: 'Koszt umowy' }, { k: 'inne', label: 'Inne koszty' }, { k: 'koszt', label: 'Koszt razem', b: true },
];

/** Rozliczenie miesiąca jak arkusz: wiersz na osobę (wypłata, urlop, premie, zaliczki, do wypłaty, koszty) i RAZEM. Telefon: karty. */
export function Rozliczenie({ rok, mies }: { rok: string; mies: string }) {
  const desk = useDesk();
  const d = useDane();
  const m = `${rok}-${mies}`;
  const { wiersze, razem } = useMemo(() => rozliczenieMiesiaca(d, m), [d, m]);
  const nazwa = `${MIES_PELNE[Number(mies) - 1]} ${rok}`;
  if (!wiersze.length) return <Empty icon={Wallet} title="Brak pracowników w Płacach" hint="Dodaj dane umowy w zakładce Pracownicy." />;
  if (desk) return <TabelaSum title={`Rozliczenie: ${nazwa}`} first="Osoba" cols={KOL} rows={wiersze.map((r) => ({ id: r.personId, label: r.nazwa, v: r as unknown as Record<string, number> }))} razem={razem as unknown as Record<string, number>} />;
  const Karta = ({ title, sub, r }: { title: string; sub?: string; r: WierszRozliczenia | Sumy }) => (
    <section className="grid gap-2 rounded-[4px] border border-line bg-card p-4" aria-label={title}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="text-right"><span className="block text-sm text-ink-2">Do wypłaty</span><span className="text-xl font-extrabold tabular-nums">{kw(r.doWyplaty)}</span></p>
      </div>
      {sub && <p className="text-sm text-ink-2">{sub}</p>}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm tabular-nums">
        {([['godziny', 'Godziny'], ['wyplata', 'Wypłata'], ['urlop', 'Urlop'], ['premie', 'Premie'], ['nalezne', 'Należne'], ['zaliczki', 'Zaliczki'], ['przelewy', 'Przelewy'], ['kosztUmowy', 'Koszt umowy'], ['inne', 'Inne koszty'], ['koszt', 'Koszt razem']] as const).map(([k, l]) => (
          <div key={k}><dt className="text-ink-2">{l}</dt><dd className="font-semibold">{k === 'godziny' ? lb(r[k]) : kw(r[k])}</dd></div>
        ))}
      </dl>
    </section>
  );
  return (
    <div className="grid gap-3">
      <h2 className="text-lg font-bold">{nazwa}</h2>
      {wiersze.map((r) => <Karta key={r.personId} title={r.nazwa} r={r} sub={`${FORMA_LABEL[r.forma]} · stawka ${kw(r.stawka)} zł/h`} />)}
      <Karta title="RAZEM" r={razem} />
    </div>
  );
}
