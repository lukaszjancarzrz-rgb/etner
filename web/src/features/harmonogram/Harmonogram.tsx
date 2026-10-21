import { addDays, isWorkday, mondayOf, plHolidays } from '@etner/shared';
import { CaretLeft, CaretRight, MapPin, NavigationArrow, Phone, Briefcase, CalendarBlank, NotePencil } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { dayLong, dayShort, mapsUrl, telHref, today, useCrewColor, useDict, useIsAdmin, useLoading, useMe } from '../../core/data.js';
import { useDesk } from '../../core/layout/status.js';
import { useEntities, type Rec } from '../../core/store.js';
import { Badge, Empty } from '../../core/ui/bits.js';
import { Button } from '../../core/ui/button.js';
import { cn } from '../../core/ui/cn.js';
import { Skeleton } from '../../core/ui/skeleton.js';
import type { Route } from '../../routes.js';
import { useJobs, type JobView } from '../zlecenia/jobs.js';
import { CellEditor } from './CellEditor.js';
import { DraftBar } from './Drafts.js';
import { cellKey, cellsOf, cellText, type Slot } from './model.js';

export type Ctx = {
  jobs: Map<string, JobView>;
  codes: Map<string, string | undefined>;
  crew: (e: string | null | undefined) => string | undefined;
};

const validDay = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);

export function Harmonogram({ route }: { route: Route }) {
  const me = useMe();
  const admin = useIsAdmin();
  const desk = useDesk();
  const loading = useLoading();
  const t = today();
  const monday = mondayOf(validDay(route.param) ?? t);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [monday]);

  const people = useEntities('schedule_people');
  const entries = useEntities('schedule_entries');
  const notes = useEntities('schedule_notes');
  const drafts = useEntities('schedule_drafts');
  const users = useEntities('users');
  const off = useDict('dzien_wolny');
  const codesDict = useDict('kod_nieobecnosci');
  const jobs = useJobs();
  const crew = useCrewColor();

  const ctx: Ctx = useMemo(() => ({ jobs, codes: new Map(codesDict.map((d) => [d.wartosc, d.kolor ?? undefined])), crew }), [jobs, codesDict, crew]);
  const sorted = useMemo(() => [...people].sort((a, b) => a.kolejnosc - b.kolejnosc || a.nazwa.localeCompare(b.nazwa, 'pl')), [people]);
  const cells = useMemo(() => cellsOf(entries.filter((e) => e.dzien >= days[0]! && e.dzien <= days[6]!)), [entries, days]);
  const draftMap = useMemo(() => new Map(admin ? drafts.map((d) => [cellKey(d.dzien, d.personId), d]) : []), [drafts, admin]);
  const noteOf = useMemo(() => new Map(notes.map((n) => [n.dzien, n.tekst as string])), [notes]);
  const ekipaOf = useMemo(() => new Map(users.map((u) => [u.id, u.ekipa as string | null])), [users]);
  const mine = sorted.find((p) => p.userId === me?.id);
  const extra = off.map((d) => d.wartosc as string);
  const dayInfo = (d: string) => ({ wd: isWorkday(d, extra), info: plHolidays(Number(d.slice(0, 4)))[d] ?? (extra.includes(d) ? 'Dzień wolny' : undefined) });

  const [edit, setEdit] = useState<{ dzien: string; person: Rec } | null>(null);
  const open = admin ? (dzien: string, person: Rec) => setEdit({ dzien, person }) : undefined;

  if (loading) return <HarmSkeleton />;
  const props = { days, people: sorted, cells, draftMap, noteOf, mine, ctx, open, dayInfo, ekipaOf, today: t };

  return (
    <section className="mx-auto grid max-w-[1400px] gap-4 px-4 py-4 desk:px-8 desk:py-6">
      {mine && <WhereNext person={mine} entries={entries} ctx={ctx} />}
      <WeekNav monday={monday} today={t} />
      {admin && <DraftBar drafts={drafts} people={sorted} entries={entries} ctx={ctx} />}
      {!sorted.length ? (
        <Empty icon={CalendarBlank} title="Harmonogram nie ma jeszcze osób" hint="Administrator dodaje osoby (kolumny) w ustawieniach użytkowników." />
      ) : desk ? <WeekTable {...props} /> : <DayCards {...props} />}
      {edit && <CellEditor dzien={edit.dzien} person={edit.person} current={cells.get(cellKey(edit.dzien, edit.person.id)) ?? []}
        draft={draftMap.get(cellKey(edit.dzien, edit.person.id))} ekipa={ekipaOf.get(edit.person.userId) ?? null} ctx={ctx} onClose={() => setEdit(null)} />}
    </section>
  );
}

