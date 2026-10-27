import { PODMIEJSCA } from '@etner/shared';
import { MagnifyingGlass, PencilSimple, Plus, Wrench } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { matches, useIsAdmin, useLoading, useMe } from '../../core/data.js';
import { outbox } from '../../core/outbox.js';
import { useEntities, type Rec } from '../../core/store.js';
import { Empty, SectionTitle } from '../../core/ui/bits.js';
import { Button } from '../../core/ui/button.js';
import { cn } from '../../core/ui/cn.js';
import { Field, Input } from '../../core/ui/input.js';
import { Search } from '../../core/ui/search.js';
import { Select } from '../../core/ui/select.js';
import { Dialog, Sheet } from '../../core/ui/sheet.js';
import { Skeleton } from '../../core/ui/skeleton.js';
import { toast } from '../../core/ui/toast.js';
import { createVia, updateVia, withoutEchoes } from '../../core/write.js';

const fail = (t: string) => (e: Error) => toast(t, { body: e.message, tone: 'error' });
const MAGAZYN = '__magazyn';
const W = { kind: 'narzedzia' } as const;
const byName = (a: Rec, b: Rec) => a.nazwa.localeCompare(b.nazwa, 'pl');

/** Miejsce narzędzia: „Mała Toyota · Górna półka na regale” albo „Magazyn” (R42: nazwa auta z listy aut). */
const placeOf = (t: Rec, cars: Map<string, Rec>) => (t.carId ? `${cars.get(t.carId)?.nazwa ?? 'Samochód'} · ${t.podmiejsce}` : 'Magazyn');

