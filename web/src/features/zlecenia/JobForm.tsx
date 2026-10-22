import { useId, useState } from 'react';
import { go } from '../../routes.js';
import { useDict } from '../../core/data.js';
import { store, useEntity, type Rec } from '../../core/store.js';
import { Textarea } from '../../core/ui/bits.js';
import { Button } from '../../core/ui/button.js';
import { Checkbox } from '../../core/ui/checkbox.js';
import { Field, Input } from '../../core/ui/input.js';
import { Select } from '../../core/ui/select.js';
import { Dialog, Sheet } from '../../core/ui/sheet.js';
import { toast } from '../../core/ui/toast.js';
import { createVia, updateVia } from '../../core/write.js';
import { ClientPicker, newClientBody, siteLabel, type NewClient } from '../klienci/ClientPicker.js';
import { jobPrefill } from '../leady/model.js';

const NONE = '-';
const opts = (d: Rec[]) => d.map((x) => ({ value: x.wartosc as string, label: x.wartosc as string }));

/**
 * Nowe zlecenie albo edycja (admin). Klient z listy albo „Nowy klient” w tym samym formularzu.
 * `lead`: zlecenie z leada (POST /api/leads/:id/to-job), pola wypełnione z leada, pierwszy punkt zakresu i „Przyjęta”.
 */
