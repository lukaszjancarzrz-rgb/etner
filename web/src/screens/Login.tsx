import { Eye, EyeSlash } from '@phosphor-icons/react';
import { useEffect, useState, type FormEvent } from 'react';
import { Logo } from '../core/layout/Logo.js';
import { login } from '../core/session.js';
import { Button } from '../core/ui/button.js';
import { Field, Input } from '../core/ui/input.js';

type Konto = { name: string; role: string; ekipa: string | null; login: string };
/** Wspólne hasło kont demo (serwer pokazuje listę kont tylko przy DEMO=1). */
const DEMO_PASSWORD = 'demo1234';

/** Ekran logowania: login i hasło; w wersji demo dodatkowo lista kont do wyboru jednym dotknięciem. */
export function Login() {
  const [l, setL] = useState('');
  const [h, setH] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [konta, setKonta] = useState<Konto[]>([]);

  useEffect(() => {
    fetch('/api/demo/konta', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : []))
      .then((k: Konto[]) => setKonta(k))
      .catch(() => {});
  }, []);

  async function go(lg: string, pw: string) {
    setBusy(true);
    setError(await login(lg, pw));
    setBusy(false);
  }
  const submit = (e: FormEvent) => { e.preventDefault(); void go(l, h); };

  return (
    <main className="grid min-h-[100dvh] grid-rows-[auto_1fr]">
      <div className="stripes h-8 desk:h-12" aria-hidden />
      <div className="mx-auto flex w-full max-w-md flex-col justify-center gap-6 px-6 py-10">
        <div className="flex items-center gap-3">
          <Logo className="h-12 w-12" />
          <span className="font-wide text-3xl font-black tracking-tight">ETNER</span>
        </div>
        <div className="border-l-4 border-action pl-4">
          <h1 className="font-wide text-2xl font-extrabold">Zaloguj się</h1>
          <p className="mt-2 text-ink-2">Wpisz swój login i hasło.</p>
        </div>
        <form onSubmit={submit} className="grid gap-4">
          <Field label="Login">
            {(id) => <Input id={id} value={l} onChange={(e) => setL(e.target.value)} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required />}
          </Field>
          <Field label="Hasło">
            {(id) => (
              <div className="relative">
                <Input id={id} type={show ? 'text' : 'password'} value={h} onChange={(e) => setH(e.target.value)} autoComplete="current-password" className="pr-14" required />
                <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Ukryj hasło' : 'Pokaż hasło'} aria-pressed={show}
                  className="absolute right-1 top-1 flex h-10 w-10 items-center justify-center rounded-full text-ink-2 hover:text-ink">
                  {show ? <EyeSlash className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            )}
          </Field>
          {error && <p role="alert" className="rounded-2xl border border-danger/40 bg-card p-4 text-sm font-semibold text-danger">{error}</p>}
          <Button type="submit" disabled={busy}>{busy ? 'Logowanie…' : 'Zaloguj się'}</Button>
        </form>
        {konta.length > 0 && (
          <section aria-labelledby="demo-h" className="grid gap-2 border-t border-line pt-5">
            <h2 id="demo-h" className="font-wide text-lg font-extrabold">Konta demo</h2>
            <p className="text-sm text-ink-2">Dotknij konta, żeby się zalogować. Wspólne hasło: {DEMO_PASSWORD}.</p>
            <ul className="grid gap-2">
              {konta.map((k) => (
                <li key={k.login}>
                  <button type="button" disabled={busy} onClick={() => { setL(k.login); setH(DEMO_PASSWORD); void go(k.login, DEMO_PASSWORD); }}
                    className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-line bg-card px-4 py-2 text-left hover:border-ink-2 disabled:opacity-50">
                    <span className="min-w-0"><span className="block truncate font-semibold">{k.name}</span><span className="block text-sm text-ink-2">{k.role === 'admin' ? 'Administrator' : 'Pracownik'}{k.ekipa ? `, ${k.ekipa}` : ''}</span></span>
                    <span className="text-sm text-ink-2">{k.login}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