/** Stan narzędzi: wyszukiwanie po wszystkich miejscach, bez niego sekcje per miejsce (w aucie wg podmiejsca). */
export function Narzedzia() {
  const carsList = useEntities('cars');
  const raw = useEntities('tools');
  const tools = useMemo(() => withoutEchoes(raw, ['nazwa', 'carId', 'podmiejsce', 'by']), [raw]);
  const loading = useLoading();
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Rec | 'new' | null>(null);
  const cars = useMemo(() => [...carsList].filter((c) => !c._tmp).sort((a, b) => a.kolejnosc - b.kolejnosc || a.createdAt.localeCompare(b.createdAt)), [carsList]);
  const carMap = useMemo(() => new Map(cars.map((c) => [c.id, c])), [cars]);
  const found = useMemo(() => (q.trim() ? tools.filter((t) => matches(q, t.nazwa)).sort((a, b) => byName(a, b) || placeOf(a, carMap).localeCompare(placeOf(b, carMap), 'pl')) : null), [q, tools, carMap]);

  if (loading) return <div className="mx-auto grid max-w-3xl gap-3 p-4" aria-busy="true" aria-label="Wczytywanie narzędzi"><Skeleton className="h-12" />{[0, 1, 2].map((i) => <Skeleton key={i} className="h-40" />)}</div>;

  const open = (t: Rec) => setEdit(t);
  return (
    <section className="mx-auto grid max-w-3xl gap-5 px-4 py-4 desk:py-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <Search value={q} onChange={setQ} label="Szukaj narzędzia" placeholder="Szukaj, np. wkrętarka" />
        <Button onClick={() => setEdit('new')} aria-label="Dodaj narzędzie"><Plus className="h-5 w-5" weight="bold" /><span className="hidden min-[560px]:inline">Dodaj</span></Button>
      </div>
      {found ? (
        found.length ? (
          <div className="grid gap-2">
            <SectionTitle count={found.length}>Gdzie szukać</SectionTitle>
            <ul className="grid gap-2" aria-label="Wyniki wyszukiwania">{found.map((t) => <ToolRow key={t.id} t={t} place={placeOf(t, carMap)} onEdit={open} />)}</ul>
          </div>
        ) : <Empty icon={MagnifyingGlass} title="Nie ma takiego narzędzia" hint="Sprawdź pisownię albo dodaj narzędzie do miejsca, w którym leży." />
      ) : !tools.length ? (
        <Empty icon={Wrench} title="Lista narzędzi jest pusta" hint="Dodaj narzędzia z samochodów i Magazynu, żeby każdy wiedział, gdzie ich szukać." />
      ) : (
        <>
          {cars.map((c) => {
            const list = tools.filter((t) => t.carId === c.id);
            return (
              <div key={c.id} className="grid gap-2">
                <SectionTitle count={list.length}>{c.nazwa}</SectionTitle>
                {!list.length ? <p className="px-1 text-sm text-ink-2">Brak narzędzi w tym samochodzie.</p> : (
                  <div className="overflow-hidden rounded-2xl border border-line bg-card">
                    {PODMIEJSCA.map((pm) => {
                      const sub = list.filter((t) => t.podmiejsce === pm).sort(byName);
                      if (!sub.length) return null;
                      return (
                        <div key={pm} className="border-b border-line/70 last:border-b-0">
                          <h3 className="bg-bg/60 px-4 py-1.5 text-xs font-bold tracking-wide text-ink-2 uppercase">{pm}</h3>
                          <ul aria-label={`${c.nazwa} · ${pm}`} className="divide-y divide-line/70">{sub.map((t) => <ToolRow key={t.id} t={t} flat onEdit={open} />)}</ul>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {(() => {
            const list = tools.filter((t) => !t.carId).sort(byName);
            return (
              <div className="grid gap-2">
                <SectionTitle count={list.length}>Magazyn</SectionTitle>
                {list.length ? <ul aria-label="Magazyn" className="divide-y divide-line/70 overflow-hidden rounded-2xl border border-line bg-card">{list.map((t) => <ToolRow key={t.id} t={t} flat onEdit={open} />)}</ul>
                  : <p className="px-1 text-sm text-ink-2">Brak narzędzi w Magazynie.</p>}
              </div>
            );
          })()}
        </>
      )}
      {edit && <ToolForm tool={edit === 'new' ? undefined : edit} cars={cars} onClose={() => setEdit(null)} />}
    </section>
  );
}

function ToolRow({ t, place, flat, onEdit }: { t: Rec; place?: string; flat?: boolean; onEdit: (t: Rec) => void }) {
  return (
    <li className={cn('grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2 pr-2 pl-4', !flat && 'rounded-2xl border border-line bg-card')}>
      <div className="min-w-0">
        <p className="font-semibold leading-snug">{t.nazwa}</p>
        {place && <p className="text-sm text-ink-2">{place}</p>}
      </div>
      {t._tmp ? <span className="px-2 text-sm text-ink-2">wysyłanie…</span>
        : <Button variant="ghost" size="sm" aria-label={`Edytuj: ${t.nazwa}${place ? `, ${place}` : ''}`} onClick={() => onEdit(t)} className="w-10 px-0 text-ink-2"><PencilSimple className="h-5 w-5 shrink-0" /></Button>}
    </li>
  );
}

function ToolForm({ tool, cars, onClose }: { tool?: Rec; cars: Rec[]; onClose: () => void }) {
  const me = useMe();
  const admin = useIsAdmin();
  const [nazwa, setNazwa] = useState<string>(tool?.nazwa ?? '');
  const [miejsce, setMiejsce] = useState<string>(tool ? tool.carId ?? MAGAZYN : cars[0]?.id ?? MAGAZYN);
  const [pm, setPm] = useState<string>(tool?.podmiejsce ?? '');
  const [err, setErr] = useState<{ nazwa?: string; pm?: string }>({});
  const [confirm, setConfirm] = useState(false);
  const inCar = miejsce !== MAGAZYN;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = nazwa.trim();
    const errs = { nazwa: !n ? 'Wpisz nazwę narzędzia' : n.length > 200 ? 'Nazwa jest za długa' : undefined, pm: inCar && !pm ? 'Wybierz miejsce w samochodzie' : undefined };
    if (errs.nazwa || errs.pm) return setErr(errs);
    const body = { nazwa: n, carId: inCar ? miejsce : null, podmiejsce: inCar ? pm : null };
    const p = tool
      ? updateVia('tools', tool.id, body, { ...W, url: `/api/tools/${tool.id}`, method: 'PUT', body })
      : createVia('tools', { ...W, url: '/api/tools', method: 'POST', body }, { ...body, by: me?.id });
    void p.catch(fail('Narzędzie nie zostało zapisane'));
    onClose();
  }
  function remove() {
    if (!confirm) return setConfirm(true);
    void outbox.enqueue({ ...W, url: `/api/tools/${tool!.id}`, method: 'DELETE', optimistic: (s) => s.remove('tools', tool!.id) }).catch(fail('Nie usunięto narzędzia'));
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <Sheet title={tool ? 'Narzędzie' : 'Nowe narzędzie'}>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <Field label="Nazwa" error={err.nazwa}>{(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!err.nazwa} value={nazwa} onChange={(e) => setNazwa(e.target.value)} placeholder="np. Wkrętarka Makita" />}</Field>
          <Field label="Miejsce">{(id) => <Select id={id} value={miejsce} onValueChange={setMiejsce} options={[...cars.map((c) => ({ value: c.id as string, label: c.nazwa as string })), { value: MAGAZYN, label: 'Magazyn' }]} />}</Field>
          {inCar && <Field label="Gdzie w samochodzie" error={err.pm}>{(id, d) => <Select id={id} value={pm || undefined} onValueChange={setPm} placeholder="Wybierz półkę" options={PODMIEJSCA.map((x) => ({ value: x, label: x }))} />}</Field>}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            {tool && (tool.by === me?.id || admin) ? <Button variant={confirm ? 'danger' : 'ghost'} onClick={remove} className={cn(!confirm && 'text-danger')}>{confirm ? 'Na pewno usunąć?' : 'Usuń narzędzie'}</Button> : <span />}
            <div className="flex gap-3">
              <Button variant="secondary" onClick={onClose}>Anuluj</Button>
              <Button type="submit">Zapisz</Button>
            </div>
          </div>
        </form>
      </Sheet>
    </Dialog>
  );
}
