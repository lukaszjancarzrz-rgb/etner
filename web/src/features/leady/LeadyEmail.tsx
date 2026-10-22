import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../core/api.js';
import { Button } from '../../core/ui/button.js';
import { Field, Input } from '../../core/ui/input.js';
import { toast } from '../../core/ui/toast.js';
import { badEmail } from '../klienci/forms.js';

/** R38: adres codziennego e-maila (7:00) z zaległymi kontaktami. shortcut: na liście leadów, nie w Ustawieniach (osobny wykonawca); przenieść po scaleniu 19c. */
export function LeadyEmail() {
  const [v, setV] = useState<string | null>(null);
  const [saved, setSaved] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { api<{ email: string }>('/api/settings/leady-email').then((r) => { setV(r.email); setSaved(r.email); }, (e: Error) => setErr(e.message)); }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!v?.trim() || badEmail(v)) return setErr('Wpisz poprawny adres e-mail');
    try { await api('/api/settings/leady-email', { method: 'PUT', json: { email: v.trim() } }); setSaved(v.trim()); setErr(''); toast('Zapisano adres e-mail', { tone: 'ok' }); }
    catch (x) { setErr((x as Error).message); }
  }
  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="rounded-2xl border border-line bg-card p-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
        <Field label="E-mail z zaległymi kontaktami (codziennie 7:00)" error={err}>{(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!err} type="email" inputMode="email" value={v ?? ''} disabled={v === null} onChange={(e) => setV(e.target.value)} />}</Field>
        <Button type="submit" variant="secondary" disabled={!v || v.trim() === saved} className="mt-7">Zapisz</Button>
      </div>
    </form>
  );
}
