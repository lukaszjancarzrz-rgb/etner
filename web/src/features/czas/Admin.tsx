import { addDays, fmtMinuty, godzinaPl } from '@etner/shared';
import { CaretLeft, CaretRight, Plus } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { dayShort, today } from '../../core/data.js';
import { useDesk } from '../../core/layout/status.js';
import { useEntities, type Rec } from '../../core/store.js';
import { Empty, Panel, Segmented } from '../../core/ui/bits.js';
import { Button } from '../../core/ui/button.js';
import { Combobox } from '../../core/ui/combobox.js';
import { Select } from '../../core/ui/select.js';
import { Table, Td, Th, Tr } from '../../core/ui/table.js';
import { useMojaOsoba, useNow, useOpisZlecenia, useWpisy } from './dane.js';
import { dm, filtruj, minuty, poprawione, roznica, sumyDni, sumyMiesiac, tydzien, tydzienTekst, wTygodniu, wgDni, type Rodzaj } from './model.js';
import { odDo, Uwagi, useWybor } from './ui.js';
import { WpisForm } from './WpisForm.js';

type Tab = 'teraz' | 'wpisy' | 'sumy' | 'moj';

/** Czasomierz u admina: Teraz / Wpisy / Sumy (+ Mój czas, gdy admin ma kolumnę w harmonogramie). */
export function Admin({ moj }: { moj: React.ReactNode }) {
  const desk = useDesk();
  const osoba = useMojaOsoba();
  const [tab, setTab] = useState<Tab>('teraz');
  const TABS: { v: Tab; label: string }[] = [{ v: 'teraz', label: 'Teraz' }, { v: 'wpisy', label: 'Wpisy' }, { v: 'sumy', label: 'Sumy' }, ...(osoba ? [{ v: 'moj' as Tab, label: 'Mój czas' }] : [])];
  return (
    <section aria-label="Czasomierz" className="mx-auto grid max-w-[1400px] grid-cols-[minmax(0,1fr)] gap-4 px-4 py-4 desk:px-8 desk:py-5">
      {desk ? <Segmented label="Widok" value={tab} onChange={setTab} options={TABS} className="max-w-xl" />
        : <Select aria-label="Widok" value={tab} onValueChange={(v) => setTab(v as Tab)} options={TABS.map((o) => ({ value: o.v, label: o.label }))} />}
      {tab === 'teraz' ? <Teraz /> : tab === 'wpisy' ? <Wpisy /> : tab === 'sumy' ? <Sumy /> : <div className="mx-auto w-full max-w-2xl">{moj}</div>}
    </section>
  );
}

const Strzalki = ({ label, onPrev, onNext }: { label: string; onPrev: () => void; onNext: () => void }) => (
  <div className="flex h-12 items-center rounded-[4px] border border-field bg-card">
    <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Poprzedni" onClick={onPrev}><CaretLeft className="h-5 w-5" /></Button>
    <span className="min-w-36 px-1 text-center font-semibold tabular-nums">{label}</span>
    <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Następny" onClick={onNext}><CaretRight className="h-5 w-5" /></Button>
  </div>
);

function Teraz() {
  const wpisy = useWpisy();
  const people = useEntities('schedule_people');
  const sched = useEntities('schedule_entries');
  const opis = useOpisZlecenia();
  const now = useNow(1000);
  const dzis = today();
  const trwajace = wpisy.filter((e) => !e.do);
  const nazwa = (id: string) => people.find((p) => p.id === id)?.nazwa ?? 'Osoba';
  const planowani = people.filter((p) => p.userId && !wpisy.some((e) => e.personId === p.id && e.dzien === dzis)
    && sched.some((s) => s.personId === p.id && s.dzien === dzis && s.rodzaj === 'zlecenie' && s.jobId));
  if (!trwajace.length && !planowani.length) return <Panel><Empty icon={Plus} title="Nikt nie pracuje" hint="Brak trwających liczników i brak osób do rozpoczęcia w dzisiejszym harmonogramie." /></Panel>;
  return (
    <div className="grid gap-3">
      <h2 className="text-lg font-bold">Teraz pracują</h2>
      <ul className="grid gap-3 sm:grid-cols-2 desk:grid-cols-3">
        {trwajace.map((e) => { const o = opis(e.jobId); return (
          <li key={e.id}><Panel className="h-full border-l-4 border-l-ok p-4">
            <p className="font-bold">{nazwa(e.personId)}</p>
            <p className="truncate text-sm text-ink-2">{o.numer} {o.klient} · od {godzinaPl(e.od)}</p>
            <p className="mt-1 text-2xl font-extrabold tabular-nums">{fmtMinuty(minuty(e, new Date(now)))}</p>
          </Panel></li>); })}
        {planowani.map((p) => {
          const j = sched.find((s) => s.personId === p.id && s.dzien === dzis && s.rodzaj === 'zlecenie' && s.jobId);
          return <li key={p.id}><Panel className="h-full border-l-4 border-l-line p-4"><p className="font-bold">{p.nazwa}</p><p className="text-sm text-ink-2">nie rozpoczął dziś (w harmonogramie: {opis(j?.jobId).klient})</p></Panel></li>;
        })}
      </ul>
    </div>
  );
}

