import { navKey, screens, type Route } from '../../routes.js';
import { useSession } from '../session.js';
import { badgeLabel, badgeText } from '../badges.js';
import { cn } from '../ui/cn.js';
import { Logo } from './Logo.js';

export function SideNav({ route, badges }: { route: Route; badges: Record<string, number> }) {
  const { me } = useSession();
  return (
    <nav aria-label="Menu" className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-card desk:flex">
      <div className="stripes h-1.5" aria-hidden />
      <div className="flex h-16 items-center gap-3 px-5">
        <Logo />
      </div>
      <ul className="grid gap-1 px-3 py-2">
        {Object.entries(screens).filter(([, s]) => s.nav !== false && (!s.admin || me?.role === 'admin')).map(([k, s]) => {
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
        <div className="mt-auto border-t border-line px-5 py-4 text-sm">
          <p className="truncate font-semibold">{me.name}</p>
          <p className="text-ink-2">{me.role === 'admin' ? 'Administrator' : `Pracownik${me.ekipa ? `, ${me.ekipa}` : ''}`}</p>
        </div>
      )}
    </nav>
  );
}
