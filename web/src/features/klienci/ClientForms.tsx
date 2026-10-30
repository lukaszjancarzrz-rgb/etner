import { Plus, Trash, WarningCircle } from '@phosphor-icons/react';
import { useState } from 'react';
import type { Rec } from '../../core/store.js';
import { Segmented, Textarea } from '../../core/ui/bits.js';
import { Button } from '../../core/ui/button.js';
import { Field, Input } from '../../core/ui/input.js';
import { Dialog, Sheet } from '../../core/ui/sheet.js';
import { toast } from '../../core/ui/toast.js';
import { createVia, updateVia } from '../../core/write.js';
import { clientBody, type ClientDraft } from './forms.js';

type Errs = Record<string, string>;

/**
 * Zapis przez kolejkę: offline zamyka formularz z komunikatem, online czeka na odpowiedź.
 * Błąd serwera trafia do pola (`field`, gdy komunikat do niego pasuje) albo nad formularz; wartości zostają.
 */
async function send<T>(p: Promise<T>, what: string, setErr: (e: Errs) => void, setBusy: (b: boolean) => void, field: Record<string, string>, onOk: (r: T) => void, onClose: () => void) {
  if (!navigator.onLine) {
    toast('Zapisane w telefonie', { body: `${what} wyśle się, gdy wróci zasięg.` });
    p.catch((x: Error) => toast(`${what}: zmiana nie została zapisana`, { body: x.message, tone: 'error' }));
    return onClose();
  }
  setBusy(true);
  try {
    onOk(await p);
  } catch (x) {
    const m = (x as Error).message;
    setErr({ [field[m] ?? 'form']: m });
  } finally { setBusy(false); }
}

/** Lista wartości (telefony, e-maile) z dodawaniem i usuwaniem wierszy. */
function ListRows({ label, addLabel, items, onChange, type, errors, errKey }: {
  label: string; addLabel: string; items: string[]; onChange: (xs: string[]) => void; type: 'tel' | 'email'; errors: Errs; errKey: string;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-semibold">{label}</legend>
      {items.map((v, i) => {
        const err = errors[`${errKey}.${i}`];
        return (
          <div key={i} className="grid gap-1">
            <div className="flex gap-2">
              <Input type={type} inputMode={type === 'tel' ? 'tel' : 'email'} autoComplete="off" aria-label={`${label} ${i + 1}`} aria-invalid={!!err}
                value={v} onChange={(e) => onChange(items.map((x, k) => (k === i ? e.target.value : x)))} />
              <Button variant="ghost" size="icon" aria-label={`Usuń: ${label.toLowerCase()} ${i + 1}`} onClick={() => onChange(items.filter((_, k) => k !== i))}><Trash className="h-5 w-5" /></Button>
            </div>
            {err && <p className="text-sm text-danger">{err}</p>}
          </div>
        );
      })}
      <Button variant="ghost" size="sm" className="justify-self-start text-action" onClick={() => onChange([...items, ''])}><Plus className="h-4 w-4" weight="bold" />{addLabel}</Button>
    </fieldset>
  );
}

const FormError = ({ msg }: { msg?: string }) => (msg ? <p role="alert" className="rounded-xl border border-danger/40 p-3 text-sm text-danger">{msg}</p> : null);
const Actions = ({ busy, onClose }: { busy: boolean; onClose: () => void }) => (
  <div className="flex justify-end gap-3 border-t border-line pt-4">
    <Button variant="secondary" onClick={onClose}>Anuluj</Button>
    <Button type="submit" disabled={busy}>{busy ? 'Zapisywanie…' : 'Zapisz'}</Button>
  </div>
);