const RODZAJE: { value: Rodzaj; label: string }[] = [{ value: 'wszystkie', label: 'Wszystkie wpisy' }, { value: 'poprawione', label: 'Tylko poprawione' }, { value: 'auto', label: 'Tylko automatyczne' }, { value: 'reczne', label: 'Tylko ręczne' }];

function Wpisy() {
  const desk = useDesk();
  const wpisy = useWpisy();
  const people = useEntities('schedule_people');
  const opis = useOpisZlecenia();
  const opcje = useWybor();
  const nowIso = new Date(useNow(30_000)).toISOString();
  const [dzien, setDzien] = useState(today());
  const [osoba, setOsoba] = useState('');
  const [zl, setZl] = useState('');
  const [rodzaj, setRodzaj] = useState<Rodzaj>('wszystkie');
  const [edit, setEdit] = useState<Rec | null>(null);
  const [dodaj, setDodaj] = useState(false);
  const nazwa = (id: string) => people.find((p) => p.id === id)?.nazwa ?? 'Osoba';
  const rows = useMemo(() => wgDni(filtruj(wTygodniu(wpisy, dzien), { personId: osoba, jobId: zl, rodzaj }), nowIso).flatMap((d) => d.wpisy), [wpisy, dzien, osoba, zl, rodzaj, nowIso]);
  const ALL = '__all';
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-44"><Select aria-label="Osoba" value={osoba || ALL} onValueChange={(v) => setOsoba(v === ALL ? '' : v)} options={[{ value: ALL, label: 'Wszyscy' }, ...people.map((p) => ({ value: p.id, label: p.nazwa }))]} /></div>
        <div className="w-60"><Combobox value={zl || ALL} onValueChange={(v) => setZl(v === ALL ? '' : v)} options={[{ value: ALL, label: 'Wszystkie zlecenia' }, { value: 'none', label: 'Bez zlecenia' }, ...opcje]} search="Numer, klient, miejscowość" /></div>
        <Strzalki label={tydzienTekst(dzien)} onPrev={() => setDzien(addDays(dzien, -7))} onNext={() => setDzien(addDays(dzien, 7))} />
        <div className="w-52"><Select aria-label="Rodzaj wpisów" value={rodzaj} onValueChange={(v) => setRodzaj(v as Rodzaj)} options={RODZAJE} /></div>
        <Button variant="secondary" onClick={() => setDodaj(true)}><Plus className="h-5 w-5" aria-hidden />Dodaj wpis</Button>
      </div>
      {!rows.length ? <Panel><Empty icon={Plus} title="Brak wpisów" hint="W tym tygodniu, dla tych filtrów." /></Panel> : desk ? (
        <Table aria-label="Wpisy czasu">
          <colgroup><col className="w-[9%]" /><col className="w-[10%]" /><col className="w-[22%]" /><col className="w-[19%]" /><col className="w-[9%]" /><col /></colgroup>
          <thead><tr><Th>Dzień</Th><Th>Osoba</Th><Th>Zlecenie</Th><Th>Od – do</Th><Th num>Czas</Th><Th>Uwagi</Th></tr></thead>
          <tbody>
            {rows.map((e) => { const o = opis(e.jobId), r = roznica(e); return (
              <Tr key={e.id} onOpen={() => setEdit(e)}>
                <Td className="align-top">{dayShort(e.dzien)}</Td>
                <Td className="align-top font-semibold">{nazwa(e.personId)}</Td>
                <Td className="align-top">{o.numer ? `${o.numer} ${o.klient}` : o.klient}</Td>
                <Td className="align-top"><div className="whitespace-normal">{odDo(e)}{poprawione(e) && <div className="text-xs text-ink-2 line-through">{godzinaPl(e.odCz)} – {godzinaPl(e.doCz)}</div>}</div></Td>
                <Td num className="align-top font-semibold">{e.do ? fmtMinuty(minuty(e, nowIso)) : 'trwa'}{r !== 0 && <div className="text-xs font-normal text-ink-2">{r > 0 ? '+' : '−'}{Math.abs(r)} min</div>}</Td>
                <Td className="align-top"><div className="whitespace-normal"><Uwagi e={e} admin /></div></Td>
              </Tr>); })}
          </tbody>
        </Table>
      ) : (
        <ul className="grid gap-2">
          {rows.map((e) => { const o = opis(e.jobId), r = roznica(e); return (
            <li key={e.id}><Panel><button type="button" onClick={() => setEdit(e)} className="grid w-full gap-0.5 px-3 py-3 text-left">
              <span className="flex items-baseline justify-between gap-3"><span className="font-bold">{nazwa(e.personId)} <span className="text-sm font-normal text-ink-2">{dayShort(e.dzien)}</span></span><span className="font-semibold tabular-nums">{e.do ? fmtMinuty(minuty(e, nowIso)) : 'trwa'}</span></span>
              <span className="truncate text-sm text-ink-2">{o.numer ? `${o.numer} ${o.klient}` : o.klient}</span>
              <span className="text-sm tabular-nums">{odDo(e)}{poprawione(e) && <span className="ml-2 text-xs text-ink-2 line-through">{godzinaPl(e.odCz)} – {godzinaPl(e.doCz)}</span>}{r !== 0 && <span className="ml-2 text-xs text-ink-2">{r > 0 ? '+' : '−'}{Math.abs(r)} min</span>}</span>
              <Uwagi e={e} admin />
            </button></Panel></li>); })}
        </ul>
      )}
      {edit && <WpisForm entry={edit} admin onClose={() => setEdit(null)} />}
      {dodaj && <WpisForm admin onClose={() => setDodaj(false)} />}
    </div>
  );
}

