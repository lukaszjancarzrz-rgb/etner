import { addDays, isWorkday, mondayOf, plHolidays } from '@etner/shared';
import { CaretLeft, CaretRight, MapPin, NavigationArrow, Phone, Briefcase, CalendarBlank, NotePencil, PencilSimple } from '@phosphor-icons/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { dayLong, dayShort, mapsUrl, markDaySeen, telHref, today, useCrewColor, useDict, useIsAdmin, useLoading, useMe } from '../../core/data.js';
import { ViewedDays } from '../../core/badges.js';
import { useUnseenDays } from '../../core/layout/useBadges.js';
import { CategoryLegend, catStripe, catTint, useCatColor } from '../../core/ui/category.js';
import { useDesk } from '../../core/layout/status.js';
import { useEntities, type Rec } from '../../core/store.js';
import { Badge, Empty, Segmented } from '../../core/ui/bits.js';
import { Button } from '../../core/ui/button.js';
import { cn } from '../../core/ui/cn.js';
import { Skeleton } from '../../core/ui/skeleton.js';
import type { Route } from '../../routes.js';
import { useJobs, type JobView } from '../zlecenia/jobs.js';
import { CellEditor } from './CellEditor.js';
import { DraftBar } from './Drafts.js';
import { cellKey, cellsOf, cellText, monthDays, slotLabel, type Slot } from './model.js';
import { Avatar } from '../../core/ui/avatar.js';

export type Ctx = {
  jobs: Map<string, JobView>;
  codes: Map<string, string | undefined>;
  crew: (e: string | null | undefined) => string | undefined;
  /** R30: kolor zlecenia na kartach harmonogramu = kolor kategorii. */
  cat: (k: string | null | undefined) => string | undefined;
};

/** „Dziś”: po przejściu na bieżący tydzień / miesiąc przewijamy do dzisiejszego dnia. */
let scrollToday = false;
const smooth = (): ScrollBehavior => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

const validDay = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);

type View = 'tydzien' | 'miesiac';
const VIEW_KEY = 'harm-widok';
const readView = (): View => { try { return localStorage.getItem(VIEW_KEY) === 'miesiac' ? 'miesiac' : 'tydzien'; } catch { return 'tydzien'; } };

