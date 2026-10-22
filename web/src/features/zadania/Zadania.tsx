import { ArrowsClockwise, ListChecks, PencilSimple, Plus, User, X } from '@phosphor-icons/react';
import { CYKLE, nextTermin, type Cykl } from '@etner/shared';
import { useMemo, useState } from 'react';
import { fmtDay, today, useDict, useLoading } from '../../core/data.js';
import { outbox } from '../../core/outbox.js';
import { useEntities, useEntity, type Rec } from '../../core/store.js';
import { Combobox } from '../../core/ui/combobox.js';
import { Badge, Empty, SectionTitle, Textarea } from '../../core/ui/bits.js';
import { Button } from '../../core/ui/button.js';
import { Checkbox } from '../../core/ui/checkbox.js';
import { cn } from '../../core/ui/cn.js';
import { Field, Input } from '../../core/ui/input.js';
import { Select } from '../../core/ui/select.js';
import { Dialog, Sheet } from '../../core/ui/sheet.js';
import { Skeleton } from '../../core/ui/skeleton.js';
import { toast } from '../../core/ui/toast.js';
import { createVia, updateVia, withoutEchoes } from '../../core/write.js';
import { DONE, isDone, isLate, taskGroups } from './model.js';

/** Optymistycznie jak serwer: cykliczne „Zrobione” wraca do pierwszego statusu, z cyklem termin = dziś + cykl. */
const doneCyclic = (first: string | undefined, cykl: Cykl | null, day: string) => ({ status: first, ostatnio: day, ...(cykl && { termin: nextTermin(day, cykl) }) });
const fail = (t: string) => (e: Error) => toast(t, { body: e.message, tone: 'error' });
const NONE = '-';
const put = (t: Rec, optimistic: Record<string, unknown>, body: Record<string, unknown>) =>
  updateVia('tasks', t.id, optimistic, { kind: 'zadania', url: `/api/tasks/${t.id}`, method: 'PUT', body });

