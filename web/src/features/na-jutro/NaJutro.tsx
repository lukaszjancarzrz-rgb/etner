import { CaretLeft, CaretRight, Check, ListChecks, PencilSimple, Plus, SunHorizon, Trash, X } from '@phosphor-icons/react';
import { addDays, nextWorkday } from '@etner/shared';
import { useEffect, useMemo, useState } from 'react';
import { dayLong, fmtWhen, today, useDict, useIsAdmin, useLoading, useMe, useNames } from '../../core/data.js';
import { outbox } from '../../core/outbox.js';
import { useEntities, type Rec } from '../../core/store.js';
import { Empty, Segmented, SectionTitle } from '../../core/ui/bits.js';
import { Button } from '../../core/ui/button.js';
import { Checkbox } from '../../core/ui/checkbox.js';
import { cn } from '../../core/ui/cn.js';
import { Input } from '../../core/ui/input.js';
import { Avatar } from '../../core/ui/avatar.js';
import { Dialog, Sheet } from '../../core/ui/sheet.js';
import { useJobs, type JobView } from '../zlecenia/jobs.js';
import { dayJobIds, rankTemplates } from './model.js';
import { Skeleton } from '../../core/ui/skeleton.js';
import { toast } from '../../core/ui/toast.js';
import { createVia, updateVia, withoutEchoes } from '../../core/write.js';
import type { Route } from '../../routes.js';

const fail = (t: string) => (e: Error) => toast(t, { body: e.message, tone: 'error' });
const dayName = (d: string) => {
  const t = today();
  const rel = d === t ? 'dziś' : d === addDays(t, 1) ? 'jutro' : d === addDays(t, -1) ? 'wczoraj' : '';
  return rel ? `${rel}, ${dayLong(d)}` : dayLong(d);
};

