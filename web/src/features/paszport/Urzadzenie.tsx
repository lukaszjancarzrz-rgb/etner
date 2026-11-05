import { Trash } from '@phosphor-icons/react';
import { useState } from 'react';
import { useEntities, type Rec } from '../../core/store.js';
import { outbox } from '../../core/outbox.js';
import { Textarea } from '../../core/ui/bits.js';
import { Button } from '../../core/ui/button.js';
import { Checkbox } from '../../core/ui/checkbox.js';
import { Field, Input } from '../../core/ui/input.js';
import { Select } from '../../core/ui/select.js';
import { Dialog, Sheet } from '../../core/ui/sheet.js';
import { toast } from '../../core/ui/toast.js';
import { createVia, updateVia } from '../../core/write.js';
import { target, type Teczka } from './model.js';

const TEXT = ['nazwa', 'producent', 'model', 'nrSeryjny', 'uwagi'] as const;
const NO_JOB = '-';

/** Urządzenie teczki (P10: edycja i usuwanie – admin albo autor); zapis przez kolejkę offline. */
export function DeviceForm({ t, siteId, device, onClose }: { t: Teczka; siteId: string; device?: Rec; onClose: () => void }) {
  const jobs = useEntities('jobs').filter((j) => t.jobIds.includes(j.id));
  const [f, setF] = useState(() => ({
    ...Object.fromEntries(TEXT.map((k) => [k, (device?.[k] as string | undefined) ?? ''])) as Record<(typeof TEXT)[number], string>,
    montaz: device?.montaz ?? '', gwarancjaDo: device?.gwarancjaDo ?? '', jobId: device?.jobId ?? NO_JOB, dlaKlienta: device?.dlaKlienta ?? true,
  }));
  const [err, setErr] = useState('');
  const [ask, setAsk] = useState(false);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const fail = (what: string) => (x: Error) => toast(what, { body: x.message, tone: 'error' });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.nazwa.trim()) return setErr('Wpisz nazwę urządzenia');
    const body = { ...Object.fromEntries(TEXT.map((k) => [k, f[k].trim()])), montaz: f.montaz || null, gwarancjaDo: f.gwarancjaDo || null, jobId: f.jobId === NO_JOB ? null : f.jobId, dlaKlienta: f.dlaKlienta };
    if (device) void updateVia('devices', device.id, body, { kind: 'paszport', url: `/api/devices/${device.id}`, method: 'PUT', body }).catch(fail('Nie zapisano urządzenia'));
    else void createVia('devices', { kind: 'paszport', url: '/api/devices', method: 'POST', body: { ...target(t, siteId, t.kategoria), ...body } }, { ...body, folderId: t.folder?.id ?? '', siteId, kategoria: t.kategoria }).catch(fail('Nie dodano urządzenia'));
    onClose();
  }
  const remove = () => {
    void outbox.enqueue({ kind: 'paszport', url: `/api/devices/${device!.id}`, method: 'DELETE', optimistic: (s) => s.remove('devices', device!.id) }).catch(fail('Nie usunięto urządzenia'));
    onClose();
  };
  const text = (k: (typeof TEXT)[number], label: string, extra?: { error?: string; placeholder?: string }) => (
    <Field label={label} error={extra?.error}>{(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!extra?.error} value={f[k]} placeholder={extra?.placeholder} onChange={(e) => { set({ [k]: e.target.value }); setErr(''); }} />}</Field>
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <Sheet title={device ? 'Edycja urządzenia' : 'Nowe urządzenie'} description={t.kategoria} className="desk:w-[min(640px,92vw)]">
        <form onSubmit={submit} className="grid gap-4" noValidate>
          {text('nazwa', 'Nazwa', { error: err, placeholder: 'Np. Rekuperator, Jednostka wewnętrzna, Falownik' })}
          <div className="grid gap-4 min-[560px]:grid-cols-2">
            {text('producent', 'Producent')}
            {text('model', 'Model')}
            {text('nrSeryjny', 'Numer seryjny')}
            <Field label="Zlecenie montażu">{(id) => <Select id={id} value={f.jobId} onValueChange={(jobId) => set({ jobId })} options={[{ value: NO_JOB, label: 'bez zlecenia' }, ...jobs.map((j) => ({ value: j.id, label: `${j.numer} ${j.rodzaj ?? ''}`.trim() }))]} />}</Field>
            <Field label="Data montażu">{(id) => <Input id={id} type="date" value={f.montaz} onChange={(e) => set({ montaz: e.target.value })} />}</Field>
            <Field label="Gwarancja do">{(id) => <Input id={id} type="date" value={f.gwarancjaDo} onChange={(e) => set({ gwarancjaDo: e.target.value })} />}</Field>
          </div>
          <Field label="Uwagi">{(id) => <Textarea id={id} value={f.uwagi} onChange={(e) => set({ uwagi: e.target.value })} className="min-h-20" />}</Field>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 font-semibold"><Checkbox checked={f.dlaKlienta} onCheckedChange={(v) => set({ dlaKlienta: v === true })} />Widoczne dla klienta w paszporcie</label>
          <div className="flex flex-wrap justify-end gap-3 border-t border-line pt-4">
            {device && (ask
              ? <Button variant="danger" onClick={remove} autoFocus><Trash className="h-4 w-4" />Na pewno usunąć?</Button>
              : <Button variant="ghost" className="mr-auto text-danger" onClick={() => setAsk(true)}><Trash className="h-4 w-4" />Usuń</Button>)}
            <Button variant="secondary" onClick={onClose}>Anuluj</Button>
            <Button type="submit">Zapisz</Button>
          </div>
        </form>
      </Sheet>
    </Dialog>
  );
}
