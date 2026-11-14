import { chwilaPl, dayOf, MAX_WPIS_H, minutyMiedzy, oknoEdycjiOd } from '@etner/shared';
import { useState } from 'react';
import { today, useMe } from '../../core/data.js';
import { useEntities, type Rec } from '../../core/store.js';
import { Textarea } from '../../core/ui/bits.js';
import { Button } from '../../core/ui/button.js';
import { cn } from '../../core/ui/cn.js';
import { Combobox } from '../../core/ui/combobox.js';
import { Field, Input } from '../../core/ui/input.js';
import { Select } from '../../core/ui/select.js';
import { Dialog, Sheet } from '../../core/ui/sheet.js';
import { toast } from '../../core/ui/toast.js';
import { hhmm, doSprawdzenia, reczny } from './model.js';
import { useWybor } from './ui.js';
import { dodaj, popraw, usun } from './zapis.js';

const blad = (t: string) => (e: Error) => toast(t, { body: e.message, tone: 'error' });

/** Dodanie wpisu ręcznego albo poprawa wpisu (pracownik: własne z okna edycji; admin: dowolne, usuwanie, „Zatwierdź”). */
export function WpisForm({ entry, personId, admin, onClose }: { entry?: Rec; personId?: string; admin: boolean; onClose: () => void }) {
  const me = useMe();
  const people = useEntities('schedule_people');
  const dzis = today();
  const [jobId, setJobId] = useState<string>(entry ? entry.jobId ?? 'none' : 'none');
  const [dzien, setDzien] = useState(entry?.dzien ?? dzis);
  const [od, setOd] = useState(entry ? hhmm(entry.od) : '');
  const [doo, setDoo] = useState(entry?.do ? hhmm(entry.do) : '');
  const [kom, setKom] = useState(entry?.komentarz ?? '');
  const [osoba, setOsoba] = useState(personId ?? entry?.personId ?? '');
  const [sure, setSure] = useState(false);
  const trwa = !!entry && !entry.do;
  const opcje = [{ value: 'none', label: 'Bez zlecenia' }, ...useWybor(entry?.jobId)];
  const odIso = od && dzien ? chwilaPl(dzien, od) : '', doIso = doo && dzien ? chwilaPl(dzien, doo) : '';
  const min = odIso && doIso ? minutyMiedzy(odIso, doIso) : 0;
  const err = !dzien || !od || (!trwa && !doo) ? 'Wpisz dzień i obie godziny.' : !trwa && min <= 0 ? 'Godzina zakończenia musi być późniejsza niż rozpoczęcia.'
    : min > MAX_WPIS_H * 60 ? `Wpis może mieć najwyżej ${MAX_WPIS_H} h.` : !admin && (dzien > dzis || dzien < oknoEdycjiOd(dzis)) ? 'Poprawiać możesz wpisy z tego i poprzedniego tygodnia.' : admin && !entry && !osoba ? 'Wybierz osobę.' : '';
  const job = jobId === 'none' ? null : jobId;

  const zapisz = () => {
    if (err || !me) return;
    if (!entry) {
      const komentarz = kom.trim();
      void dodaj({ jobId: job, od: odIso, do: doIso, komentarz, ...(admin && osoba && { personId: osoba }) },
        { userId: people.find((p) => p.id === (osoba || personId))?.userId ?? me.id, personId: osoba || personId, jobId: job, dzien: dayOf(odIso), od: odIso, do: doIso, odCz: null, doCz: null, komentarz, edytowal: me.id, edytowalAt: new Date().toISOString() })
        .catch(blad('Nie dodano wpisu'));
    } else {
      const t = od !== hhmm(entry.od) || (!trwa && doo !== hhmm(entry.do)) || dzien !== entry.dzien;
      void popraw(entry.id, {
        ...(job !== (entry.jobId ?? null) && { jobId: job }),
        ...(t && { od: odIso, ...(!trwa && { do: doIso }) }),
        ...(kom.trim() !== (entry.komentarz ?? '') && { komentarz: kom.trim() }),
      }, me.id).catch(blad('Nie zapisano poprawki'));
    }
    onClose();
  };
  const usunWpis = () => { if (entry) void usun(entry.id).catch(blad('Nie usunięto wpisu')); onClose(); };
  const mozeUsunac = !!entry && (admin || reczny(entry));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <Sheet title={entry ? 'Poprawka wpisu' : 'Dodaj wpis ręcznie'}>
        <div className="grid gap-4">
          {admin && !entry && !personId && (
            <Field label="Osoba">{(id) => <Select id={id} value={osoba || undefined} onValueChange={setOsoba} placeholder="Wybierz osobę" options={people.map((p) => ({ value: p.id, label: p.nazwa }))} />}</Field>
          )}
          <Field label="Zlecenie">{(id) => <Combobox id={id} value={jobId} onValueChange={setJobId} options={opcje} placeholder="Bez zlecenia" search="Numer, klient, miejscowość" empty="Nie ma takiego zlecenia." />}</Field>
          <Field label="Dzień">{(id) => <Input id={id} type="date" value={dzien} {...(!admin && { min: oknoEdycjiOd(dzis), max: dzis })} onChange={(e) => setDzien(e.target.value)} />}</Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start">{(id) => <Input id={id} type="time" value={od} onChange={(e) => setOd(e.target.value)} />}</Field>
            <Field label="Stop" {...(trwa && { hint: 'Wpis trwa – zakończ go przyciskiem Stop.' })}>{(id, d) => <Input id={id} aria-describedby={d} type="time" value={doo} disabled={trwa} onChange={(e) => setDoo(e.target.value)} />}</Field>
          </div>
          <Field label="Komentarz (opcjonalnie)">{(id) => <Textarea id={id} value={kom} maxLength={300} onChange={(e) => setKom(e.target.value)} className="min-h-16" />}</Field>
          {err && <p className="text-sm text-danger" role="alert">{err}</p>}
          {!admin && <p className="text-sm text-ink-2">Poprawiać możesz wpisy z tego i poprzedniego tygodnia. Starsze – biuro.</p>}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            {mozeUsunac ? <Button variant={sure ? 'danger' : 'ghost'} className={cn(!sure && 'text-danger')} onClick={() => (sure ? usunWpis() : setSure(true))}>{sure ? 'Na pewno usunąć?' : 'Usuń'}</Button> : <span />}
            <div className="flex flex-wrap gap-3">
              {admin && entry && doSprawdzenia(entry) && <Button variant="ok" onClick={() => { void popraw(entry.id, {}, me!.id).catch(blad('Nie zatwierdzono')); onClose(); }}>Zatwierdź</Button>}
              <Button variant="secondary" onClick={onClose}>Anuluj</Button>
              <Button onClick={zapisz} disabled={!!err}>Zapisz</Button>
            </div>
          </div>
        </div>
      </Sheet>
    </Dialog>
  );
}