export function JobForm({ job, lead, onClose }: { job?: Rec; lead?: Rec; onClose: () => void }) {
  const statusy = useDict('status_zlecenia');
  const ekipy = useDict('ekipa');
  const rodzaje = useDict('rodzaj_zlecenia');
  const kategorie = useDict('kategoria');
  const pre = lead ? jobPrefill(lead, statusy) : undefined;
  const leadClient = useEntity('clients', lead?.clientId ?? undefined);
  const leadSite = useEntity('sites', lead?.siteId ?? undefined);
  const [scope, setScope] = useState(pre?.scope ?? '');
  const [accept, setAccept] = useState(true);
  const acceptId = useId();

  const [f, setF] = useState(pre ? { ...pre, ekipa: NONE, termin: '', rodzaj: rodzaje[0]?.wartosc ?? '', uwagiAdmin: '' } : {
    clientId: job?.clientId ?? '', siteId: job?.siteId ?? '', status: job?.status ?? statusy[0]?.wartosc ?? '',
    ekipa: job?.ekipa ?? NONE, termin: job?.termin ?? '', rodzaj: job?.rodzaj || rodzaje[0]?.wartosc || '', kategoria: job?.kategoria || '',
    uwagiAdmin: job?.uwagiAdmin ?? '',
  });
  const [nowy, setNowy] = useState<NewClient | null>(null);
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));


  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!job && !nowy && !f.clientId) er.client = 'Wybierz klienta albo dodaj nowego';
    if (nowy && !nowy.nazwa.trim()) er.nazwa = 'Podaj nazwę klienta';
    if (!f.status) er.status = 'Wybierz status';
    if (f.termin && !/^\d{4}-(0[1-9]|1[0-2])$/.test(f.termin)) er.termin = 'Termin w formacie RRRR-MM';
    setErr(er);
    if (Object.keys(er).length) return;

    const body: Record<string, unknown> = {
      status: f.status, ekipa: f.ekipa === NONE ? null : f.ekipa, termin: f.termin || null, rodzaj: f.rodzaj, kategoria: f.kategoria,
      uwagiAdmin: f.uwagiAdmin.trim(),
    };
    if (nowy) Object.assign(body, newClientBody(nowy));
    else if (!job || f.clientId !== job.clientId || (f.siteId || null) !== (job.siteId ?? null)) {
      body.clientId = f.clientId;
      body.siteId = f.siteId || null;
    }
    const tmp = { ...body, clientId: f.clientId, newClient: body.newClient, leadId: lead?.id };
    const p = job
      ? updateVia('jobs', job.id, body, { kind: 'zlecenie', url: `/api/jobs/${job.id}`, method: 'PUT', body })
      : lead
        // serwer: klient i obiekt leada, punkt zakresu, „Przyjęta”; odpowiedź { lead, job }
        ? createVia<{ lead: Rec; job: Rec }>('jobs', { kind: 'zlecenie', url: `/api/leads/${lead.id}/to-job`, method: 'POST', body: { accept, scope: scope.trim(), job: body } }, tmp)
          .then((r) => { store.put('jobs', r.job); store.put('leads', r.lead); return r.job; })
        : createVia<Rec>('jobs', { kind: 'zlecenie', url: '/api/jobs', method: 'POST', body }, tmp);
    if (!navigator.onLine) {
      toast('Zapisane w telefonie', { body: 'Zlecenie wyśle się, gdy wróci zasięg.' });
      p.catch((x: Error) => toast('Zlecenie nie zostało zapisane', { body: x.message, tone: 'error' }));
      return onClose();
    }
    setBusy(true);
    try {
      const r = (await p) as Rec;
      onClose();
      if (!job && r?.id) go(`#zl/${r.id}`);
    } catch (x) {
      setErr({ form: (x as Error).message });
    } finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <Sheet title={job ? `Zlecenie ${job.numer ?? ''}` : lead ? `Zlecenie z leada ${lead.numer}` : 'Nowe zlecenie'} className="desk:w-[min(640px,92vw)]">
        <form onSubmit={(e) => void submit(e)} className="grid gap-4" noValidate>
          {err.form && <p role="alert" className="rounded-xl border border-danger/40 p-3 text-sm text-danger">{err.form}</p>}
          {lead?.clientId ? (
            <div className="rounded-2xl border border-line p-4">
              <p className="text-sm text-ink-2">Klient z leada {lead.numer}</p>
              <p className="font-semibold">{leadClient?.nazwa ?? 'Klient'}</p>
              {leadSite && <p className="text-sm text-ink-2">{siteLabel(leadSite)}</p>}
            </div>
          ) : (
            <ClientPicker clientId={f.clientId} siteId={f.siteId} onChange={set} nowy={nowy} onNowy={setNowy} err={err} />
          )}
          <div className="grid gap-4 min-[560px]:grid-cols-2">
            <Field label="Status" error={err.status}>{(id) => <Select id={id} value={f.status} onValueChange={(status) => set({ status })} options={opts(statusy)} />}</Field>
            <Field label="Ekipa">{(id) => <Select id={id} value={f.ekipa} onValueChange={(ekipa) => set({ ekipa })} options={[{ value: NONE, label: 'Bez ekipy' }, ...opts(ekipy)]} />}</Field>
            <Field label="Termin (miesiąc)" error={err.termin}>{(id, d) => <Input id={id} type="month" aria-describedby={d} aria-invalid={!!err.termin} value={f.termin} onChange={(e) => set({ termin: e.target.value })} placeholder="RRRR-MM" />}</Field>
            <Field label="Rodzaj">{(id) => <Select id={id} value={f.rodzaj || undefined} onValueChange={(rodzaj) => set({ rodzaj })} options={opts(rodzaje)} placeholder="Wybierz" />}</Field>
            <Field label="Kategoria">{(id) => <Select id={id} value={f.kategoria || undefined} onValueChange={(kategoria) => set({ kategoria })} options={opts(kategorie)} placeholder="Wybierz" />}</Field>
          </div>
          {lead && (
            <>
              <Field label="Zakres prac (punkt 1)" hint="Z opisu leada. Kolejne punkty i zdjęcia dodasz na karcie zlecenia.">{(id, d) => <Textarea id={id} aria-describedby={d} value={scope} onChange={(e) => setScope(e.target.value)} />}</Field>
              <label htmlFor={acceptId} className="flex min-h-11 cursor-pointer items-center gap-3 font-semibold">
                <Checkbox id={acceptId} checked={accept} onCheckedChange={(v) => setAccept(v === true)} />Oznacz lead jako Przyjęta
              </label>
            </>
          )}
          <Field label="Uwagi admina" hint="Widzą je tylko administratorzy.">{(id, d) => <Textarea id={id} aria-describedby={d} value={f.uwagiAdmin} onChange={(e) => set({ uwagiAdmin: e.target.value })} />}</Field>
          <div className="flex justify-end gap-3 border-t border-line pt-4">
            <Button variant="secondary" onClick={onClose}>Anuluj</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Zapisywanie…' : 'Zapisz'}</Button>
          </div>
        </form>
      </Sheet>
    </Dialog>
  );
}