const MIES = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
const shiftMies = (ym: string, d: number) => { const t = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + d, 1)); return t.toISOString().slice(0, 7); };

function Sumy() {
  const wpisy = useWpisy();
  const people = useEntities('schedule_people');
  const nowIso = new Date(useNow(60_000)).toISOString();
  const [tryb, setTryb] = useState<'tydzien' | 'miesiac'>('tydzien');
  const [dzien, setDzien] = useState(today());
  const [ym, setYm] = useState(today().slice(0, 7));
  const dni = tydzien(dzien);
  const ludzie = [...people].sort((a, b) => a.kolejnosc - b.kolejnosc || a.nazwa.localeCompare(b.nazwa, 'pl'));
  const tyg = useMemo(() => sumyDni(wpisy, dni, nowIso), [wpisy, dzien, nowIso]); // eslint-disable-line react-hooks/exhaustive-deps
  const mies = useMemo(() => sumyMiesiac(wpisy, ym, nowIso), [wpisy, ym, nowIso]);
  const f = (m: number) => (m ? fmtMinuty(m) : '–');
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented label="Zakres" value={tryb} onChange={setTryb} options={[{ v: 'tydzien', label: 'Tydzień' }, { v: 'miesiac', label: 'Miesiąc' }]} className="w-56" />
        {tryb === 'tydzien' ? <Strzalki label={tydzienTekst(dzien)} onPrev={() => setDzien(addDays(dzien, -7))} onNext={() => setDzien(addDays(dzien, 7))} />
          : <Strzalki label={`${MIES[Number(ym.slice(5)) - 1]} ${ym.slice(0, 4)}`} onPrev={() => setYm(shiftMies(ym, -1))} onNext={() => setYm(shiftMies(ym, 1))} />}
      </div>
      <div className="overflow-x-auto">
        {tryb === 'tydzien' ? (
          <Table aria-label="Sumy tygodnia" className="min-w-[44rem]">
            <thead><tr><Th>Osoba</Th>{dni.map((d) => <Th key={d} num>{dayShort(d).replace(/ \d.*/, '')} {dm(d)}</Th>)}<Th num>Razem</Th></tr></thead>
            <tbody>{ludzie.map((p) => { const r = tyg.get(p.id); return (
              <Tr key={p.id}><Td className="font-semibold">{p.nazwa}</Td>{dni.map((d, i) => <Td key={d} num>{f(r?.dni[i] ?? 0)}</Td>)}<Td num className="font-bold">{f(r?.razem ?? 0)}</Td></Tr>); })}</tbody>
          </Table>
        ) : (
          <Table aria-label="Sumy miesiąca" className="min-w-[24rem]">
            <thead><tr><Th>Osoba</Th><Th num>Dni z wpisami</Th><Th num>Razem</Th></tr></thead>
            <tbody>{ludzie.map((p) => { const r = mies.get(p.id); return (
              <Tr key={p.id}><Td className="font-semibold">{p.nazwa}</Td><Td num>{r?.dni ?? '–'}</Td><Td num className="font-bold">{f(r?.razem ?? 0)}</Td></Tr>); })}</tbody>
          </Table>
        )}
      </div>
    </div>
  );
}