type ViewProps = {
  days: string[]; people: Rec[]; cells: Map<string, Slot[]>; draftMap: Map<string, Rec>; noteOf: Map<string, string>;
  mine?: Rec; ctx: Ctx; open?: (dzien: string, person: Rec) => void; dayInfo: (d: string) => { wd: 0 | 1 | 2; info?: string };
  ekipaOf: Map<string, string | null>; today: string;
};

function HarmSkeleton() {
  return (
    <div className="mx-auto grid max-w-[1400px] gap-4 px-4 py-4 desk:px-8" aria-busy="true" aria-label="Wczytywanie harmonogramu">
      <Skeleton className="h-32" />
      <Skeleton className="h-12 w-72" />
      {[0, 1, 2].map((i) => <Skeleton key={i} className="h-48" />)}
    </div>
  );
}

function WeekNav({ monday, today: t }: { monday: string; today: string }) {
  const sun = addDays(monday, 6);
  const isNow = mondayOf(t) === monday;
  const range = `${Number(monday.slice(8))}.${monday.slice(5, 7)}-${Number(sun.slice(8))}.${sun.slice(5, 7)}.${sun.slice(0, 4)}`;
  return (
    <div className="flex items-center gap-2">
      <a href={`#harm/${addDays(monday, -7)}`} aria-label="Poprzedni tydzień" className="grid h-12 w-12 place-items-center rounded-full border border-line bg-card hover:border-ink-2"><CaretLeft className="h-5 w-5" /></a>
      <div className="min-w-0 flex-1 text-center desk:flex-none desk:px-4">
        <p className="font-wide text-lg font-extrabold leading-tight">{isNow ? 'Ten tydzień' : mondayOf(addDays(t, 7)) === monday ? 'Następny tydzień' : 'Tydzień'}</p>
        <p className="text-sm text-ink-2">{range}</p>
      </div>
      <a href={`#harm/${addDays(monday, 7)}`} aria-label="Następny tydzień" className="grid h-12 w-12 place-items-center rounded-full border border-line bg-card hover:border-ink-2"><CaretRight className="h-5 w-5" /></a>
      {!isNow && <a href="#harm" className="ml-auto inline-flex h-12 items-center rounded-full px-4 font-semibold text-action hover:bg-action/10">Dziś</a>}
    </div>
  );
}

/** „Gdzie jedziesz”: pierwszy dzień od dziś z wpisami użytkownika. */
function WhereNext({ person, entries, ctx }: { person: Rec; entries: Rec[]; ctx: Ctx }) {
  const t = today();
  const next = useMemo(() => {
    const mine = entries.filter((e) => e.personId === person.id && e.dzien >= t);
    const d = mine.reduce<string | undefined>((m, e) => (!m || e.dzien < m ? e.dzien : m), undefined);
    return d ? { dzien: d, slots: cellsOf(mine.filter((e) => e.dzien === d)).get(cellKey(d, person.id)) ?? [] } : undefined;
  }, [entries, person.id, t]);
  const when = next && (next.dzien === t ? 'Dziś' : next.dzien === addDays(t, 1) ? 'Jutro' : dayLong(next.dzien));
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-card shadow-card">
      <div className="flex items-center justify-between gap-3 bg-[#0a2240] px-4 py-2.5 text-white">
        <h2 className="font-wide text-base font-extrabold">Gdzie jedziesz</h2>
        {when && <span className="text-sm font-semibold opacity-90">{when}</span>}
      </div>
      {!next ? (
        <p className="px-4 py-4 text-ink-2">Nie masz jeszcze zaplanowanych dni. Zmiany przyjdą jako powiadomienie.</p>
      ) : (
        <ul className="divide-y divide-line">
          {next.slots.map((s, i) => <WhereSlot key={i} slot={s} ctx={ctx} />)}
        </ul>
      )}
    </div>
  );
}

