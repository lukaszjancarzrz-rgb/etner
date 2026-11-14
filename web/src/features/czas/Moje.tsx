import { addDays, fmtMinuty, godzinaPl, limitStopu, mondayOf, PRZYPOMNIENIE_MIN, wOknieEdycji, oknoEdycjiOd } from '@etner/shared';
import { Play, Plus, Stop, Swap, Timer as TimerIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { dayLong, dayShort, today, useIsAdmin, useMe } from '../../core/data.js';
import type { Rec } from '../../core/store.js';
import { Empty, Panel } from '../../core/ui/bits.js';
import { Button } from '../../core/ui/button.js';
import { cn } from '../../core/ui/cn.js';
import { useMojaOsoba, useNow, useOpisZlecenia, useWpisy, useZlecaniaDnia } from './dane.js';
import { licznik, minuty, sumaMinut, trwajacy, wgDni } from './model.js';
import StopDialog from './StopDialog.js';
import { Linia, odDo, Uwagi, WyborZlecenia, useWybrane, wybraneId } from './ui.js';
import { WpisForm } from './WpisForm.js';
import { start } from './zapis.js';

/** Licznik pracy (Start / Zmień zlecenie / Stop) i „Moje godziny”. */
export function Moje() {
  const osoba = useMojaOsoba();
  if (!osoba) return <Panel><Empty icon={TimerIcon} title="Nie masz kolumny w harmonogramie – poproś biuro o dodanie." /></Panel>;
  return (
    <div className="grid gap-6">
      <Licznik personId={osoba.id} />
      <Godziny personId={osoba.id} />
    </div>
  );
}

function Licznik({ personId }: { personId: string }) {
  const me = useMe()!;
  const wpisy = useWpisy();
  const r = trwajacy(wpisy, me.id);
  const plan = useZlecaniaDnia(personId);
  const opis = useOpisZlecenia();
  const now = useNow(1000);
  const [w, setW] = useWybrane(plan);
  const [zmiana, setZmiana] = useState(false);
  const [stop, setStop] = useState(false);
  const dzis = today();
  const nowIso = new Date(now).toISOString();
  const mine = wpisy.filter((e) => e.personId === personId);
  const dzisMin = sumaMinut(mine.filter((e) => e.dzien === dzis), nowIso);
  const tydz = sumaMinut(mine.filter((e) => e.dzien >= mondayOf(dzis) && e.dzien <= addDays(mondayOf(dzis), 6)), nowIso);
  const job = wybraneId(w);
  const zacznij = () => { if (job === undefined) return; start(me.id, personId, job, today()); setZmiana(false); };
  const razem = <p className="text-center text-sm text-ink-2">Dziś: {fmtMinuty(dzisMin)} · ten tydzień: {fmtMinuty(tydz)}</p>;

  if (!r) {
    return (
      <div className="grid gap-4">
        <Panel className="grid gap-3 p-4">
          <p className="text-sm text-ink-2">{dayLong(dzis)} · w harmonogramie:</p>
          <WyborZlecenia plan={plan} w={w} onChange={setW} name="zlecenie-start" />
        </Panel>
        <button type="button" onClick={zacznij} disabled={job === undefined} className="flex h-[120px] w-full items-center justify-center gap-3 rounded-[6px] bg-ok text-3xl font-extrabold text-ok-ink transition-[filter] hover:brightness-110 active:brightness-95 disabled:opacity-50">
          <Play className="h-9 w-9" weight="fill" aria-hidden />START
        </button>
        {razem}
      </div>
    );
  }
  const lim = limitStopu(r.od);
  const po11 = Date.parse(lim) === Date.parse(r.od) + 11 * 3_600_000;
  const o = opis(r.jobId);
  return (
    <div className="grid gap-4">
      <Panel className="grid gap-1 border-l-4 border-l-ok p-4 text-center">
        <p className="flex items-center justify-center gap-2 text-sm text-ink-2"><span aria-hidden className="h-2.5 w-2.5 rounded-full bg-ok" />Pracujesz od {godzinaPl(r.od)}</p>
        <p className="text-5xl font-extrabold tabular-nums" role="timer" aria-label="Czas pracy">{licznik(r.od, now)}</p>
        <p className="font-semibold">{o.klient}</p>
        {o.opis && <p className="text-sm text-ink-2">{o.opis}</p>}
      </Panel>
      {zmiana ? (
        <Panel className="grid gap-3 p-4">
          <p className="text-sm text-ink-2">Przełącz na zlecenie (obecny wpis zostanie zakończony):</p>
          <WyborZlecenia plan={plan} w={w} onChange={setW} name="zlecenie-zmiana" />
          <div className="grid grid-cols-2 gap-3"><Button variant="secondary" onClick={() => setZmiana(false)}>Wróć</Button><Button onClick={zacznij} disabled={job === undefined}>Przełącz</Button></div>
        </Panel>
      ) : <Button variant="secondary" onClick={() => setZmiana(true)}><Swap className="h-5 w-5" aria-hidden />Zmień zlecenie</Button>}
      <button type="button" onClick={() => setStop(true)} className="flex h-[120px] w-full items-center justify-center gap-3 rounded-[6px] bg-danger text-3xl font-extrabold text-danger-ink transition-[filter] hover:brightness-110 active:brightness-95">
        <Stop className="h-9 w-9" weight="fill" aria-hidden />STOP
      </button>
      <p className="text-center text-sm text-ink-2">Zatrzyma się sam o {godzinaPl(lim)} ({po11 ? '11 h od startu' : 'limit 20:00'}) – przypomnienie o {godzinaPl(new Date(Date.parse(lim) - PRZYPOMNIENIE_MIN * 60_000).toISOString())}</p>
      {razem}
      {stop && <StopDialog entry={r} onClose={() => setStop(false)} />}
    </div>
  );
}

/** „Moje godziny”: tydzień razem, dni od najnowszego (bieżący i poprzedni tydzień; starsze tylko do odczytu). */
export function Godziny({ personId }: { personId: string }) {
  const me = useMe()!;
  const admin = useIsAdmin();
  const opis = useOpisZlecenia();
  const nowIso = new Date(useNow(30_000)).toISOString();
  const [dodaj, setDodaj] = useState(false);
  const [edit, setEdit] = useState<Rec | null>(null);
  const [starsze, setStarsze] = useState(false);
  const dzis = today();
  const mine = useWpisy().filter((e) => e.personId === personId);
  const dni = wgDni(mine, nowIso);
  const od = oknoEdycjiOd(dzis);
  const widoczne = dni.filter((d) => starsze || d.dzien >= od);
  const tydz = sumaMinut(mine.filter((e) => e.dzien >= mondayOf(dzis)), nowIso);
  const mozna = (e: Rec) => !e._tmp && (admin || (e.userId === me.id && wOknieEdycji(e.dzien, dzis)));
  return (
    <section aria-label="Moje godziny" className="grid gap-3">
      <div className="flex items-baseline justify-between"><h2 className="text-lg font-bold">Moje godziny</h2><p className="font-semibold tabular-nums">Ten tydzień: {fmtMinuty(tydz)}</p></div>
      {!widoczne.length && <Panel><Empty icon={TimerIcon} title="Brak wpisów" hint="Wpisy pojawią się po pierwszym Start / Stop." /></Panel>}
      {widoczne.map((d) => (
        <div key={d.dzien} className="grid gap-1.5">
          <div className="flex items-baseline justify-between px-1 font-cond text-sm font-semibold uppercase text-ink-2"><span>{dayShort(d.dzien)}</span><span className="tabular-nums">{fmtMinuty(d.minuty)}</span></div>
          <Panel className="divide-y divide-rule overflow-hidden">
            {d.wpisy.map((e) => {
              const Wrap = mozna(e) ? 'button' : 'div';
              return (
                <Wrap key={e.id} {...(Wrap === 'button' && { type: 'button' as const, onClick: () => setEdit(e) })} className={cn('flex w-full items-start justify-between gap-3 px-3 py-3 text-left', Wrap === 'button' && 'hover:bg-ink/4')}>
                  <div className="min-w-0">
                    <Linia o={opis(e.jobId)} extra={e._tmp ? 'zapisywanie…' : undefined} />
                    <p className="mt-0.5 pl-4 text-sm tabular-nums text-ink-2">{odDo(e)}</p>
                    <div className="pl-4"><Uwagi e={e} /></div>
                  </div>
                  <span className="shrink-0 font-semibold tabular-nums">{e.do ? fmtMinuty(minuty(e, nowIso)) : 'trwa'}</span>
                </Wrap>
              );
            })}
          </Panel>
        </div>
      ))}
      {!starsze && dni.some((d) => d.dzien < od) && <Button variant="ghost" onClick={() => setStarsze(true)}>Pokaż starsze</Button>}
      <Button variant="secondary" onClick={() => setDodaj(true)}><Plus className="h-5 w-5" aria-hidden />Dodaj wpis ręcznie</Button>
      <p className="text-sm text-ink-2">Poprawiać możesz wpisy z tego i poprzedniego tygodnia. Starsze – biuro.</p>
      {dodaj && <WpisForm personId={personId} admin={admin} onClose={() => setDodaj(false)} />}
      {edit && <WpisForm entry={edit} admin={admin} onClose={() => setEdit(null)} />}
    </section>
  );
}
