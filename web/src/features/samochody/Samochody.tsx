import { CalendarCheck, PencilSimple, Plus, Trash, Van, Wrench } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';
import { dayShort, fmtWhen, today, useCrewColor, useDict, useIsAdmin, useLoading, useMe, useNames } from '../../core/data.js';
import { outbox } from '../../core/outbox.js';
import { useEntities, type Rec } from '../../core/store.js';
import { Badge, Empty } from '../../core/ui/bits.js';
import { Button } from '../../core/ui/button.js';
import { cn } from '../../core/ui/cn.js';
import { Field, Input } from '../../core/ui/input.js';
import { Select } from '../../core/ui/select.js';
import { Dialog, Sheet } from '../../core/ui/sheet.js';
import { Skeleton } from '../../core/ui/skeleton.js';
import { toast } from '../../core/ui/toast.js';
import { createVia, updateVia, withoutEchoes } from '../../core/write.js';
import type { Route } from '../../routes.js';

const fail = (t: string) => (e: Error) => toast(t, { body: e.message, tone: 'error' });
const NONE = '__brak';
const W = { kind: 'samochody' } as const;

/** Samochody: auta z ekipą, usterki (zgłasza każdy), naprawy i usuwanie (admin). */
export function Samochody({ route }: { route: Route }) {
  const cars = useEntities('cars');
  const raw = useEntities('car_faults');
  const faults = useMemo(() => withoutEchoes(raw, ['carId', 'opis', 'by']), [raw]);
  const admin = useIsAdmin();
  const loading = useLoading();
  const [edit, setEdit] = useState<Rec | 'new' | null>(null);
  const [repair, setRepair] = useState<Rec | null>(null);
  const [flash, setFlash] = useState<string | undefined>();
  const hl = route.highlight;
  const hlFound = !!hl && faults.some((f) => f.id === hl);

  useEffect(() => {
    if (!hlFound) return;
    requestAnimationFrame(() => document.getElementById(`u-${hl}`)?.scrollIntoView({ block: 'center' }));
    setFlash(hl);
    const t = setTimeout(() => setFlash(undefined), 2500);
    return () => clearTimeout(t);
  }, [hl, hlFound]);

  const sorted = useMemo(() => [...cars].sort((a, b) => a.kolejnosc - b.kolejnosc || a.createdAt.localeCompare(b.createdAt)), [cars]);

  if (loading) return <div className="mx-auto grid max-w-3xl gap-3 p-4" aria-busy="true" aria-label="Wczytywanie samochodów">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-44" />)}</div>;

  return (
    <section className="mx-auto grid max-w-3xl gap-5 px-4 py-4 desk:py-6">
      {admin && <div className="flex justify-end"><Button variant="secondary" onClick={() => setEdit('new')}><Plus className="h-5 w-5" weight="bold" />Dodaj samochód</Button></div>}
      {!sorted.length && <Empty icon={Van} title="Nie ma jeszcze samochodów" hint="Administrator dodaje samochody i przypisuje je do ekip." />}
      {sorted.map((c) => <CarCard key={c.id} car={c} faults={faults.filter((f) => f.carId === c.id)} flash={flash} onEdit={admin ? () => setEdit(c) : undefined} onRepair={admin ? setRepair : undefined} />)}
      {edit && <CarForm car={edit === 'new' ? undefined : edit} count={cars.length} onClose={() => setEdit(null)} />}
      {repair && <RepairForm fault={repair} car={cars.find((c) => c.id === repair.carId)} onClose={() => setRepair(null)} />}
    </section>
  );
}

