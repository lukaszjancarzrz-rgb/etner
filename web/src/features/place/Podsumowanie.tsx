import { useMemo } from 'react';
import { useDane } from './dane.js';
import { MIES_PELNE } from './fmt.js';
import { podsumowanieRoku } from './model.js';
import { TabelaSum, type Kol } from './ui.js';

const KOL: Kol[] = [
  { k: 'godziny', label: 'Godziny', t: 'h' }, { k: 'wyplata', label: 'Wypłata' }, { k: 'urlop', label: 'Urlop' }, { k: 'premie', label: 'Premie' }, { k: 'nalezne', label: 'Należne', b: true },
  { k: 'zaliczki', label: 'Zaliczki' }, { k: 'przelewy', label: 'Przelewy' }, { k: 'doWyplaty', label: 'Do wypłaty', b: true }, { k: 'kosztUmowy', label: 'Koszt umowy' },
  { k: 'inne', label: 'Inne koszty' }, { k: 'koszt', label: 'Koszt razem', b: true }, { k: 'koszt1h', label: 'Koszt 1 h' },
];

/** Podsumowanie płac roku: miesiące (suma osób) i osoby (suma roku) z kosztem 1 h i udziałem w kosztach. */
export function Podsumowanie({ rok }: { rok: string }) {
  const d = useDane();
  const s = useMemo(() => podsumowanieRoku(d, rok), [d, rok]);
  const v = (r: object) => r as Record<string, number | null>;
  return (
    <div className="grid gap-6">
      <TabelaSum title={`Miesiące ${rok}`} first="Miesiąc" cols={KOL} rows={s.miesiace.map((m, i) => ({ id: m.miesiac, label: MIES_PELNE[i]!, v: v(m) }))} razem={v(s.razem)} />
      <TabelaSum title={`Osoby ${rok}`} first="Osoba" cols={[...KOL, { k: 'udzial', label: 'Udział w kosztach', t: 'p' }]}
        rows={s.osoby.map((o) => ({ id: o.personId, label: o.nazwa, v: { ...v(o), udzial: s.razem.koszt ? o.koszt / s.razem.koszt : null } }))} razem={{ ...v(s.razem), udzial: s.razem.koszt ? 1 : null }} />
    </div>
  );
}
