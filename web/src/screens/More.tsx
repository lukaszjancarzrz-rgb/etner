import { Desktop, Moon, SignOut, Sun } from '@phosphor-icons/react';
import { logout, useSession } from '../core/session.js';
import { setTheme, useTheme, type Theme } from '../core/theme.js';
import { Button } from '../core/ui/button.js';
import { cn } from '../core/ui/cn.js';

const opts: { v: Theme; label: string; icon: typeof Sun }[] = [
  { v: 'system', label: 'Auto', icon: Desktop },
  { v: 'light', label: 'Jasny', icon: Sun },
  { v: 'dark', label: 'Ciemny', icon: Moon },
];

/** Więcej: na razie Ustawienia (motyw) i wylogowanie; zadanie 18 dokłada resztę. */
export function More() {
  const theme = useTheme();
  const { me } = useSession();
  return (
    <section className="mx-auto grid max-w-2xl gap-6 px-4 py-6">
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
