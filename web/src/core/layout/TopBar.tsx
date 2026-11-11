import { CloudArrowUp, WifiSlash } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { askLogin, useSession } from '../session.js';
import { Mark } from './Logo.js';
import { useOnline, useQueued } from './status.js';

/** Liczba pozycji listy obok tytułu ekranu (komputer); ekran renderuje `<TitleCount n={…} />` gdziekolwiek w swojej treści. */
export function TitleCount({ n }: { n: number }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => setEl(document.getElementById('title-count')), []);
  return el && createPortal(<><span className="sr-only">, pozycji: </span>{n}</>, el);
}

/** Telefon: granatowy pasek jak szyna menu na komputerze; komputer: tytuł ekranu na tle strony. */
export function TopBar({ title }: { title: string }) {
  const online = useOnline();
  const queued = useQueued();
  const { status } = useSession();
  return (
    <header className="sticky top-0 z-30 bg-rail pt-[env(safe-area-inset-top)] text-white desk:border-b desk:border-line desk:bg-bg/95 desk:text-ink desk:backdrop-blur">
      <div className="flex h-14 items-center gap-3 px-4 desk:h-[47px] desk:px-[32px]">
        <span className="desk:hidden"><Mark className="h-8 w-8 text-white" /></span>
        <h1 className="min-w-0 flex-1 truncate text-2xl font-extrabold tracking-[-0.01em] desk:text-[1.75rem]">{title}<span id="title-count" className="ml-3 hidden text-lg font-semibold tracking-normal text-ink-2 desk:inline" /></h1>
        <div className="flex items-center gap-2" aria-live="polite">
          {!online && (
            <span className="inline-flex h-8 items-center gap-1.5 rounded-[4px] bg-white px-2.5 text-sm font-bold text-[#0a2240] desk:bg-ink desk:text-bg">
              <WifiSlash className="h-4 w-4" weight="bold" />Offline
            </span>
          )}
          {queued > 0 && (
            <span className="inline-flex h-8 items-center gap-1.5 rounded-[4px] border border-white/40 px-2.5 text-sm font-semibold desk:border-line" title="Zapisy czekające na wysłanie">
              <CloudArrowUp className="h-4 w-4 desk:text-action" weight="bold" />{queued}<span className="sr-only desk:not-sr-only"> w kolejce</span>
            </span>
          )}
        </div>
      </div>
      {status === 'expired' && (
        <div role="alert" className="border-y border-line bg-card px-4 py-3 text-sm text-ink desk:border-b-0 desk:px-[32px]">
          <p className="font-semibold"><button type="button" onClick={askLogin} className="text-action underline underline-offset-2">Zaloguj się ponownie</button></p>
          <p className="text-ink-2">Sesja wygasła.{queued > 0 && ` Zapisy (${queued}) czekają w kolejce i wyślą się po zalogowaniu.`}</p>
        </div>
      )}
    </header>
  );
}
