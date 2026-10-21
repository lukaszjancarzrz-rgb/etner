import { CaretRight, Desktop, Moon, SignOut, Sun, UsersThree } from '@phosphor-icons/react';
import { useState, type FormEvent } from 'react';
import { ApiError, api } from '../core/api.js';
import { logout, useSession } from '../core/session.js';
import { setTheme, useTheme, type Theme } from '../core/theme.js';
import { Button } from '../core/ui/button.js';
import { cn } from '../core/ui/cn.js';
import { Field, Input } from '../core/ui/input.js';
import { toast } from '../core/ui/toast.js';

const opts: { v: Theme; label: string; icon: typeof Sun }[] = [
  { v: 'system', label: 'Auto', icon: Desktop },
  { v: 'light', label: 'Jasny', icon: Sun },
  { v: 'dark', label: 'Ciemny', icon: Moon },
];

function ChangePassword() {
  const [stare, setStare] = useState('');
  const [nowe, setNowe] = useState('');
  const [powt, setPowt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (nowe.length < 8) return setError('Nowe hasło musi mieć co najmniej 8 znaków.');
    if (nowe !== powt) return setError('Powtórzone hasło jest inne niż nowe.');
    setBusy(true);
    try {
      await api('/api/me/haslo', { method: 'POST', json: { stare, nowe } });
      setStare(''); setNowe(''); setPowt(''); setError(null);
      toast('Hasło zostało zmienione', { body: 'Na pozostałych urządzeniach zalogujesz się ponownie.', tone: 'ok' });
    } catch (err) {
      const code = err instanceof ApiError ? (err.body as { error?: string } | null)?.error : undefined;
      setError(code === 'ZLE_HASLO' ? 'Obecne hasło jest nieprawidłowe.' : err instanceof ApiError ? err.message : 'Brak połączenia z serwerem.');
    }
    setBusy(false);
  }
  return (
    <form onSubmit={submit} className="grid gap-4 rounded-2xl border border-line bg-card p-5">
      <h2 className="font-wide text-lg font-extrabold">Zmień hasło</h2>
      <Field label="Obecne hasło">{(id) => <Input id={id} type="password" autoComplete="current-password" value={stare} onChange={(e) => setStare(e.target.value)} required />}</Field>
      <Field label="Nowe hasło" hint="Co najmniej 8 znaków.">{(id, d) => <Input id={id} aria-describedby={d} type="password" autoComplete="new-password" minLength={8} value={nowe} onChange={(e) => setNowe(e.target.value)} required />}</Field>
      <Field label="Powtórz nowe hasło">{(id) => <Input id={id} type="password" autoComplete="new-password" value={powt} onChange={(e) => setPowt(e.target.value)} required />}</Field>
      {error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}
      <Button type="submit" variant="secondary" disabled={busy}>Zmień hasło</Button>
    </form>
  );
}

/** Więcej: Klienci (admin), Ustawienia (motyw), wylogowanie. */
export function More() {
  const theme = useTheme();
  const { me } = useSession();
  return (
    <section className="mx-auto grid max-w-2xl gap-6 px-4 py-6">
      {me?.role === 'admin' && (
        <a href="#kl" className="flex min-h-16 items-center gap-4 rounded-2xl border border-line bg-card px-5 py-4 hover:border-ink-2">
          <UsersThree className="h-7 w-7 text-action" weight="duotone" />
          <span className="min-w-0 flex-1"><span className="block font-wide text-lg font-extrabold">Klienci</span><span className="block text-sm text-ink-2">Kontakty, obiekty, leady i zlecenia klienta</span></span>
          <CaretRight className="h-5 w-5 text-ink-2" />
        </a>
      )}
      <div className="rounded-2xl border border-line bg-card p-5">
        <h2 className="mb-1 font-wide text-lg font-extrabold">Ustawienia</h2>
        <p className="mb-4 text-sm text-ink-2">Wygląd aplikacji na tym urządzeniu.</p>
        <div role="radiogroup" aria-label="Motyw" className="grid grid-cols-3 gap-1 rounded-full border border-line p-1">
          {opts.map(({ v, label, icon: I }) => (
            <button key={v} role="radio" aria-checked={theme === v} onClick={() => setTheme(v)}
              className={cn('flex h-11 items-center justify-center gap-2 rounded-full px-2 text-sm font-semibold transition-colors duration-200',
                theme === v ? 'bg-ink text-bg' : 'text-ink-2 hover:text-ink')}>
              <I className="h-5 w-5 shrink-0" /><span className="truncate">{label}</span>
            </button>
          ))}
        </div>
      </div>
      <ChangePassword />
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-card p-5">
        <div className="min-w-0">
          <p className="truncate font-semibold">{me?.name}</p>
          <p className="text-sm text-ink-2">{me?.role === 'admin' ? 'Administrator' : 'Pracownik'}</p>
        </div>
        <Button variant="secondary" onClick={() => void logout()}><SignOut className="h-5 w-5" />Wyloguj</Button>
      </div>
    </section>
  );
}
