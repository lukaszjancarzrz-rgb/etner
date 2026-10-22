import { Plus, X } from '@phosphor-icons/react';
import { useMemo } from 'react';
import { useEntities, type Rec } from '../../core/store.js';
import { Button } from '../../core/ui/button.js';
import { Combobox } from '../../core/ui/combobox.js';
import { Field, Input } from '../../core/ui/input.js';
import { Select } from '../../core/ui/select.js';

export type NewClient = { nazwa: string; telefon: string; adres: string; miejscowosc: string };
export const emptyClient = (): NewClient => ({ nazwa: '', telefon: '', adres: '', miejscowosc: '' });

/** `newClient` + `newSite` do zapisu zlecenia albo leada. */
export const newClientBody = (n: NewClient) => ({
  newClient: { typ: 'osoba', nazwa: n.nazwa.trim(), telefony: n.telefon.trim() ? [n.telefon.trim()] : [], emaile: [], nip: '', notatki: '' },
  newSite: { nazwa: '', adres: n.adres.trim(), miejscowosc: n.miejscowosc.trim(), mapa: '', opis: '' },
});

export const siteLabel = (s: Rec) => [s.nazwa, s.adres, s.miejscowosc].filter(Boolean).join(', ') || 'Obiekt';

/** Klient z listy (z obiektem) albo „Nowy klient” w tym samym formularzu. Wybór klienta ustawia jego pierwszy obiekt. */
export function ClientPicker({ clientId, siteId, onChange, nowy, onNowy, err }: {
  clientId: string; siteId: string; onChange: (v: { clientId: string; siteId: string }) => void;
  nowy: NewClient | null; onNowy: (n: NewClient | null) => void; err: Record<string, string>;
}) {
  const clients = useEntities('clients');
  const sites = useEntities('sites');
  const clientOpts = useMemo(() => [...clients].sort((a, b) => a.nazwa.localeCompare(b.nazwa, 'pl')).map((c) => ({ value: c.id, label: c.nazwa as string })), [clients]);
  const clientSites = useMemo(() => sites.filter((s) => s.clientId === clientId), [sites, clientId]);

  if (nowy) {
    return (
      <fieldset className="grid gap-3 rounded-2xl border border-line p-4">
        <div className="flex items-center justify-between">
          <legend className="font-semibold">Nowy klient</legend>
          <Button variant="ghost" size="sm" onClick={() => onNowy(null)}><X className="h-4 w-4" />Wybierz z listy</Button>
        </div>
        <Field label="Imię i nazwisko lub firma" error={err.nazwa}>{(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!err.nazwa} value={nowy.nazwa} onChange={(e) => onNowy({ ...nowy, nazwa: e.target.value })} autoFocus />}</Field>
        <Field label="Telefon">{(id) => <Input id={id} type="tel" inputMode="tel" value={nowy.telefon} onChange={(e) => onNowy({ ...nowy, telefon: e.target.value })} />}</Field>
        <div className="grid gap-3 min-[560px]:grid-cols-2">
          <Field label="Adres">{(id) => <Input id={id} value={nowy.adres} onChange={(e) => onNowy({ ...nowy, adres: e.target.value })} />}</Field>
          <Field label="Miejscowość">{(id) => <Input id={id} value={nowy.miejscowosc} onChange={(e) => onNowy({ ...nowy, miejscowosc: e.target.value })} />}</Field>
        </div>
      </fieldset>
    );
  }
  return (
    <div className="grid gap-2">
      <Field label="Klient" error={err.client}>
        {(id) => <Combobox id={id} value={clientId} onValueChange={(c) => onChange({ clientId: c, siteId: sites.find((s) => s.clientId === c)?.id ?? '' })} options={clientOpts} placeholder="Wybierz klienta" search="Nazwisko, firma, telefon" empty="Nie ma takiego klienta. Dodaj nowego." />}
      </Field>
      <Button variant="ghost" size="sm" className="justify-self-start text-action" onClick={() => onNowy(emptyClient())}><Plus className="h-4 w-4" weight="bold" />Nowy klient</Button>
      {clientSites.length > 1 && (
        <Field label="Obiekt">{(id) => <Select id={id} value={siteId || clientSites[0]!.id} onValueChange={(s) => onChange({ clientId, siteId: s })} options={clientSites.map((s) => ({ value: s.id, label: siteLabel(s) }))} />}</Field>
      )}
    </div>
  );
}