function CarCard({ car, faults, flash, onEdit, onRepair }: { car: Rec; faults: Rec[]; flash?: string; onEdit?: () => void; onRepair?: (f: Rec) => void }) {
  const crew = useCrewColor();
  const t = today();
  // bez terminu i z naprawą od dziś na górze, „po naprawie” na dole; w grupie najnowsze pierwsze
  const list = useMemo(() => [...faults].sort((a, b) => Number(isPast(a, t)) - Number(isPast(b, t)) || b.createdAt.localeCompare(a.createdAt)), [faults, t]);
  return (
    <article aria-label={car.nazwa} className="overflow-hidden rounded-2xl border border-line bg-card shadow-card">
      <header className="flex items-center gap-3 border-b border-line px-4 py-3" style={{ boxShadow: `inset 4px 0 0 ${crew(car.ekipa) ?? 'var(--line)'}` }}>
        <Van className="h-6 w-6 shrink-0 text-action" weight="duotone" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-wide text-lg font-extrabold leading-tight">{car.nazwa}</h2>
          <p className="text-sm text-ink-2">{car.ekipa ?? 'Bez ekipy'}</p>
        </div>
        {onEdit && !car._tmp && <Button variant="ghost" size="sm" aria-label={`Edytuj samochód ${car.nazwa}`} onClick={onEdit} className="w-10 px-0 text-ink-2"><PencilSimple className="h-5 w-5 shrink-0" /></Button>}
      </header>
      {list.length ? (
        <ul className="divide-y divide-line/70" aria-label={`Usterki: ${car.nazwa}`}>
          {list.map((f) => <Fault key={f.id} f={f} flash={f.id === flash} onRepair={onRepair} />)}
        </ul>
      ) : <p className="px-4 py-3 text-sm text-ink-2">Brak zgłoszonych usterek.</p>}
      {!car._tmp && <FaultForm car={car} />}
    </article>
  );
}

const isPast = (f: Rec, t: string) => !!f.naprawaDzien && f.naprawaDzien < t;

function Fault({ f, flash, onRepair }: { f: Rec; flash: boolean; onRepair?: (f: Rec) => void }) {
  const names = useNames();
  const t = today();
  const remove = () => void outbox.enqueue({ ...W, url: `/api/car-faults/${f.id}`, method: 'DELETE', optimistic: (s) => s.remove('car_faults', f.id) }).catch(fail('Nie usunięto usterki'));
  return (
    <li id={`u-${f.id}`} className={cn('grid scroll-m-24 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition-[box-shadow,background-color] duration-300 motion-reduce:transition-none', flash && 'bg-ok/10 ring-4 ring-inset ring-ok/30', isPast(f, t) && 'bg-bg/50')}>
      <div className="min-w-0">
        <p className="font-semibold leading-snug">{f.opis}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-2">
          <span>{names(f.by)}, {f._tmp ? 'wysyłanie…' : fmtWhen(f.createdAt)}</span>
          {f.naprawaDzien && (isPast(f, t)
            ? <Badge tone="ok">po naprawie</Badge>
            : <Badge tone="warn"><Wrench className="h-3.5 w-3.5" weight="bold" aria-hidden />naprawa {f.naprawaDzien === t ? 'dziś' : dayShort(f.naprawaDzien)}</Badge>)}
        </p>
      </div>
      {onRepair && !f._tmp && (
        <span className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => onRepair(f)} aria-label={`Naprawa: ${f.opis}`} className="text-action"><CalendarCheck className="h-5 w-5 shrink-0" /><span className="hidden min-[560px]:inline">Naprawa</span></Button>
          <Button variant="ghost" size="sm" aria-label={`Usuń usterkę: ${f.opis}`} onClick={remove} className="w-10 px-0 text-ink-2 hover:text-danger"><Trash className="h-5 w-5 shrink-0" /></Button>
        </span>
      )}
    </li>
  );
}