function WhereSlot({ slot, ctx }: { slot: Slot; ctx: Ctx }) {
  if (slot.rodzaj !== 'zlecenie') {
    return <li className="flex items-center gap-3 px-4 py-4"><CodeChip slot={slot} ctx={ctx} /></li>;
  }
  const j = ctx.jobs.get(slot.jobId);
  const nav = mapsUrl(j?.site);
  const tel = j?.client?.telefony?.[0] as string | undefined;
  return (
    <li className="grid gap-3 px-4 py-4">
      <a href={`#zl/${slot.jobId}`} className="group grid gap-0.5">
        <span className="flex items-center gap-2 text-sm text-ink-2">
          <span className="font-semibold tabular-nums">{j?.numer}</span>{slot.polDnia && <Badge>pół dnia</Badge>}
        </span>
        <span className="font-wide text-xl font-extrabold leading-tight group-hover:text-action">{j?.client?.nazwa ?? 'Zlecenie'}</span>
        {j?.site && <span className="flex items-center gap-1 text-ink-2"><MapPin className="h-4 w-4 shrink-0" />{[j.site.adres, j.site.miejscowosc].filter(Boolean).join(', ')}</span>}
      </a>
      <div className="flex flex-wrap gap-2">
        {nav && <a href={nav} target="_blank" rel="noreferrer" className="inline-flex h-12 items-center gap-2 rounded-full bg-action px-5 font-semibold text-action-ink"><NavigationArrow className="h-5 w-5" weight="fill" />Nawiguj</a>}
        {tel && <a href={telHref(tel)} className="inline-flex h-12 items-center gap-2 rounded-full border border-line px-5 font-semibold"><Phone className="h-5 w-5" />Zadzwoń</a>}
        <a href={`#zl/${slot.jobId}`} className="inline-flex h-12 items-center gap-2 rounded-full px-4 font-semibold text-action hover:bg-action/10"><Briefcase className="h-5 w-5" />Karta zlecenia</a>
      </div>
    </li>
  );
}

/** Wartość komórki: zlecenia z kolorem ekipy, kody w kolorze słownika, tekst. */
export function CellView({ slots, ctx, compact }: { slots: Slot[]; ctx: Ctx; compact?: boolean }) {
  if (!slots.length) return <span className="text-sm text-ink-2/60"><span aria-hidden>·</span><span className="sr-only">pusto</span></span>;
  return (
    <span className={cn('grid min-w-0 gap-1', slots.length === 2 && compact && 'grid-cols-1')}>
      {slots.map((s, i) => s.rodzaj === 'zlecenie' ? <JobChip key={i} slot={s} ctx={ctx} compact={compact} /> : <CodeChip key={i} slot={s} ctx={ctx} />)}
    </span>
  );
}

