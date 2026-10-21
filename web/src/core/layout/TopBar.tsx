import { CloudArrowUp, WifiSlash } from '@phosphor-icons/react';
import { useSession } from '../session.js';
import { Logo } from './Logo.js';
import { useOnline, useQueued } from './status.js';

export function TopBar({ title }: { title: string }) {
  const online = useOnline();
  const queued = useQueued();
  const { status } = useSession();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-card/95 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="stripes h-1 desk:hidden" aria-hidden />
      <div className="flex h-14 items-center gap-3 px-4 desk:h-16 desk:px-8">
        <span className="desk:hidden"><Logo className="h-8 w-8" /></span>
        <h1 className="min-w-0 flex-1 truncate font-wide text-xl font-extrabold desk:text-2xl">{title}</h1>
        <div className="flex items-center gap-2" aria-live="polite">
          {!online && (
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-ink px-3 text-sm font-semibold text-bg">
              <WifiSlash className="h-4 w-4" weight="bold" />Offline
            </span>
          )}
          {queued > 0 && (
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line px-3 text-sm font-semibold" title="Zapisy czekające na wysłanie">
              <CloudArrowUp className="h-4 w-4 text-action" weight="bold" />{queued}<span className="sr-only desk:not-sr-only"> w kolejce</span>
            </span>
          )}
        </div>
      </div>
      {status === 'expired' && (
        <div role="alert" className="border-t border-line bg-action/10 px-4 py-3 text-sm desk:px-8">
          <p className="font-semibold">Zaloguj się ponownie</p>
          <p className="text-ink-2">Sesja wygasła. Otwórz swój link logowania jeszcze raz.{queued > 0 && ` Zapisy (${queued}) czekają w kolejce i wyślą się po zalogowaniu.`}</p>
        </div>
      )}
    </header>
  );
}