/** Na jutro: lista ekipy na dzień (domyślnie następny dzień roboczy), nad nią listy predefiniowane. Pracownik: tylko swoja ekipa; admin: dowolna. `#jutro~<id>` podświetla rzecz. */
export function NaJutro({ route }: { route: Route }) {
  const me = useMe();
  const admin = useIsAdmin();
  const loading = useLoading();
  const crews = useDict('ekipa').filter((d) => d.wartosc !== 'mieszane'); // „mieszane” to nie ekipa z własną listą
  const raw = useEntities('checklists');
  const items = useMemo(() => withoutEchoes(raw, ['ekipa', 'dzien', 'tekst']), [raw]);
  const off = useDict('dzien_wolny');
  const next = nextWorkday(today(), off.map((d) => d.wartosc as string));
  const [crewSel, setCrew] = useState<string>();
  const [picked, setDay] = useState<string>();
  const day = picked ?? next; // bez wyboru: następny dzień roboczy (dni wolne mogą dojść po wczytaniu)
  const [flash, setFlash] = useState<string>();
  const hl = route.highlight;
  const hlItem = hl ? items.find((i) => i.id === hl) : undefined;

  useEffect(() => {
    if (!hlItem) return;
    setCrew(hlItem.ekipa); setDay(hlItem.dzien); setFlash(hlItem.id);
    requestAnimationFrame(() => document.getElementById(`j-${hlItem.id}`)?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
    const t = setTimeout(() => setFlash(undefined), 2500);
    return () => clearTimeout(t);
  }, [hlItem?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const ekipa: string | undefined = admin ? crewSel ?? crews[0]?.wartosc : me?.ekipa ?? undefined;
  const list = useMemo(() => items.filter((i) => i.ekipa === ekipa && i.dzien === day), [items, ekipa, day]);
  const open = useMemo(() => list.filter((i) => !i.zabrane).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)), [list]);
  const taken = useMemo(() => list.filter((i) => i.zabrane).sort((a, b) => ((a.zabraneAt ?? '') < (b.zabraneAt ?? '') ? -1 : 1)), [list]);

  if (loading) return <div className="mx-auto grid max-w-3xl gap-3 p-4" aria-busy="true" aria-label="Wczytywanie listy"><Skeleton className="h-28" />{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>;
  if (!ekipa) return <div className="mx-auto max-w-3xl p-4"><Empty icon={SunHorizon} title="Nie masz przypisanej ekipy" hint="Lista „na jutro” jest dla ekipy. Poproś biuro o przypisanie do ekipy." /></div>;

  return (
    <section className="mx-auto grid max-w-3xl gap-5 px-4 py-4 desk:py-6">
      <div className="grid gap-3 rounded-2xl border border-line bg-card p-4 shadow-card">
        {admin ? (
          <Segmented label="Ekipa" value={ekipa} onChange={setCrew} options={crews.map((c) => ({ v: c.wartosc as string, label: c.wartosc as string }))} />
        ) : <p className="font-wide text-lg font-extrabold">{ekipa}</p>}
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="icon" aria-label="Poprzedni dzień" onClick={() => setDay(addDays(day, -1))}><CaretLeft className="h-5 w-5" /></Button>
          <p className="min-w-0 flex-1 text-center font-semibold first-letter:uppercase" aria-live="polite">{dayName(day)}</p>
          <Button variant="secondary" size="icon" aria-label="Następny dzień" onClick={() => setDay(addDays(day, 1))}><CaretRight className="h-5 w-5" /></Button>
        </div>
        {day !== next && <Button variant="ghost" size="sm" className="justify-self-center text-action" onClick={() => setDay(undefined)}>{next === addDays(today(), 1) ? 'Wróć do jutra' : 'Wróć do następnego dnia roboczego'}</Button>}
      </div>

      <Lists ekipa={ekipa} day={day} />
      <AddForm ekipa={ekipa} day={day} />

      {!list.length && <Empty icon={SunHorizon} title="Nic do zabrania" hint="Dopisz, co ekipa ma zabrać. Pozostali z ekipy dostaną powiadomienie." />}
      {open.length > 0 && (
        <div className="grid gap-2">
          <SectionTitle count={open.length}>Do zabrania</SectionTitle>
          <ul className="grid gap-2">{open.map((i) => <Item key={i.id} i={i} flash={i.id === flash} />)}</ul>
        </div>
      )}
      {taken.length > 0 && (
        <div className="grid gap-2">
          <SectionTitle count={taken.length}>Zabrane</SectionTitle>
          <ul className="grid gap-2">{taken.map((i) => <Item key={i.id} i={i} flash={i.id === flash} />)}</ul>
        </div>
      )}
    </section>
  );
}

function AddForm({ ekipa, day }: { ekipa: string; day: string }) {
  const me = useMe();
  const [t, setT] = useState('');
  const [err, setErr] = useState('');
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const tekst = t.trim();
    if (!tekst) return setErr('Wpisz, co zabrać');
    if (tekst.length > 500) return setErr('Tekst jest za długi');
    const body = { ekipa, dzien: day, tekst };
    void createVia('checklists', { kind: 'na-jutro', url: '/api/checklists', method: 'POST', body }, { ...body, zabrane: false, createdBy: me?.id })
      .catch((x: Error) => { setT((c) => c || tekst); setErr(x.message); });
    setT(''); setErr('');
  }
  return (
    <form onSubmit={submit} noValidate className="grid gap-1">
      <div className="flex gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Co zabrać</span>
          <Input value={t} onChange={(e) => setT(e.target.value)} placeholder="Co zabrać? Enter dodaje" enterKeyHint="send" aria-invalid={!!err} aria-describedby={err ? 'jutro-err' : undefined} />
        </label>
        <Button type="submit" aria-label="Dodaj"><Plus className="h-5 w-5" weight="bold" /><span className="hidden min-[420px]:inline">Dodaj</span></Button>
      </div>
      {err && <p id="jutro-err" className="text-sm text-danger">{err}</p>}
    </form>
  );
}

function Item({ i, flash }: { i: Rec; flash: boolean }) {
  const admin = useIsAdmin();
  const me = useMe();
  const names = useNames();
  const [edit, setEdit] = useState<string | null>(null);
  const toggle = (v: boolean) => void updateVia('checklists', i.id, v ? { zabrane: true, zabraneBy: me?.id, zabraneAt: new Date().toISOString() } : { zabrane: false, zabraneBy: null, zabraneAt: null },
    { kind: 'na-jutro', url: `/api/checklists/${i.id}/zabrane`, method: 'POST', body: { zabrane: v } }).catch(fail('Zmiana nie została zapisana'));
  const save = () => {
    const tekst = edit?.trim();
    setEdit(null);
    if (!tekst || tekst === i.tekst) return;
    void updateVia('checklists', i.id, { tekst }, { kind: 'na-jutro', url: `/api/checklists/${i.id}`, method: 'PUT', body: { tekst } }).catch(fail('Tekst nie został zmieniony'));
  };
  const remove = () => void outbox.enqueue({ kind: 'na-jutro', url: `/api/checklists/${i.id}`, method: 'DELETE', optimistic: (s) => s.remove('checklists', i.id) }).catch(fail('Nie usunięto pozycji'));
  const canDelete = (i.createdBy === me?.id || admin) && !i._tmp;

  return (
    <li id={`j-${i.id}`} data-flash={flash || undefined} className={cn('grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border bg-card py-3 pr-3 pl-2 transition-[box-shadow,border-color] duration-300', flash ? 'border-ok ring-4 ring-ok/25' : 'border-line')}>
      <label className={cn('grid h-14 w-14 place-items-center rounded-xl', !i._tmp && 'cursor-pointer hover:bg-ok/10')}>
        <Checkbox checked={!!i.zabrane} disabled={!!i._tmp} aria-label={`Zabrane: ${i.tekst}`} onCheckedChange={(v) => toggle(v === true)} className="h-9 w-9" />
      </label>
      {edit !== null ? (
        <form onSubmit={(e) => { e.preventDefault(); save(); }} className="flex min-w-0 gap-2">
          <Input value={edit} onChange={(e) => setEdit(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setEdit(null)} aria-label="Treść" autoFocus className="h-11" />
          <Button type="submit" size="icon" variant="ok" aria-label="Zapisz" className="h-11 w-11"><Check className="h-5 w-5" weight="bold" /></Button>
          <Button size="icon" variant="ghost" aria-label="Anuluj" onClick={() => setEdit(null)} className="h-11 w-11"><X className="h-5 w-5" /></Button>
        </form>
      ) : (
        <div className="min-w-0">
          <p className={cn('text-lg font-semibold leading-snug', i.zabrane && 'text-ink-2 line-through decoration-2')}>{i.tekst}</p>
          {i._tmp ? <p className="mt-0.5 text-sm text-ink-2">wysyłanie…</p> : (
            <div className="mt-1 grid gap-0.5 text-sm text-ink-2">
              <Who verb="dodał" id={i.createdBy} at={i.createdAt} name={names(i.createdBy)} />
              {i.zabrane && <Who verb="zabrał" id={i.zabraneBy} at={i.zabraneAt} name={names(i.zabraneBy)} />}
            </div>
          )}
        </div>
      )}
      <div className="flex">
        {admin && edit === null && !i._tmp && <Button variant="ghost" size="sm" aria-label={`Zmień: ${i.tekst}`} onClick={() => setEdit(i.tekst)} className="w-10 px-0 text-ink-2"><PencilSimple className="h-5 w-5 shrink-0" /></Button>}
        {canDelete && edit === null && <Button variant="ghost" size="sm" aria-label={`Usuń: ${i.tekst}`} onClick={remove} className="w-10 px-0 text-ink-2 hover:text-danger"><Trash className="h-5 w-5 shrink-0" /></Button>}
      </div>
    </li>
  );
}

function Who({ verb, id, at, name }: { verb: string; id?: string | null; at?: string | null; name: string }) {
  return <p className="flex min-w-0 items-center gap-1.5"><Avatar userId={id} name={name} size="xs" /><span className="min-w-0">{verb} {name}{at ? ` · ${fmtWhen(at)}` : ''}</span></p>;
}

/** Listy predefiniowane (18j): pasujące do zleceń dnia na górze (R45: pracownik – jego wiersz, admin – osoby z wybranej ekipy). Odhaczanie tylko w oknie; zamknięcie zeruje (nic nie idzie na serwer). */
function Lists({ ekipa, day }: { ekipa: string; day: string }) {
  const me = useMe();
  const admin = useIsAdmin();
  const templates = useEntities('checklist_templates');
  const entries = useEntities('schedule_entries');
  const people = useEntities('schedule_people');
  const users = useEntities('users');
  const jobs = useJobs();
  const [open, setOpen] = useState<string>();
  const ranked = useMemo(() => {
    const ek = new Map(users.map((u) => [u.id, u.ekipa as string | null | undefined]));
    const ids = dayJobIds(entries, people, day, jobs, admin ? (u) => ek.get(u) === ekipa : (u) => u === me?.id);
    return rankTemplates(templates, ids.map((id) => jobs.get(id)!));
  }, [templates, entries, people, users, jobs, day, ekipa, me?.id, admin]);
  if (!templates.length) return null;
  const cur = ranked.find((x) => x.t.id === open);
  const where = (j: JobView) => [j.client?.nazwa, j.site?.miejscowosc].filter(Boolean).join(' – ');
  return (
    <div className="grid gap-2">
      <SectionTitle count={templates.length}>Listy</SectionTitle>
      <ul className="grid gap-2 min-[560px]:grid-cols-2">
        {ranked.map(({ t, jobs: js }) => (
          <li key={t.id}>
            <button type="button" onClick={() => setOpen(t.id)} data-fits={js.length > 0 || undefined}
              className={cn('flex h-full w-full items-start gap-3 rounded-2xl border p-3 text-left transition-colors hover:border-ink-2', js.length ? 'border-action bg-action/8' : 'border-line bg-card')}>
              <ListChecks className={cn('mt-0.5 h-6 w-6 shrink-0', js.length ? 'text-action' : 'text-ink-2')} weight={js.length ? 'fill' : 'regular'} />
              <span className="grid min-w-0 gap-0.5">
                <span className="font-semibold leading-snug">{t.nazwa}</span>
                <span className="text-sm text-ink-2">{t.pozycje?.length ? `${t.pozycje.length} poz.` : 'bez pozycji'}</span>
                {js.length > 0 && <span className="text-sm font-semibold text-action [overflow-wrap:anywhere]">pasuje do: {js.map(where).join(', ')}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <Dialog open={!!cur} onOpenChange={(v) => !v && setOpen(undefined)}>
        {cur && <TemplateSheet t={cur.t} />}
      </Dialog>
    </div>
  );
}

function TemplateSheet({ t }: { t: Rec }) {
  const [done, setDone] = useState<Set<number>>(() => new Set()); // tylko w tym oknie
  const items: string[] = t.pozycje ?? [];
  const flip = (i: number) => setDone((d) => { const n = new Set(d); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  return (
    <Sheet title={t.nazwa} description={items.length ? `Odhaczone ${done.size} z ${items.length}. Po zamknięciu wszystko znowu do odhaczenia.` : 'Lista nie ma jeszcze pozycji. Dodaje je biuro w Ustawieniach.'}>
      <ul className="grid gap-1">
        {items.map((x, i) => (
          <li key={i}>
            <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-ink/5">
              <Checkbox checked={done.has(i)} onCheckedChange={() => flip(i)} className="h-7 w-7" />
              <span className={cn('min-w-0 [overflow-wrap:anywhere]', done.has(i) && 'text-ink-2 line-through')}>{x}</span>
            </label>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

