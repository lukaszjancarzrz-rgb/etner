import { EnvelopeSimple } from '@phosphor-icons/react';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../core/api.js';
import { Button } from '../../core/ui/button.js';
import { cn } from '../../core/ui/cn.js';
import { Field, Input } from '../../core/ui/input.js';
import { toast } from '../../core/ui/toast.js';
import { badEmail } from '../klienci/forms.js';
import { Card } from '../ustawienia/card.js';

/** R38 (Ustawienia, admin): adres codziennego e-maila o 7:00 z listą zaległych kontaktów. */
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
    <Card title="E-mail o zaległych kontaktach" icon={EnvelopeSimple} hint="Codziennie o 7:00 lista leadów z zaległym kontaktem idzie na ten adres. Gdy nie ma zaległych, e-mail nie wychodzi.">
      <form onSubmit={(e) => void submit(e)} noValidate className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
        <Field label="Adres e-mail" error={err}>{(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!err} type="email" inputMode="email" value={v ?? ''} disabled={v === null} onChange={(e) => setV(e.target.value)} />}</Field>
        <Button type="submit" variant="secondary" disabled={!v || v.trim() === saved} className={cn(err && 'mb-7')}>Zapisz</Button>
      </form>
    </Card>
  );
}
