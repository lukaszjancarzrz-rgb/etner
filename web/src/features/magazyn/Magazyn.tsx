import { ArrowUUpLeft, HandGrabbing, MagnifyingGlass, Package, Plus, Trash } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { fmtWhen, matches, useIsAdmin, useLoading, useMe, useNames } from '../../core/data.js';
import { outbox } from '../../core/outbox.js';
import { useEntities, type Rec } from '../../core/store.js';
import { Empty, SectionTitle } from '../../core/ui/bits.js';
import { Button } from '../../core/ui/button.js';
import { cn } from '../../core/ui/cn.js';
import { Field, Input } from '../../core/ui/input.js';
import { Search } from '../../core/ui/search.js';
import { Dialog, Sheet } from '../../core/ui/sheet.js';
import { Skeleton } from '../../core/ui/skeleton.js';
import { toast } from '../../core/ui/toast.js';
import { createVia, updateVia, withoutEchoes } from '../../core/write.js';

const fail = (t: string) => (e: Error) => toast(t, { body: e.message, tone: 'error' });
const W = { kind: 'magazyn' } as const;

/** Nietypowe rzeczy na magazynie: lista, „Zabrane” pod spodem (znikają po 7 dniach), wyszukiwanie w obu. */
export function Magazyn() {
  const raw = useEntities('warehouse_items');
  const items = useMemo(() => withoutEchoes(raw, ['nazwa', 'ilosc', 'by']), [raw]);
  const loading = useLoading();
  const [q, setQ] = useState('');
  const [ret, setRet] = useState<Rec | null>(null);
  const shown = useMemo(() => (q.trim() ? items.filter((i) => matches(q, i.nazwa, i.ilosc)) : items), [items, q]);
  const lying = useMemo(() => shown.filter((i) => !i.zabraneAt).sort((a, b) => a.nazwa.localeCompare(b.nazwa, 'pl')), [shown]);
  const taken = useMemo(() => shown.filter((i) => i.zabraneAt).sort((a, b) => b.zabraneAt.localeCompare(a.zabraneAt)), [shown]);

  if (loading) return <div className="mx-auto grid max-w-3xl gap-3 p-4" aria-busy="true" aria-label="Wczytywanie magazynu"><Skeleton className="h-12" /><Skeleton className="h-32" />{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>;

  return (
    <section className="mx-auto grid max-w-3xl gap-5 px-4 py-4 desk:py-6">
      <Search value={q} onChange={setQ} label="Szukaj na magazynie" placeholder="Szukaj, np. kołki" />
      <AddForm />
      {!items.length ? <Empty icon={Package} title="Na magazynie nic nie jest zapisane" hint="Dopisz nietypowe rzeczy, które zostały, żeby każdy wiedział, co można zabrać." />
        : !shown.length ? <Empty icon={MagnifyingGlass} title="Nic nie pasuje do wyszukiwania" hint="Sprawdź pisownię albo wyczyść wyszukiwanie." />
          : (
            <>
              <div className="grid gap-2">
                <SectionTitle count={lying.length}>Na magazynie</SectionTitle>
                {lying.length ? <ul aria-label="Na magazynie" className="grid gap-2">{lying.map((i) => <Item key={i.id} i={i} />)}</ul>
                  : <p className="px-1 text-sm text-ink-2">{q.trim() ? 'Na magazynie nic nie pasuje.' : 'Wszystko zabrane.'}</p>}
              </div>
              {!!taken.length && (
                <div className="grid gap-2">
                  <SectionTitle count={taken.length} className="border-ink-2">Zabrane</SectionTitle>
                  <p className="-mt-1 px-1 text-sm text-ink-2">Po 7 dniach znikają z listy.</p>
                  <ul aria-label="Zabrane" className="grid gap-2">{taken.map((i) => <Item key={i.id} i={i} onReturn={() => setRet(i)} />)}</ul>
                </div>
              )}
            </>
          )}
      {ret && <ReturnForm item={ret} onClose={() => setRet(null)} />}
    </section>
  );
}

function AddForm() {
  const me = useMe();
  const [nazwa, setNazwa] = useState('');
  const [ilosc, setIlosc] = useState('');
  const [err, setErr] = useState('');
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = nazwa.trim(), il = ilosc.trim();
    if (!n) return setErr('Wpisz, co leży na magazynie');
    if (n.length > 200) return setErr('Nazwa jest za długa');
    const body = { nazwa: n, ilosc: il };
    void createVia('warehouse_items', { ...W, url: '/api/warehouse', method: 'POST', body }, { ...body, by: me?.id, zabraneAt: null })
      .catch((x: Error) => { setNazwa((c) => c || n); setIlosc((c) => c || il); setErr(x.message); });
    setNazwa(''); setIlosc(''); setErr('');
  }
  return (
    <form onSubmit={submit} noValidate className="grid gap-3 rounded-2xl border border-line bg-card p-4 shadow-card min-[560px]:grid-cols-[minmax(0,1fr)_11rem_auto] min-[560px]:items-start">
      <Field label="Co leży" error={err}>
        {(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!err} value={nazwa} onChange={(e) => setNazwa(e.target.value)} placeholder="np. Kołki rozporowe 8 mm" />}
      </Field>
      <Field label="Ilość">{(id) => <Input id={id} value={ilosc} onChange={(e) => setIlosc(e.target.value)} placeholder="np. pudełko" maxLength={100} />}</Field>
      <Button type="submit" className="min-[560px]:mt-7"><Plus className="h-5 w-5" weight="bold" />Dodaj</Button>
    </form>
  );
}

