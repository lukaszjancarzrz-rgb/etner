import { Plus, ShoppingCart, Trash } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';
import { fmtWhen, useDict, useIsAdmin, useLoading, useMe, useNames } from '../../core/data.js';
import { outbox } from '../../core/outbox.js';
import { useEntities, type Rec } from '../../core/store.js';
import { Empty, SectionTitle } from '../../core/ui/bits.js';
import { Button } from '../../core/ui/button.js';
import { cn } from '../../core/ui/cn.js';
import { Field, Input } from '../../core/ui/input.js';
import { Select } from '../../core/ui/select.js';
import { Skeleton } from '../../core/ui/skeleton.js';
import { toast } from '../../core/ui/toast.js';
import { createVia, updateVia, withoutEchoes } from '../../core/write.js';
import type { Route } from '../../routes.js';

const fail = (t: string) => (e: Error) => toast(t, { body: e.message, tone: 'error' });

/** Zakupy: dodawanie, sekcje wg statusu (ostatni, „Kupione”, zwinięty). */
export function Zakupy({ route }: { route: Route }) {
  const raw = useEntities('shopping');
  const items = useMemo(() => withoutEchoes(raw, ['co', 'by']), [raw]);
  const statusy = useDict('status_zakupu');
  const loading = useLoading();
  const [doneOpen, setDoneOpen] = useState(false);
  const [flash, setFlash] = useState<string | undefined>();
  const last = statusy.at(-1)?.wartosc;
  const hl = route.highlight;
  const hlStatus = hl && items.find((i) => i.id === hl)?.status;

  useEffect(() => {
    if (!hlStatus) return;
    if (hlStatus === last) setDoneOpen(true);
    requestAnimationFrame(() => document.getElementById(`z-${hl}`)?.scrollIntoView({ block: 'center' }));
    setFlash(hl);
    const t = setTimeout(() => setFlash(undefined), 2500); // jak w dzienniku
    return () => clearTimeout(t);
  }, [hl, hlStatus, last]);

  const groups = useMemo(() => statusy.map((s) => ({
    status: s.wartosc as string,
    list: items.filter((i) => i.status === s.wartosc).sort((a, b) => (s.wartosc === last ? (b.kupioneAt ?? b.updatedAt).localeCompare(a.kupioneAt ?? a.updatedAt) : a.createdAt.localeCompare(b.createdAt))),
  })), [items, statusy, last]);

  if (loading) return <div className="mx-auto grid max-w-3xl gap-3 p-4" aria-busy="true" aria-label="Wczytywanie zakupów"><Skeleton className="h-40" />{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>;

  return (
    <section className="mx-auto grid max-w-3xl gap-5 px-4 py-4 desk:py-6">
      <AddForm />
      {!items.length && <Empty icon={ShoppingCart} title="Lista zakupów jest pusta" hint="Dopisz, czego brakuje na budowie. Biuro dostanie powiadomienie." />}
      {groups.map(({ status, list }) => {
        if (!list.length) return null;
        const collapsible = status === last;
        const shut = collapsible && !doneOpen;
        return (
          <div key={status} className="grid gap-2">
            <SectionTitle count={list.length} toggle={collapsible ? { open: !shut, onToggle: () => setDoneOpen((o) => !o) } : undefined}>{status}</SectionTitle>
            {!shut && <ul className="grid gap-2">{list.map((i) => <Item key={i.id} i={i} statusy={statusy} flash={i.id === flash} />)}</ul>}
          </div>
        );
      })}
    </section>
  );
}

function AddForm() {
  const first = useDict('status_zakupu')[0]?.wartosc;
  const me = useMe();
  const [co, setCo] = useState('');
  const [uwagi, setUwagi] = useState('');
  const [err, setErr] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const c = co.trim();
    if (!c) return setErr('Wpisz, co kupić');
    if (c.length > 300) return setErr('Tekst jest za długi');
    const u = uwagi.trim();
    const body = { co: c, uwagi: u };
    void createVia('shopping', { kind: 'zakupy', url: '/api/shopping', method: 'POST', body }, { ...body, status: first, by: me?.id })
      .catch((x: Error) => { setCo((cur) => cur || c); setUwagi((cur) => cur || u); setErr(x.message); });
    setCo(''); setUwagi(''); setErr('');
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-3 rounded-2xl border border-line bg-card p-4 shadow-card">
      <Field label="Co kupić" error={err}>
        {(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!err} value={co} onChange={(e) => setCo(e.target.value)} placeholder="np. Kolanka 160 mm, 10 szt." enterKeyHint="send" />}
      </Field>
      <div className="grid gap-3 min-[560px]:grid-cols-[1fr_auto] min-[560px]:items-end">
        <Field label="Uwagi">{(id) => <Input id={id} value={uwagi} onChange={(e) => setUwagi(e.target.value)} placeholder="opcjonalnie, np. sklep albo rozmiar" />}</Field>
        <Button type="submit"><Plus className="h-5 w-5" weight="bold" />Dodaj</Button>
      </div>
    </form>
  );
}

function Item({ i, statusy, flash }: { i: Rec; statusy: Rec[]; flash: boolean }) {
  const admin = useIsAdmin();
  const me = useMe();
  const names = useNames();
  const put = (patch: Record<string, unknown>) => updateVia('shopping', i.id, patch, { kind: 'zakupy', url: `/api/shopping/${i.id}`, method: 'PUT', body: patch }).catch(fail('Zmiana nie została zapisana'));
  const remove = () => void outbox.enqueue({ kind: 'zakupy', url: `/api/shopping/${i.id}`, method: 'DELETE', optimistic: (s) => s.remove('shopping', i.id) }).catch(fail('Nie usunięto pozycji'));

  return (
    <li id={`z-${i.id}`} className={cn('grid gap-3 rounded-2xl border bg-card p-4 transition-[box-shadow,border-color] duration-300 min-[560px]:grid-cols-[minmax(0,1fr)_auto] min-[560px]:items-center', flash ? 'border-ok ring-4 ring-ok/25' : 'border-line')}>
      <div className="min-w-0">
        <p className="font-semibold leading-snug">{i.co}</p>
        <p className="mt-0.5 text-sm text-ink-2">
          {[i.uwagi, `${names(i.by)}, ${i._tmp ? 'wysyłanie…' : fmtWhen(i.createdAt)}`].filter(Boolean).join(', ')}
        </p>
      </div>
      <div className={cn('grid items-start gap-2', admin && !i._tmp ? 'grid-cols-[minmax(0,1fr)_2.5rem] min-[560px]:grid-cols-[10rem_2.5rem]' : 'grid-cols-[2.5rem]')}>
        {admin && !i._tmp && (
          <Select value={i.status} aria-label={`Status: ${i.co}`} onValueChange={(status) => void put({ status })} options={statusy.map((s) => ({ value: s.wartosc, label: s.wartosc }))} className="h-10 text-sm" />
        )}
        {(i.by === me?.id || admin) && !i._tmp && (
          <Button variant="ghost" size="sm" aria-label={`Usuń: ${i.co}`} onClick={remove} className="w-10 px-0 text-ink-2 hover:text-danger"><Trash className="h-5 w-5 shrink-0" /></Button>
        )}
      </div>
    </li>
  );
}
