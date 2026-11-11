import { fmtZl } from '@etner/shared';
import { Coins, Plus, Trash } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { fmtDay, matches, today, useDict } from '../../core/data.js';
import { useDesk } from '../../core/layout/status.js';
import { TitleCount } from '../../core/layout/TopBar.js';
import { outbox } from '../../core/outbox.js';
import { useEntities, type Rec } from '../../core/store.js';
import { Empty } from '../../core/ui/bits.js';
import { Button } from '../../core/ui/button.js';
import { cn } from '../../core/ui/cn.js';
import { Input } from '../../core/ui/input.js';
import { Select } from '../../core/ui/select.js';
import { Table, Td, Th, Tr, useSort } from '../../core/ui/table.js';
import { toast } from '../../core/ui/toast.js';
import { createVia } from '../../core/write.js';
import { parseZl } from '../leady/model.js';
import { sumaMiesiaca, wOkresie } from './model.js';
import type { Filtry } from './Przychody.js';

const fail = (t: string) => (e: Error) => toast(t, { body: e.message, tone: 'error' });

/** Dwustopniowe usuwanie jak w reszcie aplikacji: pierwszy klik pyta, drugi usuwa. */
function Usun({ c }: { c: Rec }) {
  const [sure, setSure] = useState(false);
  return (
    <Button variant={sure ? 'danger' : 'ghost'} size="sm" aria-label={sure ? 'Na pewno usunąć koszt?' : `Usuń koszt: ${c.opis || c.kontrahent}`} disabled={!!c._tmp}
      className={cn('min-h-11 min-w-11 desk:min-h-0 desk:min-w-0', !sure && 'w-11 px-0 text-danger desk:w-9')}
      onClick={() => sure
        ? void outbox.enqueue({ kind: 'koszt', url: `/api/costs/${c.id}`, method: 'DELETE', optimistic: (s) => s.remove('costs', c.id) }).catch(fail('Nie usunięto kosztu'))
        : setSure(true)}>
      {sure ? 'Na pewno?' : <Trash className="h-5 w-5" />}
    </Button>
  );
}