export function Harmonogram({ route }: { route: Route }) {
  const me = useMe();
  const admin = useIsAdmin();
  const desk = useDesk();
  const loading = useLoading();
  const t = today();
  const anchor = validDay(route.param) ?? t;
  const [view, setViewState] = useState<View>(readView);
  const setView = (v: View) => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* prywatne okno */ } };
  const month = desk && view === 'miesiac'; // telefon: zawsze tydzień
  const monday = mondayOf(anchor);
  const days = useMemo(() => (month ? monthDays(anchor) : Array.from({ length: 7 }, (_, i) => addDays(monday, i))), [month, anchor, monday]);

  const people = useEntities('schedule_people');
  const entries = useEntities('schedule_entries');
  const notes = useEntities('schedule_notes');
  const drafts = useEntities('schedule_drafts');
  const users = useEntities('users');
  const off = useDict('dzien_wolny');
  const codesDict = useDict('kod_nieobecnosci');
  const jobs = useJobs();
  const crew = useCrewColor();
  const cat = useCatColor();
  const unseen = useUnseenDays();
  const fresh = useMemo(() => new Set(unseen), [unseen]);
  // obejrzane dni (widoczne ≥1 s) zapisujemy dopiero przy wyjściu z ekranu / schowaniu aplikacji; dotknięcie zmienionego dnia zapisuje od razu
  const viewed = useRef(new ViewedDays());
  const seen = useMemo(() => (me ? (d: string) => viewed.current.add(d) : undefined), [me]);
  const tap = useMemo(() => (me ? (d: string) => { if (fresh.has(d)) { viewed.current.delete(d); markDaySeen(me.id, d); } } : undefined), [me, fresh]);
  useEffect(() => {
    if (!me) return;
    const flush = () => { viewed.current.flush((d, at) => markDaySeen(me!.id, d, at)); };
    const hide = () => { if (document.hidden) flush(); };
    document.addEventListener('visibilitychange', hide);
    addEventListener('pagehide', flush);
    return () => { document.removeEventListener('visibilitychange', hide); removeEventListener('pagehide', flush); flush(); };
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const ctx: Ctx = useMemo(() => ({ jobs, codes: new Map(codesDict.map((d) => [d.wartosc, d.kolor ?? undefined])), crew, cat }), [jobs, codesDict, crew, cat]);
  const sorted = useMemo(() => [...people].sort((a, b) => a.kolejnosc - b.kolejnosc || a.nazwa.localeCompare(b.nazwa, 'pl')), [people]);
  const cells = useMemo(() => cellsOf(entries.filter((e) => e.dzien >= days[0]! && e.dzien <= days.at(-1)!)), [entries, days]);
  const draftMap = useMemo(() => new Map(admin ? drafts.map((d) => [cellKey(d.dzien, d.personId), d]) : []), [drafts, admin]);
  const noteOf = useMemo(() => new Map(notes.map((n) => [n.dzien, n.tekst as string])), [notes]);
  const ekipaOf = useMemo(() => new Map(users.map((u) => [u.id, u.ekipa as string | null])), [users]);
  const mine = sorted.find((p) => p.userId === me?.id);
  const extra = off.map((d) => d.wartosc as string);
  const dayInfo = (d: string) => ({ wd: isWorkday(d, extra), info: plHolidays(Number(d.slice(0, 4)))[d] ?? (extra.includes(d) ? 'Dzień wolny' : undefined) });

  const [edit, setEdit] = useState<{ dzien: string; person: Rec } | null>(null);
  const open = admin ? (dzien: string, person: Rec) => setEdit({ dzien, person }) : undefined;

  useEffect(() => {
    if (!scrollToday || loading) return;
    scrollToday = false;
    requestAnimationFrame(() => document.querySelector(`[data-day="${t}"]`)?.scrollIntoView({ behavior: smooth(), block: desk ? 'nearest' : 'start', inline: 'start' }));
  }, [anchor, month, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Z powiadomienia `#harm/<dzień>~<osoba>`: przewiń do komórki, podświetl ją na chwilę, dzień obejrzany.
  const target = validDay(route.param) && route.highlight ? cellKey(route.param!, route.highlight) : undefined;
  const [flash, setFlash] = useState<string>();
  useEffect(() => {
    if (!target || loading) return;
    setFlash(target);
    viewed.current.add(route.param!);
    requestAnimationFrame(() => document.querySelector(`[data-key="${CSS.escape(target)}"]`)?.scrollIntoView({ behavior: smooth(), block: 'center', inline: 'center' }));
    const tm = setTimeout(() => setFlash(undefined), 2500);
    return () => clearTimeout(tm);
  }, [target, loading]); // eslint-disable-line react-hooks/exhaustive-deps -- zmiana widoku nie podświetla drugi raz

  if (loading) return <HarmSkeleton />;
  const props = { days, people: sorted, cells, draftMap, noteOf, mine, ctx, open, dayInfo, ekipaOf, today: t, fresh, seen, tap, flash };

  return (
    <section className="mx-auto grid max-w-[1400px] gap-4 px-4 py-4 desk:px-8 desk:py-6">
      {mine && <WhereNext person={mine} entries={entries} ctx={ctx} />}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">{month ? <MonthNav day={anchor} today={t} /> : <WeekNav monday={monday} today={t} />}</div>
        {desk && <Segmented label="Widok" value={view} onChange={setView} className="w-64" options={[{ v: 'tydzien', label: 'Tydzień' }, { v: 'miesiac', label: 'Miesiąc' }]} />}
      </div>
      {admin && <DraftBar drafts={drafts} people={sorted} entries={entries} ctx={ctx} />}
      {!sorted.length ? (
        <Empty icon={CalendarBlank} title="Harmonogram nie ma jeszcze osób" hint="Administrator dodaje osoby (kolumny) w ustawieniach użytkowników." />
      ) : month ? <MonthTable {...props} /> : desk ? <WeekTable {...props} /> : <DayCards {...props} />}
      {!!sorted.length && <CategoryLegend className="px-1" />}
      {edit && <CellEditor dzien={edit.dzien} person={edit.person} people={sorted} current={cells.get(cellKey(edit.dzien, edit.person.id)) ?? []}
        draft={draftMap.get(cellKey(edit.dzien, edit.person.id))} ekipa={ekipaOf.get(edit.person.userId) ?? null} ctx={ctx} onClose={() => setEdit(null)} />}
    </section>
  );
}

type ViewProps = {
  days: string[]; people: Rec[]; cells: Map<string, Slot[]>; draftMap: Map<string, Rec>; noteOf: Map<string, string>;
  mine?: Rec; ctx: Ctx; open?: (dzien: string, person: Rec) => void; dayInfo: (d: string) => { wd: 0 | 1 | 2; info?: string };
  ekipaOf: Map<string, string | null>; today: string;
  /** Dni ze zmianą jeszcze nie obejrzaną („nowe”) i zapis obejrzenia dnia. */
  fresh: Set<string>; seen?: (dzien: string) => void; tap?: (dzien: string) => void;
  /** Komórka podświetlona po wejściu z powiadomienia (cellKey). */
  flash?: string;
};

/** Dzień widoczny na ekranie ≥1 s (IntersectionObserver) → obejrzany. Obserwujemy tylko dni z „nowe”. */
function useSeenRef(dzien: string, p: ViewProps) {
  const [el, setEl] = useState<Element | null>(null);
  const on = p.fresh.has(dzien) && !!p.seen;
  const seen = p.seen;
  useEffect(() => {
    if (!on || !el || typeof IntersectionObserver === 'undefined') return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let visible = false;
    // czas liczy się tylko przy widocznej karcie przeglądarki (aplikacja w tle to nie obejrzenie)
    const tick = () => {
      const ok = visible && !document.hidden;
      if (ok && !timer) timer = setTimeout(() => seen!(dzien), 1000);
      if (!ok && timer) { clearTimeout(timer); timer = undefined; }
    };
    const io = new IntersectionObserver(([e]) => {
      if (!e) return;
      const vh = e.rootBounds?.height ?? innerHeight;
      // mała kolumna: większa część widoczna; wysoka karta dnia: co najmniej pół ekranu
      visible = e.isIntersecting && (e.intersectionRatio >= 0.6 || e.intersectionRect.height >= vh * 0.5);
      tick();
    }, { threshold: [0, 0.25, 0.5, 0.6, 0.75, 1] });
    io.observe(el);
    document.addEventListener('visibilitychange', tick);
    return () => { io.disconnect(); clearTimeout(timer); document.removeEventListener('visibilitychange', tick); };
  }, [on, el, dzien, seen]);
  return setEl;
}

const NewPill = () => <span className="shrink-0 rounded-full bg-new px-2 text-xs font-bold leading-5 text-white">nowe</span>;

function HarmSkeleton() {
  return (
    <div className="mx-auto grid max-w-[1400px] gap-4 px-4 py-4 desk:px-8" aria-busy="true" aria-label="Wczytywanie harmonogramu">
      <Skeleton className="h-32" />
      <Skeleton className="h-12 w-72" />
      {[0, 1, 2].map((i) => <Skeleton key={i} className="h-48" />)}
    </div>
  );
}

const navBtn = 'grid h-11 w-11 desk:h-12 desk:w-12 shrink-0 place-items-center rounded-full border border-line bg-card hover:border-ink-2';

/** Stały układ: [miejsce na „Dziś”] ‹ etykieta › (strzałki nie skaczą). */
function NavRow({ back, slot, prev, next, labels, title, sub }: { back?: string; slot: string; prev: string; next: string; labels: [string, string]; title: string; sub: string }) {
  return (
    <div className="flex items-center gap-1.5 desk:gap-2">
      <span className={cn('flex shrink-0 justify-end', slot)}>
        {back && <a href="#harm" onClick={() => { scrollToday = true; }} className="inline-flex h-11 items-center rounded-full px-2.5 font-semibold text-action hover:bg-action/10 desk:h-12 desk:px-3">{back}</a>}
      </span>
      <a href={prev} aria-label={labels[0]} className={navBtn}><CaretLeft className="h-5 w-5" /></a>
      <div className="w-48 shrink-0 text-center desk:w-52">
        <p className="truncate font-wide text-base font-extrabold leading-tight first-letter:uppercase desk:text-lg">{title}</p>
        <p className="text-sm text-ink-2 tabular-nums">{sub}</p>
      </div>
      <a href={next} aria-label={labels[1]} className={navBtn}><CaretRight className="h-5 w-5" /></a>
    </div>
  );
}

function WeekNav({ monday, today: t }: { monday: string; today: string }) {
  const sun = addDays(monday, 6);
  const isNow = mondayOf(t) === monday;
  const range = `${Number(monday.slice(8))}.${monday.slice(5, 7)}-${Number(sun.slice(8))}.${sun.slice(5, 7)}.${sun.slice(0, 4)}`;
  const title = isNow ? 'Ten tydzień' : mondayOf(addDays(t, 7)) === monday ? 'Następny tydzień' : mondayOf(addDays(t, -7)) === monday ? 'Poprzedni tydzień' : 'Tydzień';
  return <NavRow slot="w-[3.75rem] desk:w-16" back={isNow ? undefined : 'Dziś'} prev={`#harm/${addDays(monday, -7)}`} next={`#harm/${addDays(monday, 7)}`} labels={['Poprzedni tydzień', 'Następny tydzień']} title={title} sub={range} />;
}

const MONTH = new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthName = (d: string) => MONTH.format(new Date(`${d.slice(0, 7)}-15T12:00:00Z`));

function MonthNav({ day, today: t }: { day: string; today: string }) {
  const first = `${day.slice(0, 7)}-01`;
  const prev = `${addDays(first, -1).slice(0, 7)}-01`;
  const next = addDays(monthDays(day).at(-1)!, 1);
  const isNow = t.slice(0, 7) === day.slice(0, 7);
  return <NavRow slot="w-32" back={isNow ? undefined : 'Ten miesiąc'} prev={`#harm/${prev}`} next={`#harm/${next}`} labels={['Poprzedni miesiąc', 'Następny miesiąc']} title={monthName(day)} sub={isNow ? 'Ten miesiąc' : 'Miesiąc'} />;
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

/** Wartość komórki: zlecenia w kolorze kategorii (z `link`: odnośnik do karty zlecenia), kody w kolorze słownika, tekst. */
export function CellView({ slots, ctx, compact, link, reserve }: { slots: Slot[]; ctx: Ctx; compact?: boolean; link?: boolean; reserve?: boolean }) {
  if (!slots.length) return <span className="text-sm text-ink-2/60"><span aria-hidden>·</span><span className="sr-only">pusto</span></span>;
  return (
    <span className="grid min-w-0 gap-1">
      {slots.map((s, i) => s.rodzaj === 'zlecenie' ? <JobChip key={i} slot={s} ctx={ctx} compact={compact} link={link} reserve={reserve && i === 0} /> : <CodeChip key={i} slot={s} ctx={ctx} />)}
    </span>
  );
}

/** `reserve`: miejsce na ✎ w rogu (tabela admina, tylko pierwsza karta komórki). */
function JobChip({ slot, ctx, compact, link, reserve }: { slot: Extract<Slot, { rodzaj: 'zlecenie' }>; ctx: Ctx; compact?: boolean; link?: boolean; reserve?: boolean }) {
  const j = ctx.jobs.get(slot.jobId);
  const c = ctx.cat(j?.kategoria);
  const body = (
    <span className="min-w-0 pl-2.5">
      <span className={cn('flex min-w-0 items-center gap-1.5 text-xs text-ink-2', reserve && 'pr-6')}>
        <span className="sr-only">{j?.numer ?? 'zlecenie'}</span>
        {j?.kategoria && <span className="flex min-w-0 items-center gap-1 text-[11px] font-bold uppercase leading-4 tracking-wide text-ink"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: catStripe(c) }} aria-hidden /><span className="truncate">{j.kategoria}</span></span>}
        {slot.polDnia && <span className="shrink-0 font-bold" aria-label="pół dnia">½</span>}
        {j?.site?.miejscowosc && <span className="truncate">{j.site.miejscowosc}</span>}
      </span>
      <span className={cn('block truncate font-semibold leading-tight', compact ? 'text-sm' : 'text-[15px]')}>{j?.client?.nazwa ?? ''}</span>
    </span>
  );
  const cls = 'flex min-w-0 items-stretch gap-2 rounded-lg py-1 pr-2 pl-0 text-left text-ink';
  const style = { background: catTint(c), boxShadow: `inset 4px 0 0 ${catStripe(c)}` };
  if (!link) return <span className={cls} style={style}>{body}</span>;
  return (
    <a href={`#zl/${slot.jobId}`} aria-label={`Zlecenie ${slotLabel(slot, ctx.jobs)}${slot.polDnia ? ', pół dnia' : ''}`} style={style}
      className={cn(cls, 'decoration-1 underline-offset-2 transition-[outline-color] duration-200 outline-1 outline-transparent hover:underline hover:outline-ink-2/50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-action')}>{body}</a>
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

/**
 * Komórka. Admin: puste miejsce, kod i tekst otwierają edytor; zlecenie prowadzi do karty zlecenia, a edytor otwiera ✎.
 * Pracownik: tylko odczyt, zlecenie też prowadzi do karty.
 */
function CellButton({ dzien, person, p, compact }: { dzien: string; person: Rec; p: ViewProps; compact?: boolean }) {
  const key = cellKey(dzien, person.id);
  const cur = p.cells.get(key) ?? [];
  const draft = p.draftMap.get(key);
  const shown = draft && Array.isArray(draft.proposal) ? (draft.proposal as Slot[]) : cur;
  const label = `${person.nazwa}, ${dayShort(dzien)}: ${cellText(shown, p.ctx.jobs)}${draft ? ' (szkic)' : ''}`;
  const hasJob = shown.some((s) => s.rodzaj === 'zlecenie');
  const szkic = draft && <span className={cn('pointer-events-none absolute top-1 rounded-full', p.open && hasJob ? (compact ? 'right-8' : 'right-11') : 'right-1', ' bg-action px-1.5 text-xs font-bold leading-4 text-action-ink')}>szkic</span>;
  const cls = cn('relative block h-full w-full min-w-0 scroll-m-24 rounded-xl p-1.5 text-left transition-[box-shadow,background-color] duration-300 motion-reduce:transition-none',
    draft && 'outline-2 outline-dashed outline-action/70 -outline-offset-2 bg-action/5', p.flash === key && 'bg-ok/10 ring-4 ring-ok/40');
  if (p.open && !hasJob) {
    return (
      <button type="button" data-cell={`${dzien}|${person.nazwa}`} data-key={key} data-flash={p.flash === key || undefined} aria-label={label} title={draft ? `Teraz: ${cellText(cur, p.ctx.jobs)}` : undefined}
        onClick={() => { p.tap?.(dzien); p.open!(dzien, person); }} className={cn(cls, 'min-h-12 transition-colors duration-200 hover:bg-action/8')}>
        <CellView slots={shown} ctx={p.ctx} compact={compact} />{szkic}
      </button>
    );
  }
  return (
    <div data-cell={`${dzien}|${person.nazwa}`} data-key={key} data-flash={p.flash === key || undefined} role="group" aria-label={label} title={draft ? `Teraz: ${cellText(cur, p.ctx.jobs)}` : undefined}
      // kliknięcie obok odnośnika (myszą) też otwiera edytor; z klawiatury i czytnika: przycisk ✎
      onClick={p.open || p.fresh.has(dzien) ? (e) => { p.tap?.(dzien); if (p.open && !(e.target as Element).closest('a,button')) p.open(dzien, person); } : undefined}
      className={cn(cls, p.open && 'min-h-12 cursor-pointer transition-colors duration-200 hover:bg-action/8', p.open && !compact && 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1')}>
      <CellView slots={shown} ctx={p.ctx} compact={compact} link reserve={!!p.open && compact} />
      {p.open && (
        <button type="button" aria-label={`Edytuj komórkę ${person.nazwa} ${dayShort(dzien)}`} onClick={() => { p.tap?.(dzien); p.open!(dzien, person); }}
          // tabela (komputer): w rogu nad paskiem numeru, żeby karta zlecenia miała całą szerokość
          className={cn('grid place-items-center rounded-lg text-ink-2 hover:bg-action/10 hover:text-action focus-visible:outline-2 focus-visible:outline-action',
            compact ? 'absolute top-1.5 right-1.5 h-6 w-6 rounded-md bg-card/90' : 'h-8 w-8')}>
          <PencilSimple className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
        </button>
      )}
      {szkic}
    </div>
  );
}

function NameCell({ person, mine, color }: { person: Rec; mine: boolean; color?: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="h-6 w-1 shrink-0 rounded-full" style={{ background: color ?? 'var(--line)' }} aria-hidden />
      {person.userId && <Avatar userId={person.userId} name={person.nazwa} size="xs" />}
      <span className={cn('min-w-0 leading-tight [overflow-wrap:anywhere]', mine ? 'font-bold' : 'font-semibold')}>{person.nazwa}</span>
      {mine && <span className="shrink-0 rounded-full bg-ink px-1.5 text-[11px] font-bold leading-5 text-bg">Ty</span>}
    </span>
  );
}

/** Telefon: karty dni, w każdej osoby po kolei. */
function DayCards(p: ViewProps) {
  return <div className="grid gap-3">{p.days.map((d) => <DayCard key={d} d={d} p={p} />)}</div>;
}

function DayCard({ d, p }: { d: string; p: ViewProps }) {
  const ref = useSeenRef(d, p);
  const { wd, info } = p.dayInfo(d);
  const note = p.noteOf.get(d);
  const any = p.people.some((x) => p.cells.has(cellKey(d, x.id)) || p.draftMap.has(cellKey(d, x.id)));
  const isToday = d === p.today;
  const fresh = p.fresh.has(d);
  if (wd !== 1 && !any && !note) {
    return (
      <p ref={ref} data-day={d} onClick={() => p.tap?.(d)} className="flex scroll-mt-20 items-center justify-between gap-2 rounded-2xl border border-line/70 px-4 py-3 text-sm text-ink-2">
        <span className="flex items-center gap-2 font-semibold">{dayLong(d)}{fresh && <NewPill />}</span><span>{info ?? 'Weekend'}</span>
      </p>
    );
  }
  return (
    <article ref={ref} id={`d-${d}`} data-day={d} className={cn('scroll-mt-20 overflow-hidden rounded-2xl border bg-card shadow-card', isToday ? 'border-action' : 'border-line')}>
      <header onClick={() => p.tap?.(d)} className={cn('flex items-center justify-between gap-2 px-4 py-2.5', isToday ? 'bg-action/10' : 'border-b border-line')}>
        <h3 className="font-wide font-extrabold first-letter:uppercase">{dayLong(d)}</h3>
        <span className="flex items-center gap-1.5">{fresh && <NewPill />}{isToday && <Badge tone="action">dziś</Badge>}{info && <Badge tone="warn">{info}</Badge>}</span>
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
}

/** Nagłówek kolumny dnia (tydzień i miesiąc): dzień, święto, uwaga, „nowe”; obejrzenie liczone, gdy widać nagłówek. */
function DayHead({ d, p, className }: { d: string; p: ViewProps; className?: string }) {
  const ref = useSeenRef(d, p);
  const { wd, info } = p.dayInfo(d);
  const isToday = d === p.today;
  const note = p.noteOf.get(d);
  return (
    <th ref={ref} data-day={d} onClick={() => p.tap?.(d)} data-today={isToday || undefined} scope="col" className={cn('px-2 py-2 align-top', isToday && 'bg-action/10', wd !== 1 && 'bg-bg/60', className)}>
      <span className="flex items-center justify-between gap-1">
        <span className={cn('block font-wide text-sm font-extrabold first-letter:uppercase', isToday && 'text-action')}>{dayShort(d)}</span>
        {p.fresh.has(d) && <NewPill />}
      </span>
      {info && <span className="block truncate text-xs font-semibold text-danger" title={info}>{info}</span>}
      {note && <span className="mt-1 flex gap-1 text-xs font-normal text-ink-2" title={note}><NotePencil className="h-3.5 w-3.5 shrink-0" /><span className="line-clamp-2">{note}</span></span>}
    </th>
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
            {p.days.map((d) => <DayHead key={d} d={d} p={p} />)}
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

const COL = 160; // szerokość kolumny dnia w miesiącu (jak kolumna tygodnia na 1440 px)
const NAME = 208;

/** Komputer: miesiąc, te same karty co w tygodniu; tabela przewijana w poziomie (strzałki: o tydzień). */
function MonthTable(p: ViewProps) {
  const box = useRef<HTMLDivElement>(null);
  const month = p.days[0]!.slice(0, 7);
  useEffect(() => {
    const el = box.current, th = el?.querySelector<HTMLElement>('th[data-today]');
    // th jest sticky, więc offsetLeft liczy się od innego przodka: pozycja względem ramki
    if (el) el.scrollLeft = th ? Math.max(0, el.scrollLeft + th.getBoundingClientRect().left - el.getBoundingClientRect().left - NAME) : 0;
  }, [month]);
  const by = (n: number) => box.current?.scrollBy({ left: n * 7 * COL, behavior: smooth() });
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-end gap-2">
        <span className="text-sm text-ink-2">Przewiń o tydzień</span>
        <button type="button" aria-label="Przewiń tydzień wstecz" onClick={() => by(-1)} className={navBtn}><CaretLeft className="h-5 w-5" /></button>
        <button type="button" aria-label="Przewiń tydzień naprzód" onClick={() => by(1)} className={navBtn}><CaretRight className="h-5 w-5" /></button>
      </div>
      <div ref={box} className="max-h-[calc(100dvh-17rem)] overflow-auto overscroll-x-contain rounded-2xl border border-line bg-card shadow-card">
        <table className="table-fixed border-separate border-spacing-0 text-left" style={{ width: NAME + COL * p.days.length }}>
          <colgroup>
            <col style={{ width: NAME }} />
            {p.days.map((d) => <col key={d} style={{ width: COL }} />)}
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className="sticky top-0 left-0 z-20 border-r border-b border-line bg-card px-4 py-3 text-sm font-semibold text-ink-2">Osoba</th>
              {p.days.map((d) => <DayHead key={d} d={d} p={p} className={cn('sticky top-0 z-10 scroll-ml-[13rem] border-b border-line bg-card', d === p.today ? 'bg-[color-mix(in_srgb,var(--action)_14%,var(--card))]' : p.dayInfo(d).wd !== 1 && 'bg-[color-mix(in_srgb,var(--bg)_70%,var(--card))]')} />)}
            </tr>
          </thead>
          <tbody>
            {p.people.map((x) => {
              const me = x.id === p.mine?.id;
              return (
                <tr key={x.id}>
                  <th scope="row" className={cn('sticky left-0 z-10 border-r border-b border-line/70 bg-card px-3 py-1.5 text-sm', me && 'bg-[color-mix(in_srgb,var(--action)_6%,var(--card))]')}>
                    <NameCell person={x} mine={me} color={p.ctx.crew(p.ekipaOf.get(x.userId))} />
                  </th>
                  {p.days.map((d) => (
                    <td key={d} className={cn('h-16 border-b border-line/70 p-1 align-top', p.dayInfo(d).wd !== 1 && 'bg-bg/50', d === p.today && 'bg-action/5', me && 'bg-action/6')}>
                      <CellButton dzien={d} person={x} p={p} compact />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
