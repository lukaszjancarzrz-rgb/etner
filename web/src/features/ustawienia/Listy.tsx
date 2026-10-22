import { ArrowDown, ArrowUp, ListChecks, Plus, Trash } from '@phosphor-icons/react';
import { useMemo, useState, type FormEvent } from 'react';
import { ApiError, api } from '../../core/api.js';
import { useDict } from '../../core/data.js';
import { store, useEntities, type Rec } from '../../core/store.js';
import { Button } from '../../core/ui/button.js';
import { Checkbox } from '../../core/ui/checkbox.js';
import { Field, Input } from '../../core/ui/input.js';
import { Select } from '../../core/ui/select.js';
import { toast } from '../../core/ui/toast.js';
import { move } from '../uzytkownicy/model.js';
import { Card } from './card.js';

type Draft = { nazwa: string; kategorie: string[]; rodzaje: string[]; pozycje: string[] };
const msg = (e: unknown) => (e instanceof ApiError ? e.message : 'Brak połączenia z serwerem.');
const toggle = (xs: string[], v: string) => (xs.includes(v) ? xs.filter((x) => x !== v) : [...xs, v]);

/** Admin: listy predefiniowane (18j) – nazwa, do jakich zleceń pasuje (kategoria, rodzaj) i pozycje. Zapis od razu na serwer. */
export function Templates() {
  const all = useEntities('checklist_templates');
  const lists = useMemo(() => [...all].sort((a, b) => a.kolejnosc - b.kolejnosc || a.nazwa.localeCompare(b.nazwa, 'pl')), [all]);
  const [sel, setSel] = useState<string>();
  const cur = lists.find((t) => t.id === sel) ?? lists[0];
  const [nowa, setNowa] = useState('');
  const [busy, setBusy] = useState(false);

  async function create(e: FormEvent) {
    e.preventDefault();
    const nazwa = nowa.trim();
    if (!nazwa) return;
    setBusy(true);
    try {
      const t = await api<Rec>('/api/checklist-templates', { method: 'POST', json: { nazwa, kategorie: [], rodzaje: [], pozycje: [] } });
      store.put('checklist_templates', t);
      setSel(t.id); setNowa('');
    } catch (x) { toast('Lista nie została dodana', { body: msg(x), tone: 'error' }); }
    setBusy(false);
  }

  return (
    <Card title="Listy predefiniowane" icon={ListChecks} hint="Listy do odhaczania w „Na jutro”. Lista pasująca do kategorii (i rodzaju) zlecenia ekipy na dany dzień jest podświetlona na górze.">
      {lists.length > 0 && <Field label="Lista">{(id) => <Select id={id} value={cur?.id} onValueChange={setSel} options={lists.map((t) => ({ value: t.id, label: t.nazwa }))} />}</Field>}
      {cur && <Editor key={`${cur.id}|${cur.updatedAt}`} t={cur} onDeleted={() => setSel(undefined)} />}
      <form onSubmit={create} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-t border-line pt-4">
        <Input aria-label="Nazwa nowej listy" value={nowa} onChange={(e) => setNowa(e.target.value)} placeholder="Nazwa nowej listy" maxLength={100} />
        <Button type="submit" variant="secondary" disabled={busy || !nowa.trim()}><Plus className="h-5 w-5" weight="bold" />Nowa lista</Button>
      </form>
    </Card>
  );
}

