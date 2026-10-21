import { Plus, Trash } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { dayLong, useDict, useStatusGroup } from '../../core/data.js';
import { outbox } from '../../core/outbox.js';
import { store, useEntities, type Rec } from '../../core/store.js';
import { Checkbox } from '../../core/ui/checkbox.js';
import { Segmented } from '../../core/ui/bits.js';
import { Button } from '../../core/ui/button.js';
import { cn } from '../../core/ui/cn.js';
import { Combobox } from '../../core/ui/combobox.js';
import { Field, Input } from '../../core/ui/input.js';
import { Dialog, Sheet } from '../../core/ui/sheet.js';
import { toast } from '../../core/ui/toast.js';
import { tmpId } from '../../core/write.js';
import type { Ctx } from './Harmonogram.js';
import { cellKey, cellsOf, cellText, rangeDays, sameCell, type Slot } from './model.js';

type Rodzaj = Slot['rodzaj'];
type Draft = { rodzaj: Rodzaj; jobId: string; kod: string; tekst: string; polDnia: boolean };
const fromSlot = (s: Slot): Draft => ({ jobId: '', kod: '', tekst: '', ...s } as Draft);
const toSlot = (d: Draft): Slot =>
  d.rodzaj === 'zlecenie' ? { rodzaj: 'zlecenie', jobId: d.jobId, polDnia: d.polDnia }
    : d.rodzaj === 'kod' ? { rodzaj: 'kod', kod: d.kod, polDnia: d.polDnia } : { rodzaj: 'tekst', tekst: d.tekst.trim(), polDnia: d.polDnia };
const blank = (polDnia = false): Draft => ({ rodzaj: 'zlecenie', jobId: '', kod: '', tekst: '', polDnia });

