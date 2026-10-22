import { CaretLeft, CaretRight, Check, PencilSimple, Plus, SunHorizon, Trash, X } from '@phosphor-icons/react';
import { addDays } from '@etner/shared';
import { useEffect, useMemo, useState } from 'react';
import { dayLong, fmtWhen, today, useDict, useIsAdmin, useLoading, useMe, useNames } from '../../core/data.js';
import { outbox } from '../../core/outbox.js';
import { useEntities, type Rec } from '../../core/store.js';
import { Empty, Segmented, SectionTitle } from '../../core/ui/bits.js';
import { Button } from '../../core/ui/button.js';
import { Checkbox } from '../../core/ui/checkbox.js';
import { cn } from '../../core/ui/cn.js';
import { Input } from '../../core/ui/input.js';
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

/** Na jutro: lista ekipy na dzień (domyślnie jutro). Pracownik: tylko swoja ekipa; admin: dowolna. `#jutro~<id>` podświetla rzecz. */
export function NaJutro({ route }: { route: Route }) {
  const me = useMe();
  const admin = useIsAdmin();
  const loading = useLoading();
  const crews = useDict('ekipa').filter((d) => d.wartosc !== 'mieszane'); // „mieszane” to nie ekipa z własną listą
  const raw = useEntities('checklists');
  const items = useMemo(() => withoutEchoes(raw, ['ekipa', 'dzien', 'tekst']), [raw]);
  const [crewSel, setCrew] = useState<string>();
  const [day, setDay] = useState(() => addDays(today(), 1));
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
          <Button variant="secondary" size="icon" aria-label="Poprzedni dzień" onClick={() => setDay((d) => addDays(d, -1))}><CaretLeft className="h-5 w-5" /></Button>
          <p className="min-w-0 flex-1 text-center font-semibold first-letter:uppercase" aria-live="polite">{dayName(day)}</p>
          <Button variant="secondary" size="icon" aria-label="Następny dzień" onClick={() => setDay((d) => addDays(d, 1))}><CaretRight className="h-5 w-5" /></Button>
        </div>
        {day !== addDays(today(), 1) && <Button variant="ghost" size="sm" className="justify-self-center text-action" onClick={() => setDay(addDays(today(), 1))}>Wróć do jutra</Button>}
        <AddForm ekipa={ekipa} day={day} />
      </div>

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
          <p className="mt-0.5 text-sm text-ink-2">
            {i._tmp ? 'wysyłanie…' : i.zabrane ? `zabrał ${names(i.zabraneBy)}${i.zabraneAt ? `, ${fmtWhen(i.zabraneAt)}` : ''}` : `dodał ${names(i.createdBy)}, ${fmtWhen(i.createdAt)}`}
          </p>
        </div>
      )}
      <div className="flex">
        {admin && edit === null && !i._tmp && <Button variant="ghost" size="sm" aria-label={`Zmień: ${i.tekst}`} onClick={() => setEdit(i.tekst)} className="w-10 px-0 text-ink-2"><PencilSimple className="h-5 w-5 shrink-0" /></Button>}
        {canDelete && edit === null && <Button variant="ghost" size="sm" aria-label={`Usuń: ${i.tekst}`} onClick={remove} className="w-10 px-0 text-ink-2 hover:text-danger"><Trash className="h-5 w-5 shrink-0" /></Button>}
      </div>
    </li>
  );
}