/** Edycja klienta (admin): typ, nazwa, telefony, e-maile, NIP, notatki. */
export function ClientForm({ client, onClose }: { client: Rec; onClose: () => void }) {
  const [f, setF] = useState<ClientDraft>({
    typ: client.typ === 'firma' ? 'firma' : 'osoba', nazwa: client.nazwa ?? '', nip: client.nip ?? '', notatki: client.notatki ?? '',
    telefony: client.telefony?.length ? [...client.telefony] : [''], emaile: [...(client.emaile ?? [])],
  });
  const [err, setErr] = useState<Errs>({});
  const [busy, setBusy] = useState(false);
  const [dups, setDups] = useState<Rec[] | null>(null);
  const set = (p: Partial<ClientDraft>) => setF((x) => ({ ...x, ...p }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const { body, errors } = clientBody(f);
    setErr(errors);
    if (Object.keys(errors).length) return;
    const p = updateVia('clients', client.id, body, { kind: 'klient', url: `/api/clients/${client.id}`, method: 'PUT', body }) as Promise<{ duplicates?: Rec[] }>;
    void send(p, 'Klient', setErr, setBusy, { 'Podaj nazwę klienta': 'nazwa' }, (r) => (r?.duplicates?.length ? setDups(r.duplicates) : onClose()), onClose);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <Sheet title="Edycja klienta" description={client.nazwa} className="desk:w-[min(640px,92vw)]">
        {dups ? (
          <div className="grid gap-4">
            <div role="status" className="flex gap-3 rounded-xl border border-danger/40 bg-danger/5 p-3">
              <WarningCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger" weight="fill" />
              <div className="grid gap-1 text-sm">
                <p className="font-semibold">Zapisano. Ten sam telefon lub e-mail ma też:</p>
                <ul className="grid gap-1">{dups.map((d) => <li key={d.id}><a href={`#kl/${d.id}`} onClick={onClose} className="font-semibold text-action underline">{d.nazwa}</a></li>)}</ul>
                <p className="text-ink-2">Sprawdź, czy to nie ten sam klient.</p>
              </div>
            </div>
            <Button className="justify-self-end" onClick={onClose}>Gotowe</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="grid gap-4" noValidate>
            <FormError msg={err.form} />
            <Segmented label="Typ" value={f.typ} onChange={(typ) => set({ typ })} options={[{ v: 'osoba', label: 'Osoba prywatna' }, { v: 'firma', label: 'Firma' }]} />
            <Field label={f.typ === 'firma' ? 'Nazwa firmy' : 'Imię i nazwisko'} error={err.nazwa}>
              {(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!err.nazwa} value={f.nazwa} onChange={(e) => set({ nazwa: e.target.value })} />}
            </Field>
            <div className="grid gap-4 min-[560px]:grid-cols-2">
              <ListRows label="Telefon" addLabel="Dodaj telefon" type="tel" items={f.telefony} onChange={(telefony) => set({ telefony })} errors={err} errKey="tel" />
              <ListRows label="E-mail" addLabel="Dodaj e-mail" type="email" items={f.emaile} onChange={(emaile) => set({ emaile })} errors={err} errKey="email" />
            </div>
            <Field label="NIP">{(id) => <Input id={id} inputMode="numeric" value={f.nip} onChange={(e) => set({ nip: e.target.value })} />}</Field>
            <Field label="Notatki" hint="Widzą je tylko administratorzy.">{(id, d) => <Textarea id={id} aria-describedby={d} value={f.notatki} onChange={(e) => set({ notatki: e.target.value })} />}</Field>
            <Actions busy={busy} onClose={onClose} />
          </form>
        )}
      </Sheet>
    </Dialog>
  );
}

const SITE_FIELDS = ['nazwa', 'adres', 'miejscowosc', 'mapa', 'opis'] as const;
type SiteDraft = Record<(typeof SITE_FIELDS)[number], string>;

/** Nowy obiekt klienta albo edycja istniejącego (admin). */
export function SiteForm({ clientId, site, onClose }: { clientId: string; site?: Rec; onClose: () => void }) {
  const [f, setF] = useState<SiteDraft>(Object.fromEntries(SITE_FIELDS.map((k) => [k, site?.[k] ?? ''])) as SiteDraft);
  const [err, setErr] = useState<Errs>({});
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<SiteDraft>) => setF((x) => ({ ...x, ...p }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = Object.fromEntries(SITE_FIELDS.map((k) => [k, f[k].trim()])) as SiteDraft;
    if (!body.nazwa && !body.adres && !body.miejscowosc) return setErr({ adres: 'Podaj adres, miejscowość albo nazwę obiektu' });
    setErr({});
    const p = site
      ? updateVia('sites', site.id, body, { kind: 'klient', url: `/api/sites/${site.id}`, method: 'PUT', body })
      : createVia('sites', { kind: 'klient', url: `/api/clients/${clientId}/sites`, method: 'POST', body }, { ...body, clientId });
    void send(p, 'Obiekt', setErr, setBusy, {}, onClose, onClose);
  }

  const text = (k: keyof SiteDraft, label: string, hint?: string) => (
    <Field label={label} hint={hint} error={err[k]}>
      {(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!err[k]} value={f[k]} onChange={(e) => set({ [k]: e.target.value })} />}
    </Field>
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <Sheet title={site ? 'Edycja obiektu' : 'Nowy obiekt'} className="desk:w-[min(640px,92vw)]">
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <FormError msg={err.form} />
          {text('nazwa', 'Nazwa', 'Np. Dom, Pensjonat, Hala. Można zostawić puste.')}
          <div className="grid gap-4 min-[560px]:grid-cols-2">
            {text('adres', 'Adres')}
            {text('miejscowosc', 'Miejscowość')}
          </div>
          {text('mapa', 'Mapa', 'Link do mapy. Puste: nawigacja szuka po adresie.')}
          <Field label="Opis">{(id) => <Textarea id={id} value={f.opis} onChange={(e) => set({ opis: e.target.value })} placeholder="Dojazd, gdzie zaparkować, kod do bramy" />}</Field>
          <Actions busy={busy} onClose={onClose} />
        </form>
      </Sheet>
    </Dialog>
  );
}