function FaultForm({ car }: { car: Rec }) {
  const me = useMe();
  const [opis, setOpis] = useState('');
  const [err, setErr] = useState('');
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const o = opis.trim();
    if (!o) return setErr('Opisz usterkę');
    if (o.length > 500) return setErr('Opis jest za długi');
    const body = { carId: car.id, opis: o };
    void createVia('car_faults', { ...W, url: '/api/car-faults', method: 'POST', body }, { ...body, by: me?.id, naprawaDzien: null })
      .catch((x: Error) => { setOpis((cur) => cur || o); setErr(x.message); });
    setOpis(''); setErr('');
  }
  return (
    <form onSubmit={submit} noValidate className="grid gap-2 border-t border-line bg-bg/40 px-4 py-3">
      <Field label="Nowa usterka" error={err}>
        {(id, d) => (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <Input id={id} aria-describedby={d} aria-invalid={!!err} value={opis} onChange={(e) => setOpis(e.target.value)} placeholder="np. zaświecił się check engine" enterKeyHint="send" />
            <Button type="submit" aria-label={`Zgłoś usterkę: ${car.nazwa}`}><Plus className="h-5 w-5" weight="bold" /><span className="hidden min-[560px]:inline">Zgłoś</span></Button>
          </div>
        )}
      </Field>
    </form>
  );
}

function CarForm({ car, count, onClose }: { car?: Rec; count: number; onClose: () => void }) {
  const ekipy = useDict('ekipa');
  const [nazwa, setNazwa] = useState<string>(car?.nazwa ?? '');
  const [ekipa, setEkipa] = useState<string>(car?.ekipa ?? NONE);
  const [err, setErr] = useState('');
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = nazwa.trim();
    if (!n) return setErr('Wpisz nazwę samochodu');
    if (n.length > 100) return setErr('Nazwa jest za długa');
    const body = { nazwa: n, ekipa: ekipa === NONE ? null : ekipa };
    const p = car
      ? updateVia('cars', car.id, body, { ...W, url: `/api/cars/${car.id}`, method: 'PUT', body })
      : createVia('cars', { ...W, url: '/api/cars', method: 'POST', body }, { ...body, kolejnosc: count });
    void p.catch(fail('Samochód nie został zapisany'));
    onClose();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <Sheet title={car ? 'Samochód' : 'Nowy samochód'} description="Ekipa auta: jej członkowie mają w harmonogramie oznaczony dzień naprawy.">
        <form onSubmit={submit} noValidate className="grid gap-4">
          <Field label="Nazwa" error={err}>{(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!err} value={nazwa} onChange={(e) => setNazwa(e.target.value)} />}</Field>
          <Field label="Ekipa">{(id) => <Select id={id} value={ekipa} onValueChange={setEkipa} options={[{ value: NONE, label: 'Bez ekipy' }, ...ekipy.map((d) => ({ value: d.wartosc as string, label: d.wartosc as string }))]} />}</Field>
          <div className="flex justify-end gap-3 border-t border-line pt-4">
            <Button variant="secondary" onClick={onClose}>Anuluj</Button>
            <Button type="submit">Zapisz</Button>
          </div>
        </form>
      </Sheet>
    </Dialog>
  );
}

function RepairForm({ fault, car, onClose }: { fault: Rec; car?: Rec; onClose: () => void }) {
  const [dzien, setDzien] = useState<string>(fault.naprawaDzien ?? today());
  const [err, setErr] = useState('');
  const save = (naprawaDzien: string | null) => {
    const body = { naprawaDzien };
    void updateVia('car_faults', fault.id, body, { ...W, url: `/api/car-faults/${fault.id}`, method: 'PUT', body }).catch(fail('Naprawa nie została zapisana'));
    onClose();
  };
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dzien)) return setErr('Wybierz dzień naprawy');
    save(dzien);
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <Sheet title="Naprawa" description={`${car?.nazwa ?? 'Samochód'}: ${fault.opis}. Wszyscy dostaną powiadomienie, a ekipa auta oznaczenie w harmonogramie.`}>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <Field label="Dzień naprawy" error={err}>{(id, d) => <Input id={id} type="date" aria-describedby={d} aria-invalid={!!err} value={dzien} onChange={(e) => setDzien(e.target.value)} />}</Field>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            {fault.naprawaDzien ? <Button variant="ghost" className="text-danger" onClick={() => save(null)}>Odwołaj naprawę</Button> : <span />}
            <div className="flex gap-3">
              <Button variant="secondary" onClick={onClose}>Anuluj</Button>
              <Button type="submit">Zaplanuj</Button>
            </div>
          </div>
        </form>
      </Sheet>
    </Dialog>
  );
}
