import { useState } from 'react';
import { godzinaPl } from '@etner/shared';
import { useNames, useStatusGroup } from '../../core/data.js';
import type { Rec } from '../../core/store.js';
import { Badge } from '../../core/ui/bits.js';
import { Combobox } from '../../core/ui/combobox.js';
import { cn } from '../../core/ui/cn.js';
import { useJobs } from '../zlecenia/jobs.js';
import { useOpisZlecenia, type Opis } from './dane.js';
import { czasomierzTekst, doSprawdzenia, kiedy, poprawione, reczny } from './model.js';

/** Pasek w kolorze zlecenia + klient (pogrubiony) i opis pod spodem. */
export function Linia({ o, extra, className }: { o: Opis; extra?: string; className?: string }) {
  return (
    <div className={cn('flex min-w-0 gap-3', className)}>
      <span aria-hidden className="w-1 shrink-0 self-stretch rounded-full" style={{ background: o.kolor ?? 'var(--line)' }} />
      <div className="min-w-0">
        <p className="truncate font-semibold">{o.klient}{extra && <span className="ml-1.5 text-sm font-normal text-ink-2">{extra}</span>}</p>
        {o.opis && <p className="truncate text-sm text-ink-2">{o.opis}</p>}
      </div>
    </div>
  );
}

const AMBER = 'bg-[#f6d98a] text-[#3d2a00]';
/** Etykiety wpisu: poprawione, ręczny, zatrzymany automatycznie (+ czasomierz pod spodem). `admin`: kto i kiedy poprawił. */
export function Uwagi({ e, admin }: { e: Rec; admin?: boolean }) {
  const names = useNames();
  const kto = admin && e.edytowalAt && (poprawione(e) || reczny(e) || e.komentarz) && `${names(e.edytowal)}, ${kiedy(e.edytowalAt)}${e.komentarz ? ` · „${e.komentarz}”` : ''}`;
  const auto = doSprawdzenia(e);
  if (!poprawione(e) && !reczny(e) && !auto && !kto) return null;
  return (
    <div className="mt-0.5 grid gap-0.5 text-xs text-ink-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {poprawione(e) && <Badge tone="action">poprawione</Badge>}
        {reczny(e) && <Badge tone="action">wpis ręczny</Badge>}
        {auto && <Badge className={AMBER}>zatrzymany automatycznie</Badge>}
      </div>
      {poprawione(e) && !admin && <span>{czasomierzTekst(e)}</span>}
      {auto && <span>Sprawdź godzinę zakończenia</span>}
      {kto && <span>{kto}</span>}
      {!admin && !kto && e.komentarz && <span>„{e.komentarz}”</span>}
    </div>
  );
}

export const odDo = (e: Rec) => `${godzinaPl(e.od)} – ${e.do ? godzinaPl(e.do) : 'trwa'}`;

/** Zlecenia do wyboru (bez zamkniętych; `keep` = zlecenie edytowanego wpisu zawsze na liście). */
export function useWybor(keep?: string | null) {
  const jobs = useJobs();
  const grupa = useStatusGroup();
  return [...jobs.values()].filter((j) => !j.deletedAt && (j.id === keep || grupa(j.status) !== 'zamkniete'))
    .sort((a, b) => String(b.numer).localeCompare(String(a.numer), 'pl', { numeric: true }))
    .map((j) => ({ value: j.id as string, label: `${j.numer} ${j.client?.nazwa ?? ''}${j.site?.miejscowosc ? ` · ${j.site.miejscowosc}` : ''}`.trim() }));
}

export type Wybrane = { sel: string; inne: string };
/** Zlecenie z wyboru (`null` = bez zlecenia, `undefined` = „Inne” bez wybranego). */
export const wybraneId = (w: Wybrane): string | null | undefined => (w.sel === 'none' ? null : w.sel === 'inne' ? w.inne || undefined : w.sel);

/** Wybór zlecenia: dzisiejsze z harmonogramu, „Bez zlecenia”, „Inne zlecenie…”. */
export function WyborZlecenia({ plan, w, onChange, name }: { plan: { jobId: string; polDnia: boolean }[]; w: Wybrane; onChange: (w: Wybrane) => void; name: string }) {
  const opis = useOpisZlecenia();
  const opcje = useWybor();
  // zwykła funkcja (nie komponent): licznik odświeża ekran co sekundę – komponent zdefiniowany tutaj montowałby radia od nowa (utrata fokusu)
  const opt = (v: string, children: React.ReactNode) => (
    <label key={v} className={cn('flex min-h-14 cursor-pointer items-center gap-3 rounded-[4px] border px-3 py-2', w.sel === v ? 'border-action bg-action/8' : 'border-line')}>
      <input type="radio" name={name} checked={w.sel === v} onChange={() => onChange({ ...w, sel: v })} className="h-5 w-5 shrink-0 accent-[var(--action)]" />
      <div className="min-w-0 flex-1">{children}</div>
    </label>
  );
  return (
    <div className="grid gap-2">
      {plan.map((p) => opt(p.jobId, <Linia o={opis(p.jobId)} extra={p.polDnia ? '½ dnia' : undefined} />))}
      {opt('none', <><p className="font-semibold">Bez zlecenia</p><p className="text-sm text-ink-2">magazyn, dojazd, inne</p></>)}
      {opt('inne', <p className="font-semibold">Inne zlecenie…</p>)}
      {w.sel === 'inne' && <Combobox value={w.inne} onValueChange={(v) => onChange({ ...w, inne: v })} options={opcje} placeholder="Wybierz zlecenie" search="Numer, klient, miejscowość" empty="Nie ma takiego zlecenia." />}
    </div>
  );
}

/** Stan wyboru: pierwsze zlecenie z harmonogramu, inaczej „Bez zlecenia”. */
export const useWybrane = (plan: { jobId: string }[]) => {
  const [w, set] = useState<Wybrane | null>(null);
  return [w ?? { sel: plan[0]?.jobId ?? 'none', inne: '' }, set] as const;
};