function JobChip({ slot, ctx, compact }: { slot: Extract<Slot, { rodzaj: 'zlecenie' }>; ctx: Ctx; compact?: boolean }) {
  const j = ctx.jobs.get(slot.jobId);
  const c = ctx.crew(j?.ekipa);
  return (
    <span className="flex min-w-0 items-stretch gap-2 rounded-lg bg-bg/70 py-1 pr-2 pl-0 text-left" style={{ boxShadow: `inset 3px 0 0 ${c ?? 'var(--line)'}` }}>
      <span className="min-w-0 pl-2.5">
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-ink-2">
          <span className="shrink-0 font-semibold tabular-nums">{j?.numer ?? 'zlecenie'}</span>{slot.polDnia && <span className="shrink-0 font-bold" aria-label="pół dnia">½</span>}
          {j?.site?.miejscowosc && <span className="truncate">{j.site.miejscowosc}</span>}
        </span>
        <span className={cn('block truncate font-semibold leading-tight', compact ? 'text-sm' : 'text-[15px]')}>{j?.client?.nazwa ?? ''}</span>
      </span>
    </span>
  );
}

function CodeChip({ slot, ctx }: { slot: Exclude<Slot, { rodzaj: 'zlecenie' }>; ctx: Ctx }) {
  const color = slot.rodzaj === 'kod' ? ctx.codes.get(slot.kod) ?? '#8896a5' : undefined;
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5 justify-self-start rounded-lg px-2.5 py-1 text-sm font-semibold', !color && 'bg-bg/70 text-ink-2')}
      style={color ? { background: `${color}26`, color: 'var(--ink)', boxShadow: `inset 0 0 0 1px ${color}80` } : undefined}>
      {color && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />}
      <span className="truncate">{slot.rodzaj === 'kod' ? slot.kod : slot.tekst}</span>
      {slot.polDnia && <span className="text-ink-2" aria-label="pół dnia">½</span>}
    </span>
  );
}

/** Komórka do kliknięcia (admin) albo tylko do odczytu. */
function CellButton({ dzien, person, p, compact }: { dzien: string; person: Rec; p: ViewProps; compact?: boolean }) {
  const key = cellKey(dzien, person.id);
  const cur = p.cells.get(key) ?? [];
  const draft = p.draftMap.get(key);
  const shown = draft && Array.isArray(draft.proposal) ? (draft.proposal as Slot[]) : cur;
  const label = `${person.nazwa}, ${dayShort(dzien)}: ${cellText(shown, p.ctx.jobs)}${draft ? ' (szkic)' : ''}`;
  const body = (
    <>
      <CellView slots={shown} ctx={p.ctx} compact={compact} />
      {draft && <span className="absolute top-1 right-1 rounded-full bg-action px-1.5 text-xs font-bold leading-4 text-action-ink">szkic</span>}
    </>
  );
  const cls = cn('relative block h-full w-full min-w-0 rounded-xl p-1.5 text-left', draft && 'outline-2 outline-dashed outline-action/70 -outline-offset-2 bg-action/5');
  return p.open ? (
    <button type="button" data-cell={`${dzien}|${person.nazwa}`} aria-label={label} title={draft ? `Teraz: ${cellText(cur, p.ctx.jobs)}` : undefined}
      onClick={() => p.open!(dzien, person)} className={cn(cls, 'min-h-12 transition-colors duration-200 hover:bg-action/8')}>{body}</button>
  ) : (
    <div data-cell={`${dzien}|${person.nazwa}`} role="img" aria-label={label} className={cls}>{body}</div>
  );
}

function NameCell({ person, mine, color }: { person: Rec; mine: boolean; color?: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="h-6 w-1 shrink-0 rounded-full" style={{ background: color ?? 'var(--line)' }} aria-hidden />
      <span className={cn('min-w-0 leading-tight [overflow-wrap:anywhere]', mine ? 'font-bold' : 'font-semibold')}>{person.nazwa}</span>
      {mine && <span className="shrink-0 rounded-full bg-ink px-1.5 text-[11px] font-bold leading-5 text-bg">Ty</span>}
    </span>
  );
}

