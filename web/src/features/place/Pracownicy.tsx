import { FORMA_LABEL, type Forma } from '@etner/shared';
import { UsersThree } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { useDesk } from '../../core/layout/status.js';
import type { Rec } from '../../core/store.js';
import { Empty, SectionTitle } from '../../core/ui/bits.js';
import { Table, Td, Th, Tr } from '../../core/ui/table.js';
import { useDane } from './dane.js';
import { kw, lb } from './fmt.js';
import { przygotuj } from './model.js';
import { PracownikForm } from './PracownikForm.js';

const okres = (o?: Rec) => (o?.umowaOd || o?.umowaDo ? `${o.umowaOd ? String(o.umowaOd).split('-').reverse().join('.') : '…'} – ${o.umowaDo ? String(o.umowaDo).split('-').reverse().join('.') : 'bezterminowa'}` : '');

/** Osoby z harmonogramu z danymi płacowymi (forma, umowa, brutto, stawka, limit urlopu); kliknięcie otwiera formularz. */
export function Pracownicy() {
  const desk = useDesk();
  const d = useDane();
  const P = useMemo(() => przygotuj(d), [d]);
  const [edit, setEdit] = useState<string | null>(null);
  const sortuj = (a: Rec, b: Rec) => (a.kolejnosc ?? 0) - (b.kolejnosc ?? 0) || String(a.nazwa).localeCompare(String(b.nazwa), 'pl');
  const ludzie = useMemo(() => d.people.filter((p) => !p.deletedAt).sort(sortuj), [d.people]);
  const byli = useMemo(() => d.people.filter((p) => p.deletedAt).sort(sortuj), [d.people]);
  if (!ludzie.length && !byli.length) return <Empty icon={UsersThree} title="Brak osób w harmonogramie" hint="Osoby dodaje się w Użytkownikach (kolumny harmonogramu)." />;
  const m = d.dzis.slice(0, 7);
  const o = (p: Rec) => P.osoby.get(p.id);
  const forma = (p: Rec) => (o(p) ? FORMA_LABEL[o(p)!.forma as Forma] : 'Bez danych');
  const wybrana = [...ludzie, ...byli].find((p) => p.id === edit);
  const lista = (osoby: Rec[], label: string) => desk ? (
    <Table aria-label={label}>
      <thead><tr><Th className="w-[12rem]">Osoba</Th><Th className="w-[13rem]">Forma</Th><Th className="w-[13rem]">Umowa</Th><Th num className="w-[8rem]">Brutto</Th><Th num className="w-[8rem]">Stawka / h</Th><Th num className="w-[7rem]">Limit urlopu</Th><Th>Uwagi</Th></tr></thead>
      <tbody>{osoby.map((p) => (
        <Tr key={p.id} onOpen={() => setEdit(p.id)}>
          <Td className="font-semibold"><button type="button" className="text-left hover:text-action" onClick={() => setEdit(p.id)}>{p.nazwa}</button></Td><Td>{forma(p)}</Td><Td className="tabular-nums">{okres(o(p))}</Td>
          <Td num>{kw(o(p)?.bruttoGr)}</Td><Td num>{kw(P.stawka(p.id, m))}</Td><Td num>{o(p) ? lb(o(p)!.urlopDni) : '—'}</Td><Td title={o(p)?.uwagi} className="text-sm text-ink-2">{o(p)?.uwagi}</Td>
        </Tr>))}
      </tbody>
    </Table>
  ) : (
    <ul className="grid gap-3" aria-label={label}>{osoby.map((p) => (
      <li key={p.id}>
        <button type="button" onClick={() => setEdit(p.id)} className="grid min-h-11 w-full gap-0.5 rounded-[4px] border border-line bg-card px-4 py-3 text-left">
          <span className="font-semibold">{p.nazwa}</span>
          <span className="text-sm text-ink-2">{[forma(p), okres(o(p)), P.stawka(p.id, m) ? `${kw(P.stawka(p.id, m))} zł/h` : '', o(p) ? `urlop ${lb(o(p)!.urlopDni)} dni` : ''].filter(Boolean).join(' · ')}</span>
        </button>
      </li>))}
    </ul>
  );
  return (
    <div className="grid gap-4">
      {lista(ludzie, 'Pracownicy')}
      {byli.length > 0 && <section className="grid gap-2" aria-label="Byli pracownicy">
        <SectionTitle>Byli pracownicy</SectionTitle>
        <p className="text-sm text-ink-2">Usunięci z harmonogramu – ich płace nadal liczą się w zestawieniach i można je poprawiać.</p>
        {lista(byli, 'Byli pracownicy')}
      </section>}
      {wybrana && <PracownikForm key={wybrana.id} osoba={wybrana} dane={d} rec={o(wybrana)} onClose={() => setEdit(null)} />}
    </div>
  );
}
