import { inSideNav, navKey, screens, type Route } from '../../routes.js';
import { SignOut } from '@phosphor-icons/react';
import { moreGroups } from '../../screens/More.js';
import { logout, useSession } from '../session.js';
import { badgeLabel, badgeText } from '../badges.js';
import { cn } from '../ui/cn.js';
import { Logo } from './Logo.js';

export function SideNav({ route, badges }: { route: Route; badges: Record<string, number> }) {
  const { me } = useSession();
  const admin = me?.role === 'admin';
  const more = moreGroups(admin, true).length > 0; // Więcej tylko z ekranami spoza tego menu (adres #wiecej działa dalej)
  return (
    <nav aria-label="Menu" className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-card desk:flex">
      <div className="stripes h-1.5" aria-hidden />
      <div className="flex h-16 items-center gap-3 px-5">
        <Logo />
      </div>
      <ul className="grid gap-1 px-3 py-2">
        {Object.entries(screens).filter(([k, s]) => (k === 'wiecej' ? more : inSideNav(k, admin)))
          .sort(([, a], [, b]) => (admin ? Number(!!a.adminEnd) - Number(!!b.adminEnd) : 0)).map(([k, s]) => {
          const on = navKey(route.screen) === k;
          const I = s.icon;
          const n = badges[k] ?? 0;
          return (
            <li key={k}>
              <a href={`#${k}`} aria-current={on ? 'page' : undefined}
                className={cn('flex h-12 items-center gap-3 rounded-full px-4 font-semibold transition-colors duration-200', on ? 'bg-ink text-bg' : 'text-ink-2 hover:bg-ink/5 hover:text-ink')}>
                <I className="h-5 w-5" weight={on ? 'fill' : 'regular'} /><span aria-hidden={n > 0 || undefined}>{s.title}</span>{n > 0 && <span className="sr-only">{s.title}{badgeLabel(k, n)}</span>}
                {n > 0 && <span aria-hidden className="ml-auto min-w-6 rounded-full bg-new px-2 py-0.5 text-center text-xs font-bold tabular-nums text-white">{badgeText(n)}</span>}
              </a>
            </li>
          );
        })}
      </ul>
      {me && (
        <div className="mt-auto flex items-center gap-2 border-t border-line py-3 pr-3 pl-5 text-sm">
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{me.name}</p>
            <p className="text-ink-2">{me.role === 'admin' ? 'Administrator' : `Pracownik${me.ekipa ? `, ${me.ekipa}` : ''}`}</p>
          </div>
          {/* komputer: Więcej bywa poza menu, więc wylogowanie jest tutaj */}
          <button type="button" onClick={() => void logout()} aria-label="Wyloguj" title="Wyloguj"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-2 transition-colors duration-200 hover:bg-ink/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-action"><SignOut className="h-5 w-5" /></button>
        </div>
      )}
    </nav>
  );
}