/** Telefon: karty dni, w każdej osoby po kolei. */
function DayCards(p: ViewProps) {
  return (
    <div className="grid gap-3">
      {p.days.map((d) => {
        const { wd, info } = p.dayInfo(d);
        const note = p.noteOf.get(d);
        const any = p.people.some((x) => p.cells.has(cellKey(d, x.id)) || p.draftMap.has(cellKey(d, x.id)));
        const isToday = d === p.today;
        if (wd !== 1 && !any && !note) {
          return (
            <p key={d} className="flex items-center justify-between rounded-2xl border border-line/70 px-4 py-3 text-sm text-ink-2">
              <span className="font-semibold">{dayLong(d)}</span><span>{info ?? 'Weekend'}</span>
            </p>
          );
        }
        return (
          <article key={d} id={`d-${d}`} className={cn('overflow-hidden rounded-2xl border bg-card shadow-card', isToday ? 'border-action' : 'border-line')}>
            <header className={cn('flex items-center justify-between gap-2 px-4 py-2.5', isToday ? 'bg-action/10' : 'border-b border-line')}>
              <h3 className="font-wide font-extrabold first-letter:uppercase">{dayLong(d)}</h3>
              <span className="flex items-center gap-1.5">{isToday && <Badge tone="action">dziś</Badge>}{info && <Badge tone="warn">{info}</Badge>}</span>
            </header>
            {note && <p className="flex gap-2 border-b border-line bg-bg/60 px-4 py-2 text-sm"><NotePencil className="mt-0.5 h-4 w-4 shrink-0 text-ink-2" />{note}</p>}
            <ul className="divide-y divide-line/70">
              {p.people.map((x) => {
                const me = x.id === p.mine?.id;
                return (
                  <li key={x.id} className={cn('grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)] items-center gap-2 px-2 py-0.5', me && 'bg-action/6')}>
                    <span className="pl-2"><NameCell person={x} mine={me} color={p.ctx.crew(p.ekipaOf.get(x.userId))} /></span>
                    <CellButton dzien={d} person={x} p={p} />
                  </li>
                );
              })}
            </ul>
          </article>
        );
      })}
    </div>
  );
}

/** Komputer: tabela osoba × dzień. */
function WeekTable(p: ViewProps) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-card shadow-card">
      <table className="w-full table-fixed border-collapse text-left">
        <colgroup>
          <col className="w-52" />
          {p.days.map((d) => <col key={d} className={p.dayInfo(d).wd === 0 ? 'w-[9%]' : undefined} />)}
        </colgroup>
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className="px-4 py-3 text-sm font-semibold text-ink-2">Osoba</th>
            {p.days.map((d) => {
              const { wd, info } = p.dayInfo(d);
              const isToday = d === p.today;
              return (
                <th key={d} scope="col" className={cn('px-2 py-2 align-top', isToday && 'bg-action/10', wd !== 1 && 'bg-bg/60')}>
                  <span className={cn('block font-wide text-sm font-extrabold first-letter:uppercase', isToday && 'text-action')}>{dayShort(d)}</span>
                  {info && <span className="block truncate text-xs font-semibold text-danger" title={info}>{info}</span>}
                  {p.noteOf.get(d) && <span className="mt-1 flex gap-1 text-xs font-normal text-ink-2" title={p.noteOf.get(d)}><NotePencil className="h-3.5 w-3.5 shrink-0" /><span className="line-clamp-2">{p.noteOf.get(d)}</span></span>}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-line/70">
          {p.people.map((x) => {
            const me = x.id === p.mine?.id;
            return (
              <tr key={x.id} className={cn(me && 'bg-action/6')}>
                <th scope="row" className="px-3 py-1.5 text-sm"><NameCell person={x} mine={me} color={p.ctx.crew(p.ekipaOf.get(x.userId))} /></th>
                {p.days.map((d) => (
                  <td key={d} className={cn('h-16 p-1 align-top', d === p.today && 'bg-action/5', p.dayInfo(d).wd !== 1 && 'bg-bg/50')}>
                    <CellButton dzien={d} person={x} p={p} compact />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