function Editor({ t, onDeleted }: { t: Rec; onDeleted: () => void }) {
  const kategorie = useDict('kategoria');
  const rodzaje = useDict('rodzaj_zlecenia');
  const saved: Draft = { nazwa: t.nazwa, kategorie: t.kategorie ?? [], rodzaje: t.rodzaje ?? [], pozycje: t.pozycje ?? [] };
  const [d, setD] = useState<Draft>(saved);
  const [poz, setPoz] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  const dirty = JSON.stringify(d) !== JSON.stringify(saved);
  const edit = (p: Partial<Draft>) => { setD((x) => ({ ...x, ...p })); setErr(''); };

  function addItem(e: FormEvent) {
    e.preventDefault();
    const v = poz.trim();
    if (!v) return;
    edit({ pozycje: [...d.pozycje, v] });
    setPoz('');
  }
  async function save() {
    const body = { ...d, nazwa: d.nazwa.trim(), pozycje: d.pozycje.map((x) => x.trim()) };
    if (!body.nazwa) return setErr('Podaj nazwę listy');
    if (body.pozycje.some((x) => !x)) return setErr('Pozycja nie może być pusta');
    setBusy(true);
    try {
      store.put('checklist_templates', await api<Rec>(`/api/checklist-templates/${t.id}`, { method: 'PUT', json: body }));
      toast('Lista zapisana', { tone: 'ok' });
    } catch (x) { setErr(msg(x)); setBusy(false); }
  }
  async function remove() {
    if (!sure) return setSure(true);
    setBusy(true);
    try {
      await api(`/api/checklist-templates/${t.id}`, { method: 'DELETE' });
      store.remove('checklist_templates', t.id);
      onDeleted();
    } catch (x) { setErr(msg(x)); setBusy(false); }
  }

  const chips = (label: string, opts: Rec[], value: string[], set: (v: string[]) => void) => (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-semibold">{label}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {opts.filter((o) => o.wartosc !== 'mieszane').map((o) => (
          <label key={o.id} className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
            <Checkbox checked={value.includes(o.wartosc)} onCheckedChange={() => set(toggle(value, o.wartosc))} />{o.wartosc}
          </label>
        ))}
      </div>
    </fieldset>
  );

  return (
    <div className="grid gap-4">
      <Field label="Nazwa listy">{(id) => <Input id={id} value={d.nazwa} onChange={(e) => edit({ nazwa: e.target.value })} maxLength={100} />}</Field>
      {chips('Pasuje do kategorii', kategorie, d.kategorie, (kategorie) => edit({ kategorie }))}
      {chips('Tylko rodzaj (puste = każdy)', rodzaje, d.rodzaje, (rodzaje) => edit({ rodzaje }))}
      <div className="grid gap-2">
        <p className="text-sm font-semibold">Pozycje</p>
        <ol className="grid gap-2" aria-label={`Pozycje: ${t.nazwa}`}>
          {d.pozycje.map((x, i) => (
            <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-0.5 min-[560px]:gap-1">
              <Input aria-label={`Pozycja ${i + 1}`} value={x} onChange={(e) => edit({ pozycje: d.pozycje.map((y, k) => (k === i ? e.target.value : y)) })} className="h-11" maxLength={300} />
              <Button variant="ghost" size="iconTight" aria-label={`W górę: ${x}`} disabled={i === 0} onClick={() => edit({ pozycje: move(d.pozycje, i, -1) })}><ArrowUp className="h-5 w-5" /></Button>
              <Button variant="ghost" size="iconTight" aria-label={`W dół: ${x}`} disabled={i === d.pozycje.length - 1} onClick={() => edit({ pozycje: move(d.pozycje, i, 1) })}><ArrowDown className="h-5 w-5" /></Button>
              <Button variant="ghost" size="iconTight" aria-label={`Usuń: ${x}`} onClick={() => edit({ pozycje: d.pozycje.filter((_, k) => k !== i) })} className="text-danger"><Trash className="h-5 w-5" /></Button>
            </li>
          ))}
          {!d.pozycje.length && <li className="text-sm text-ink-2">Lista nie ma jeszcze pozycji.</li>}
        </ol>
        <form onSubmit={addItem} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <Input aria-label="Nowa pozycja" value={poz} onChange={(e) => setPoz(e.target.value)} placeholder="Nowa pozycja, Enter dodaje" maxLength={300} />
          <Button type="submit" variant="secondary" disabled={!poz.trim()}><Plus className="h-5 w-5" weight="bold" />Dodaj</Button>
        </form>
      </div>
      {err && <p role="alert" className="text-sm font-semibold text-danger">{err}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <Button variant="ghost" className="text-danger" disabled={busy} onClick={() => void remove()} onBlur={() => setSure(false)}>
          <Trash className="h-5 w-5" />{sure ? 'Na pewno usunąć?' : 'Usuń listę'}
        </Button>
        <div className="flex flex-wrap gap-3">
          {dirty && <Button variant="secondary" onClick={() => setD(saved)}>Cofnij zmiany</Button>}
          <Button onClick={() => void save()} disabled={!dirty || busy}>{busy ? 'Zapisywanie…' : 'Zapisz listę'}</Button>
        </div>
      </div>
    </div>
  );
}
