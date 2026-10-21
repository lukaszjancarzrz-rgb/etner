import { Plus, X } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { go } from '../../routes.js';
import { useDict } from '../../core/data.js';
import { useEntities, type Rec } from '../../core/store.js';
import { Textarea } from '../../core/ui/bits.js';
import { Button } from '../../core/ui/button.js';
import { Combobox } from '../../core/ui/combobox.js';
import { Field, Input } from '../../core/ui/input.js';
import { Select } from '../../core/ui/select.js';
import { Dialog, Sheet } from '../../core/ui/sheet.js';
import { toast } from '../../core/ui/toast.js';
import { createVia, updateVia } from '../../core/write.js';

const NONE = '-';
const opts = (d: Rec[]) => d.map((x) => ({ value: x.wartosc as string, label: x.wartosc as string }));

/** Nowe zlecenie albo edycja (admin). Klient z listy albo „Nowy klient” w tym samym formularzu. */
export function JobForm({ job, onClose }: { job?: Rec; onClose: () => void }) {
  const statusy = useDict('status_zlecenia');
  const ekipy = useDict('ekipa');
  const rodzaje = useDict('rodzaj_zlecenia');
  const kategorie = useDict('kategoria');
  const clients = useEntities('clients');
  const sites = useEntities('sites');

  const [f, setF] = useState({
    clientId: job?.clientId ?? '', siteId: job?.siteId ?? '', status: job?.status ?? statusy[0]?.wartosc ?? '',
    ekipa: job?.ekipa ?? NONE, termin: job?.termin ?? '', rodzaj: job?.rodzaj || rodzaje[0]?.wartosc || '', kategoria: job?.kategoria || '',
    zakres: job?.zakres ?? '', uwagiAdmin: job?.uwagiAdmin ?? '',
  });
  const [nowy, setNowy] = useState<null | { nazwa: string; telefon: string; adres: string; miejscowosc: string }>(null);
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));

  const clientOpts = useMemo(() => [...clients].sort((a, b) => a.nazwa.localeCompare(b.nazwa, 'pl')).map((c) => ({ value: c.id, label: c.nazwa as string })), [clients]);
  const clientSites = useMemo(() => sites.filter((s) => s.clientId === f.clientId), [sites, f.clientId]);
  const siteLabel = (s: Rec) => [s.nazwa, s.adres, s.miejscowosc].filter(Boolean).join(', ') || 'Obiekt';

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
      zakres: f.zakres.trim(), uwagiAdmin: f.uwagiAdmin.trim(),
    };
    if (nowy) {
      body.newClient = { typ: 'osoba', nazwa: nowy.nazwa.trim(), telefony: nowy.telefon.trim() ? [nowy.telefon.trim()] : [], emaile: [], nip: '', notatki: '' };
      body.newSite = { nazwa: '', adres: nowy.adres.trim(), miejscowosc: nowy.miejscowosc.trim(), mapa: '', opis: '' };
    } else if (!job || f.clientId !== job.clientId || (f.siteId || null) !== (job.siteId ?? null)) {
      body.clientId = f.clientId;
      body.siteId = f.siteId || clientSites[0]?.id || null;
    }
    const p = job
      ? updateVia('jobs', job.id, body, { kind: 'zlecenie', url: `/api/jobs/${job.id}`, method: 'PUT', body })
      : createVia<Rec>('jobs', { kind: 'zlecenie', url: '/api/jobs', method: 'POST', body }, { ...body, clientId: f.clientId, newClient: body.newClient });
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
      <Sheet title={job ? `Zlecenie ${job.numer ?? ''}` : 'Nowe zlecenie'} className="desk:w-[min(640px,92vw)]">
        <form onSubmit={(e) => void submit(e)} className="grid gap-4" noValidate>
          {err.form && <p role="alert" className="rounded-xl border border-danger/40 p-3 text-sm text-danger">{err.form}</p>}
          {nowy ? (
            <fieldset className="grid gap-3 rounded-2xl border border-line p-4">
              <div className="flex items-center justify-between">
                <legend className="font-semibold">Nowy klient</legend>
                <Button variant="ghost" size="sm" onClick={() => setNowy(null)}><X className="h-4 w-4" />Wybierz z listy</Button>
              </div>
              <Field label="Imię i nazwisko lub firma" error={err.nazwa}>{(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!err.nazwa} value={nowy.nazwa} onChange={(e) => setNowy({ ...nowy, nazwa: e.target.value })} autoFocus />}</Field>
              <Field label="Telefon">{(id) => <Input id={id} type="tel" inputMode="tel" value={nowy.telefon} onChange={(e) => setNowy({ ...nowy, telefon: e.target.value })} />}</Field>
              <div className="grid gap-3 min-[560px]:grid-cols-2">
                <Field label="Adres">{(id) => <Input id={id} value={nowy.adres} onChange={(e) => setNowy({ ...nowy, adres: e.target.value })} />}</Field>
                <Field label="Miejscowość">{(id) => <Input id={id} value={nowy.miejscowosc} onChange={(e) => setNowy({ ...nowy, miejscowosc: e.target.value })} />}</Field>
              </div>
            </fieldset>
          ) : (
            <div className="grid gap-2">
              <Field label="Klient" error={err.client}>
                {(id) => <Combobox id={id} value={f.clientId} onValueChange={(clientId) => set({ clientId, siteId: '' })} options={clientOpts} placeholder="Wybierz klienta" search="Nazwisko, firma, telefon" empty="Nie ma takiego klienta. Dodaj nowego." />}
              </Field>
              <Button variant="ghost" size="sm" className="justify-self-start text-action" onClick={() => setNowy({ nazwa: '', telefon: '', adres: '', miejscowosc: '' })}><Plus className="h-4 w-4" weight="bold" />Nowy klient</Button>
              {clientSites.length > 1 && (
                <Field label="Obiekt">{(id) => <Select id={id} value={f.siteId || clientSites[0]!.id} onValueChange={(siteId) => set({ siteId })} options={clientSites.map((s) => ({ value: s.id, label: siteLabel(s) }))} />}</Field>
              )}
            </div>
          )}
          <div className="grid gap-4 min-[560px]:grid-cols-2">
            <Field label="Status" error={err.status}>{(id) => <Select id={id} value={f.status} onValueChange={(status) => set({ status })} options={opts(statusy)} />}</Field>
            <Field label="Ekipa">{(id) => <Select id={id} value={f.ekipa} onValueChange={(ekipa) => set({ ekipa })} options={[{ value: NONE, label: 'Bez ekipy' }, ...opts(ekipy)]} />}</Field>
            <Field label="Termin (miesiąc)" error={err.termin}>{(id, d) => <Input id={id} type="month" aria-describedby={d} aria-invalid={!!err.termin} value={f.termin} onChange={(e) => set({ termin: e.target.value })} placeholder="RRRR-MM" />}</Field>
            <Field label="Rodzaj">{(id) => <Select id={id} value={f.rodzaj || undefined} onValueChange={(rodzaj) => set({ rodzaj })} options={opts(rodzaje)} placeholder="Wybierz" />}</Field>
            <Field label="Kategoria">{(id) => <Select id={id} value={f.kategoria || undefined} onValueChange={(kategoria) => set({ kategoria })} options={opts(kategorie)} placeholder="Wybierz" />}</Field>
          </div>
          <Field label="Zakres prac">{(id) => <Textarea id={id} value={f.zakres} onChange={(e) => set({ zakres: e.target.value })} />}</Field>
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