/** Koszty okresu (z importu KPiR i dodane ręcznie): szybkie dodawanie u góry, tabela albo karty, suma. */
export function Koszty({ q, okres, filtr }: Filtry) {
  const desk = useDesk();
  const kategorie = useDict('kategoria_kosztu');
  const costs = useEntities('costs');
  const [opis, setOpis] = useState('');
  const [kwota, setKwota] = useState('');
  const [kat, setKat] = useState('');
  const [err, setErr] = useState('');

  const list = useMemo(() => costs
    .filter((c) => !c.deletedAt && wOkresie(c, okres) && (!filtr || c.kategoria === filtr) && (!q || matches(q, c.opis, c.kontrahent, c.nrDokumentu, c.kategoria)))
    .sort((a, b) => String(b.dzien).localeCompare(String(a.dzien))), [costs, okres, filtr, q]);
  const { rows, by } = useSort(list, {
    dzien: (c) => c.dzien, nr: (c) => c.nrDokumentu, kontr: (c) => c.kontrahent, opis: (c) => c.opis, kat: (c) => c.kategoria, netto: (c) => c.nettoGr, kol: (c) => c.kolumnaKpir, wynik: (c) => Number(c.doWyniku),
  });

  function add(e: React.FormEvent) {
    e.preventDefault();
    const k = parseZl(kwota);
    if (!opis.trim()) return setErr('Wpisz opis kosztu');
    if ('error' in k) return setErr(k.error);
    const kategoria = kat || kategorie[0]?.wartosc;
    if (!kategoria) return setErr('Wybierz kategorię');
    const dzien = today();
    const body = { dzien, miesiac: dzien.slice(0, 7), nrDokumentu: '', kontrahent: '', nip: '', opis: opis.trim(), kategoria, nettoGr: k.gr, kolumnaKpir: 15, doWyniku: true, uwagi: '' };
    void createVia('costs', { kind: 'koszt', url: '/api/costs', method: 'POST', body }, body).catch(fail('Koszt nie został zapisany'));
    setOpis(''); setKwota(''); setErr('');
  }
  const wynik = (c: Rec) => (c.doWyniku ? 'tak' : 'nie');

  return (
    <div className="grid gap-4">
      <TitleCount n={list.length} />
      <form onSubmit={add} noValidate className="grid gap-2 min-[700px]:grid-cols-[minmax(0,1fr)_9rem_14rem_auto]">
        <Input aria-label="Opis kosztu" placeholder="Opis kosztu" value={opis} onChange={(e) => setOpis(e.target.value)} aria-invalid={!!err} />
        <Input aria-label="Kwota netto (zł)" inputMode="decimal" placeholder="Netto zł" value={kwota} onChange={(e) => setKwota(e.target.value)} />
        <Select aria-label="Kategoria kosztu" value={kat || kategorie[0]?.wartosc} onValueChange={setKat} options={kategorie.map((x) => ({ value: x.wartosc as string, label: x.wartosc as string }))} placeholder="Kategoria" />
        <Button type="submit"><Plus className="h-5 w-5" weight="bold" />Koszt</Button>
        {err && <p role="alert" className="text-sm font-semibold text-danger min-[700px]:col-span-4">{err}</p>}
      </form>
      {!rows.length ? <Empty icon={Coins} title="Brak kosztów w tym okresie" hint="Dodaj koszt powyżej albo zaimportuj miesiąc z KPiR." /> : desk ? (
        <Table aria-label="Koszty">
          <thead><tr>
            <Th sort={by('dzien')} className="w-[7.5rem]">Data</Th><Th sort={by('nr')} className="w-[9rem]">Nr dok.</Th><Th sort={by('kontr')} className="w-[12rem]">Kontrahent</Th><Th sort={by('opis')}>Opis</Th>
            <Th sort={by('kat')} className="w-[11rem]">Kategoria</Th><Th sort={by('netto')} num className="w-[7.5rem]">Netto</Th><Th sort={by('kol')} num className="w-[5.5rem]">Kol. KPiR</Th>
            <Th sort={by('wynik')} className="w-[6.5rem]">Do wyniku</Th><Th className="w-12"><span className="sr-only">Usuń</span></Th>
          </tr></thead>
          <tbody>{rows.map((c) => (
            <Tr key={c.id}>
              <Td>{fmtDay(c.dzien)}</Td><Td title={c.nrDokumentu}>{c.nrDokumentu}</Td><Td title={c.kontrahent}>{c.kontrahent}</Td><Td title={c.opis}>{c.opis}</Td><Td className="text-sm text-ink-2">{c.kategoria}</Td>
              <Td num className="font-semibold">{fmtZl(c.nettoGr)}</Td><Td num>{c.kolumnaKpir}</Td><Td className={cn(!c.doWyniku && 'text-ink-2')}>{wynik(c)}</Td>
              <Td pad="p-0" className="text-center"><Usun c={c} /></Td>
            </Tr>))}
          </tbody>
        </Table>
      ) : (
        <ul className="grid gap-3">{rows.map((c) => (
          <li key={c.id} className="flex items-start justify-between gap-3 rounded-[4px] border border-line bg-card px-4 py-3">
            <div className="min-w-0">
              <span className="block font-semibold leading-snug">{c.opis || c.kontrahent}</span>
              <span className="block text-sm text-ink-2">{[fmtDay(c.dzien), c.kontrahent, c.kategoria, `kol. ${c.kolumnaKpir}`, c.doWyniku ? '' : 'poza wynikiem'].filter(Boolean).join(' · ')}</span>
            </div>
            <div className="flex shrink-0 items-center gap-1"><span className="font-extrabold tabular-nums">{fmtZl(c.nettoGr)}</span><Usun c={c} /></div>
          </li>))}
        </ul>
      )}
      <div className="text-right tabular-nums">
        <p className="text-lg font-extrabold">Razem netto: {fmtZl(sumaMiesiaca(list, okres))}</p>
        {list.some((c) => !c.doWyniku) && <p className="text-sm text-ink-2">w tym do wyniku: {fmtZl(sumaMiesiaca(list.filter((c) => c.doWyniku), okres))}</p>}
      </div>
    </div>
  );
}