function Item({ i, onReturn }: { i: Rec; onReturn?: () => void }) {
  const me = useMe();
  const admin = useIsAdmin();
  const names = useNames();
  const take = () => {
    const patch = { zabraneAt: new Date().toISOString(), zabraneBy: me?.id };
    void updateVia('warehouse_items', i.id, patch, { ...W, url: `/api/warehouse/${i.id}/take`, method: 'POST', body: {} }).catch(fail('Nie zapisano zabrania'));
  };
  const remove = () => void outbox.enqueue({ ...W, url: `/api/warehouse/${i.id}`, method: 'DELETE', optimistic: (s) => s.remove('warehouse_items', i.id) }).catch(fail('Nie usunięto rzeczy'));
  const gone = !!i.zabraneAt;
  return (
    <li className={cn('grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-2xl border py-2.5 pr-2 pl-4', gone ? 'border-transparent bg-ink-2/12 text-ink-2' : 'border-line bg-card')}>
      <div className="min-w-0">
        <p className={cn('font-semibold leading-snug', gone ? 'text-ink-2' : 'text-ink')}>{i.nazwa}{i.ilosc && <span className="font-normal text-ink-2"> · {i.ilosc}</span>}</p>
        <p className="mt-0.5 text-sm text-ink-2">
          {i._tmp ? 'wysyłanie…' : gone ? `Zabrał ${names(i.zabraneBy)}, ${fmtWhen(i.zabraneAt)}` : `Dodał ${names(i.by)}, ${fmtWhen(i.createdAt)}`}
        </p>
      </div>
      {!i._tmp && (
        <span className="flex items-center gap-1">
          {gone
            ? <Button variant="secondary" size="sm" onClick={onReturn} aria-label={`Zwracam: ${i.nazwa}`}><ArrowUUpLeft className="h-5 w-5" />Zwracam</Button>
            : <Button variant="secondary" size="sm" onClick={take} aria-label={`Zabieram: ${i.nazwa}`}><HandGrabbing className="h-5 w-5" />Zabieram</Button>}
          {(i.by === me?.id || admin) ? <Button variant="ghost" size="sm" aria-label={`Usuń: ${i.nazwa}`} onClick={remove} className="w-10 px-0 text-ink-2 hover:text-danger"><Trash className="h-5 w-5 shrink-0" /></Button>
            : <span className="w-10" aria-hidden />}
        </span>
      )}
    </li>
  );
}

function ReturnForm({ item, onClose }: { item: Rec; onClose: () => void }) {
  const [ilosc, setIlosc] = useState<string>(item.ilosc ?? '');
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = { ilosc: ilosc.trim() };
    void updateVia('warehouse_items', item.id, { ...body, zabraneAt: null, zabraneBy: null }, { ...W, url: `/api/warehouse/${item.id}/return`, method: 'POST', body })
      .catch(fail('Nie zapisano zwrotu'));
    onClose();
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <Sheet title="Zwracam" description={`${item.nazwa} wraca na magazyn. Wpisz, ile zostało.`}>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <Field label="Ilość">{(id) => <Input id={id} value={ilosc} onChange={(e) => setIlosc(e.target.value)} maxLength={100} autoFocus />}</Field>
          <div className="flex justify-end gap-3 border-t border-line pt-4">
            <Button variant="secondary" onClick={onClose}>Anuluj</Button>
            <Button type="submit">Zwracam</Button>
          </div>
        </form>
      </Sheet>
    </Dialog>
  );
}