/** Zadania biura (admin): grupy ze słownika, priorytet, termin (zaległy na czerwono), cykliczne. */
export function Zadania() {
  const raw = useEntities('tasks');
  const tasks = useMemo(() => withoutEchoes(raw, ['tekst', 'grupa']), [raw]);
  const grupy = useDict('grupa_zadan');
  const loading = useLoading();
  const [doneOpen, setDoneOpen] = useState(false);
  const [editing, setEditing] = useState<Rec | null>(null);
  const { groups, done } = useMemo(() => taskGroups(tasks, grupy.map((g) => g.wartosc as string)), [tasks, grupy]);

  if (loading) return <div className="mx-auto grid max-w-3xl gap-3 p-4" aria-busy="true" aria-label="Wczytywanie zadań"><Skeleton className="h-28" />{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>;

  return (
    <section className="mx-auto grid max-w-3xl gap-5 px-4 py-4 desk:py-6">
      <AddForm />
      {!tasks.length && <Empty icon={ListChecks} title="Nie ma zadań" hint="Dopisz sprawę do załatwienia. Cykliczne wracają po oznaczeniu jako zrobione." />}
      {groups.map(({ grupa, list }) => (
        <div key={grupa} className="grid gap-2">
          <SectionTitle count={list.length}>{grupa || 'Bez grupy'}</SectionTitle>
          <ul className="grid gap-2">{list.map((t) => <Task key={t.id} t={t} onEdit={() => setEditing(t)} />)}</ul>
        </div>
      ))}
      {done.length > 0 && (
        <div className="grid gap-2">
          <SectionTitle count={done.length} toggle={{ open: doneOpen, onToggle: () => setDoneOpen((o) => !o) }}>Zrobione</SectionTitle>
          {doneOpen && <ul className="grid gap-2">{done.map((t) => <Task key={t.id} t={t} onEdit={() => setEditing(t)} />)}</ul>}
        </div>
      )}
      {editing && <TaskForm task={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

function AddForm() {
  const grupy = useDict('grupa_zadan');
  const first = useDict('status_zadania')[0]?.wartosc;
  const [t, setT] = useState('');
  const [grupa, setGrupa] = useState<string>();
  const [err, setErr] = useState('');
  const g = grupa ?? grupy[0]?.wartosc ?? '';
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const tekst = t.trim();
    if (!tekst) return setErr('Wpisz treść zadania');
    if (tekst.length > 500) return setErr('Tekst jest za długi');
    const body = { tekst, grupa: g };
    void createVia('tasks', { kind: 'zadania', url: '/api/tasks', method: 'POST', body }, { ...body, status: first, priorytet: null, termin: null, cykliczne: false, cykl: null, clientId: null })
      .catch((x: Error) => { setT((c) => c || tekst); setErr(x.message); });
    setT(''); setErr('');
  }
  return (
    <form onSubmit={submit} noValidate className="grid gap-3 rounded-2xl border border-line bg-card p-4 shadow-card">
      <Field label="Nowe zadanie" error={err}>
        {(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!err} value={t} onChange={(e) => setT(e.target.value)} placeholder="Co trzeba załatwić? Enter dodaje" enterKeyHint="send" />}
      </Field>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
        <Select aria-label="Grupa" value={g || undefined} onValueChange={setGrupa} options={grupy.map((x) => ({ value: x.wartosc, label: x.wartosc }))} placeholder="Grupa" />
        <Button type="submit"><Plus className="h-5 w-5" weight="bold" />Dodaj</Button>
      </div>
    </form>
  );
}

function Task({ t, onEdit }: { t: Rec; onEdit: () => void }) {
  const statusy = useDict('status_zadania');
  const first = statusy[0]?.wartosc;
  const day = today();
  const done = isDone(t);
  const late = isLate(t, day);
  const client = useEntity('clients', t.clientId ?? undefined);
  // cykliczne „Zrobione”: serwer wraca do pierwszego statusu i zapisuje `ostatnio`
  const toggle = (v: boolean) => void put(t, v ? (t.cykliczne ? doneCyclic(first, t.cykl, day) : { status: DONE }) : { status: first }, { status: v ? DONE : first })
    .then(() => v && t.cykliczne && toast('Zrobione, zadanie wraca na listę', { body: 'To zadanie cykliczne.', tone: 'ok' }), fail('Zmiana nie została zapisana'));
  return (
    <li className={cn('grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border bg-card py-3 pr-3 pl-2', late ? 'border-danger/60' : 'border-line')}>
      <label className={cn('grid h-12 w-12 place-items-center rounded-xl', !t._tmp && 'cursor-pointer hover:bg-ok/10')}>
        <Checkbox checked={done} disabled={!!t._tmp} aria-label={`Zrobione: ${t.tekst}`} onCheckedChange={(v) => toggle(v === true)} className="h-8 w-8" />
      </label>
      <div className="min-w-0">
      <button type="button" onClick={onEdit} disabled={!!t._tmp} className="block w-full min-w-0 text-left">
        <span className={cn('block font-semibold leading-snug', done && 'text-ink-2 line-through decoration-2')}>{t.tekst}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-2">
          {t.priorytet != null && <Badge tone={t.priorytet === 1 ? 'ink' : 'line'}>P{t.priorytet}</Badge>}
          {t.status !== first && !done && <Badge tone="action">{t.status}</Badge>}
          {t.termin && <span className={cn(late && 'font-bold text-danger')}>{late ? 'po terminie ' : 'termin '}{t.termin === day ? 'dziś' : fmtDay(t.termin)}</span>}
          {t.cykliczne && <span className="inline-flex items-center gap-1"><ArrowsClockwise className="h-4 w-4" aria-hidden />{t.cykl ? CYKLE[t.cykl as Cykl] : 'cykliczne'}{t.ostatnio ? `, ostatnio ${fmtDay(t.ostatnio)}` : ''}</span>}
          {t._tmp && <span>wysyłanie…</span>}
        </span>
      </button>
      {client && <a href={`#kl/${client.id}`} className="mt-1 inline-flex min-h-8 items-center gap-1 text-sm font-semibold text-action"><User className="h-4 w-4" aria-hidden />{client.nazwa}</a>}
      </div>
      <Button variant="ghost" size="sm" aria-label={`Edytuj: ${t.tekst}`} onClick={onEdit} disabled={!!t._tmp} className="w-10 px-0 text-ink-2"><PencilSimple className="h-5 w-5 shrink-0" /></Button>
    </li>
  );
}

function TaskForm({ task, onClose }: { task: Rec; onClose: () => void }) {
  const grupy = useDict('grupa_zadan');
  const statusy = useDict('status_zadania');
  const [f, setF] = useState({
    tekst: task.tekst as string, grupa: (task.grupa as string) || NONE, status: task.status as string, priorytet: task.priorytet == null ? NONE : String(task.priorytet),
    termin: (task.termin as string | null) ?? '', cykliczne: !!task.cykliczne, cykl: (task.cykl as string | null) ?? NONE, clientId: (task.clientId as string | null) ?? '', uwagi: (task.uwagi as string) ?? '',
  });
  const [err, setErr] = useState('');
  const [confirm, setConfirm] = useState(false);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const opts = (d: Rec[]) => d.map((x) => ({ value: x.wartosc as string, label: x.wartosc as string }));
  const clients = useEntities('clients');
  const clientOpts = useMemo(() => [...clients].sort((a, b) => a.nazwa.localeCompare(b.nazwa, 'pl')).map((c) => ({ value: c.id, label: c.nazwa as string })), [clients]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.tekst.trim()) return setErr('Wpisz treść zadania');
    const body = { tekst: f.tekst.trim(), grupa: f.grupa === NONE ? '' : f.grupa, status: f.status, priorytet: f.priorytet === NONE ? null : Number(f.priorytet), termin: f.termin || null, cykliczne: f.cykliczne, cykl: f.cykliczne && f.cykl !== NONE ? f.cykl as Cykl : null, clientId: f.clientId || null, uwagi: f.uwagi.trim() };
    const optimistic = body.status === DONE && body.cykliczne ? { ...body, ...doneCyclic(statusy[0]?.wartosc, body.cykl, today()) } : body;
    void put(task, optimistic, body).catch(fail('Zadanie nie zostało zapisane'));
    onClose();
  }
  function remove() {
    if (!confirm) return setConfirm(true);
    void outbox.enqueue({ kind: 'zadania', url: `/api/tasks/${task.id}`, method: 'DELETE', optimistic: (s) => s.remove('tasks', task.id) }).catch(fail('Nie usunięto zadania'));
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <Sheet title="Zadanie">
        <form onSubmit={submit} noValidate className="grid gap-4">
          <Field label="Treść" error={err}>{(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!err} value={f.tekst} onChange={(e) => set({ tekst: e.target.value })} />}</Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Grupa">{(id) => <Select id={id} value={f.grupa} onValueChange={(grupa) => set({ grupa })} options={[{ value: NONE, label: 'Bez grupy' }, ...opts(grupy)]} />}</Field>
            <Field label="Status">{(id) => <Select id={id} value={f.status} onValueChange={(status) => set({ status })} options={opts(statusy)} />}</Field>
            <Field label="Priorytet">{(id) => <Select id={id} value={f.priorytet} onValueChange={(priorytet) => set({ priorytet })} options={[{ value: NONE, label: 'Brak' }, ...['1', '2', '3', '4', '5'].map((p) => ({ value: p, label: p === '1' ? '1 (najważniejsze)' : p }))]} />}</Field>
            <Field label="Termin">{(id) => <Input id={id} type="date" value={f.termin} onChange={(e) => set({ termin: e.target.value })} />}</Field>
          </div>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 font-semibold">
            <Checkbox checked={f.cykliczne} onCheckedChange={(v) => set({ cykliczne: v === true })} aria-label="Cykliczne" />
            <span>Cykliczne <span className="block text-sm font-normal text-ink-2">Po oznaczeniu jako zrobione wraca na listę, zapisuje się data.</span></span>
          </label>
          {f.cykliczne && (
            <Field label="Cykl" hint={f.cykl === NONE ? 'Termin się nie zmienia.' : 'Po zrobieniu termin = dziś + cykl.'}>
              {(id, d) => <Select id={id} aria-describedby={d} value={f.cykl} onValueChange={(cykl) => set({ cykl })} options={[{ value: NONE, label: 'Bez cyklu' }, ...Object.entries(CYKLE).map(([value, label]) => ({ value, label }))]} />}
            </Field>
          )}
          <Field label="Klient">
            {(id) => (
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <Combobox id={id} value={f.clientId} onValueChange={(clientId) => set({ clientId })} options={clientOpts} placeholder="Bez klienta" search="Nazwisko, firma" empty="Nie ma takiego klienta." />
                {f.clientId && <Button variant="ghost" size="icon" aria-label="Usuń klienta z zadania" onClick={() => set({ clientId: '' })}><X className="h-5 w-5" /></Button>}
              </div>
            )}
          </Field>
          {task.ostatnio && <p className="text-sm text-ink-2">Ostatnio zrobione: {fmtDay(task.ostatnio)}</p>}
          <Field label="Uwagi">{(id) => <Textarea id={id} value={f.uwagi} onChange={(e) => set({ uwagi: e.target.value })} className="min-h-20" />}</Field>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <Button variant={confirm ? 'danger' : 'ghost'} onClick={remove} className={cn(!confirm && 'text-danger')}>{confirm ? 'Na pewno usunąć?' : 'Usuń zadanie'}</Button>
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