/** Edytor komórki (admin): zlecenie z podpowiedzią / kod / tekst, cały lub pół dnia, kilka osób i dni naraz. Zapis = szkic. */
export function CellEditor({ dzien, person, people, current, draft, ekipa, ctx, onClose }: {
  dzien: string; person: Rec; people: Rec[]; current: Slot[]; draft?: Rec; ekipa: string | null; ctx: Ctx; onClose: () => void;
}) {
  const start = draft && Array.isArray(draft.proposal) ? (draft.proposal as Slot[]) : current;
  const [slots, setSlots] = useState<Draft[]>(start.length ? start.map(fromSlot) : [blank()]);
  const [errors, setErrors] = useState<string[]>([]);
  const [who, setWho] = useState<string[]>([person.id]);
  const [from, setFrom] = useState(dzien);
  const [to, setTo] = useState(dzien);
  const [wdOnly, setWdOnly] = useState<boolean | null>(null); // null = domyślnie: tak, gdy zakres > 1 dzień
  const [rangeErr, setRangeErr] = useState('');
  const codes = useDict('kod_nieobecnosci');
  const off = useDict('dzien_wolny');
  const entries = useEntities('schedule_entries');
  const drafts = useEntities('schedule_drafts');
  const group = useStatusGroup();
  const workdaysOnly = wdOnly ?? from < to;
  const single = who.length === 1 && who[0] === person.id && from === dzien && to === dzien;

  // Podpowiedzi: aktywne zlecenia, najpierw ekipy tej osoby.
  const options = useMemo(() => [...ctx.jobs.values()]
    .filter((j) => !j._tmp && group(j.status) === 'aktualne')
    .sort((a, b) => Number(b.ekipa === ekipa) - Number(a.ekipa === ekipa) || String(b.numer).localeCompare(String(a.numer)))
    .map((j) => ({ value: j.id, label: [j.numer, j.client?.nazwa, j.site?.miejscowosc].filter(Boolean).join(', ') })), [ctx.jobs, group, ekipa]);

  const set = (i: number, p: Partial<Draft>) => setSlots((xs) => xs.map((x, k) => (k === i ? { ...x, ...p } : x)));

  function save(value: Slot[]) {
    const errs = value.map((s) => s.rodzaj === 'zlecenie' && !s.jobId ? 'Wybierz zlecenie' : s.rodzaj === 'kod' && !s.kod ? 'Wybierz kod' : s.rodzaj === 'tekst' && !s.tekst ? 'Wpisz tekst' : '');
    const days = from && to && from <= to ? rangeDays(from, to, workdaysOnly, off.map((d) => d.wartosc as string)) : [];
    const rErr = !who.length ? 'Wybierz co najmniej jedną osobę' : !from || !to ? 'Podaj daty' : from > to ? 'Data „od” jest po dacie „do”'
      : !days.length ? 'W tym zakresie nie ma dni roboczych' : days.length > 400 ? 'Zakres najwyżej 400 dni' : '';
    setRangeErr(rErr);
    if (errs.some(Boolean) || rErr) return setErrors(errs);
    const v = value.length === 2 ? value.map((s) => ({ ...s, polDnia: true })) : value;
    const cells = cellsOf(entries);
    const draftOf = new Map(drafts.map((d) => [cellKey(d.dzien, d.personId), d]));
    const tmp: string[] = [];
    outbox.enqueue({
      kind: 'harmonogram', url: '/api/schedule/drafts', method: 'POST',
      body: { from, to, people: who, value: v, workdaysOnly },
      // szkic równy stanowi zatwierdzonemu znika (tak samo robi serwer)
      optimistic: (st) => {
        for (const d of days) for (const p of who) {
          const k = cellKey(d, p), old = draftOf.get(k);
          if (sameCell(v, cells.get(k) ?? [])) { if (old) st.remove('schedule_drafts', old.id); continue; }
          const id = old?.id ?? tmpId();
          if (!old) tmp.push(id);
          st.put('schedule_drafts', { ...(old ?? { _tmp: true }), id, dzien: d, personId: p, proposal: v });
        }
      },
    }).then(
      () => { for (const id of tmp) store.remove('schedule_drafts', id); }, // prawdziwe szkice przychodzą przez synchronizację
      (e: Error) => toast('Szkic nie został zapisany', { body: e.message, tone: 'error' }),
    );
    onClose();
  }

  const toggle = (id: string) => setWho((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));
  const dateInput = (label: string, value: string, onChange: (v: string) => void) => (
    <Field label={label}>{(id) => <Input id={id} type="date" value={value} onChange={(e) => onChange(e.target.value)} className="min-w-0" />}</Field>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <Sheet title={person.nazwa} description={`${dayLong(dzien)}. Teraz: ${cellText(current, ctx.jobs)}`}>
        <div className="grid gap-5">
          {slots.map((s, i) => (
            <fieldset key={i} className={cn('grid gap-3', i > 0 && 'border-t border-line pt-4')}>
              <legend className="sr-only">{i === 0 ? 'Wartość' : 'Druga połowa dnia'}</legend>
              {i > 0 && (
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Druga połowa dnia</p>
                  <Button variant="ghost" size="sm" onClick={() => setSlots((xs) => xs.slice(0, 1))}><Trash className="h-4 w-4" />Usuń</Button>
                </div>
              )}
              <Segmented label="Rodzaj" value={s.rodzaj} onChange={(rodzaj) => set(i, { rodzaj })}
                options={[{ v: 'zlecenie', label: 'Zlecenie' }, { v: 'kod', label: 'Kod' }, { v: 'tekst', label: 'Tekst' }]} />
              {s.rodzaj === 'zlecenie' && (
                <Field label="Zlecenie" error={errors[i]}>
                  {(id) => <Combobox id={id} value={s.jobId} onValueChange={(jobId) => set(i, { jobId })} options={options}
                    placeholder="Wybierz zlecenie" search="Numer, klient lub miejscowość" empty="Brak aktywnego zlecenia." />}
                </Field>
              )}
              {s.rodzaj === 'kod' && (
                <div className="grid gap-2">
                  <p className="text-sm font-semibold">Kod nieobecności</p>
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Kod nieobecności">
                    {codes.map((c) => (
                      <button key={c.id} type="button" role="radio" aria-checked={s.kod === c.wartosc} onClick={() => set(i, { kod: c.wartosc })}
                        className={cn('inline-flex h-11 items-center gap-2 rounded-full border px-4 font-semibold transition-colors duration-200', s.kod === c.wartosc ? 'border-ink bg-ink text-bg' : 'border-line')}>
                        <span className="h-3 w-3 rounded-full" style={{ background: c.kolor ?? '#8896a5' }} aria-hidden />{c.wartosc}
                      </button>
                    ))}
                  </div>
                  {errors[i] && <p className="text-sm text-danger">{errors[i]}</p>}
                </div>
              )}
              {s.rodzaj === 'tekst' && (
                <Field label="Tekst" error={errors[i]}>
                  {(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!errors[i]} value={s.tekst} maxLength={200} onChange={(e) => set(i, { tekst: e.target.value })} placeholder="np. Biuro, Hurtownia" />}
                </Field>
              )}
              {slots.length === 1 && (
                <Segmented label="Czas" value={s.polDnia ? 'pol' : 'caly'} onChange={(v) => set(i, { polDnia: v === 'pol' })}
                  options={[{ v: 'caly', label: 'Cały dzień' }, { v: 'pol', label: 'Pół dnia' }]} />
              )}
            </fieldset>
          ))}
          {slots.length === 1 && slots[0]!.polDnia && (
            <Button variant="secondary" onClick={() => setSlots((xs) => [...xs, blank(true)])}><Plus className="h-5 w-5" />Druga połowa dnia</Button>
          )}
          <fieldset className="grid gap-3 border-t border-line pt-4">
            <legend className="sr-only">Osoby i dni</legend>
            <p className="text-sm font-semibold">Osoby</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Osoby">
              {people.map((p) => (
                <button key={p.id} type="button" role="checkbox" aria-checked={who.includes(p.id)} onClick={() => toggle(p.id)}
                  className={cn('inline-flex h-11 items-center rounded-full border px-4 font-semibold transition-colors duration-200', who.includes(p.id) ? 'border-ink bg-ink text-bg' : 'border-line')}>
                  {p.nazwa}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {dateInput('Od', from, (v) => { setFrom(v); if (v > to) setTo(v); })}
              {dateInput('Do', to, setTo)}
            </div>
            <label className="flex min-h-11 items-center gap-3 font-semibold">
              <Checkbox checked={workdaysOnly} onCheckedChange={(c) => setWdOnly(c === true)} />Tylko dni robocze
            </label>
            {rangeErr && <p className="text-sm text-danger">{rangeErr}</p>}
          </fieldset>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <Button variant="ghost" onClick={() => save([])} disabled={single && !current.length && !draft}>{single ? 'Wyczyść dzień' : 'Wyczyść zaznaczone'}</Button>
            <Button onClick={() => save(slots.map(toSlot))}>Zapisz szkic</Button>
          </div>
          <p className="text-sm text-ink-2">Zmiana trafia do szkiców. Pracownicy zobaczą ją po zatwierdzeniu.</p>
        </div>
      </Sheet>
    </Dialog>
  );
}
