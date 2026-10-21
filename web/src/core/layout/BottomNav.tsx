import { screens, type Route } from '../../routes.js';
import { badgeText } from '../badges.js';
import { cn } from '../ui/cn.js';

export function BottomNav({ route, badges }: { route: Route; badges: Record<string, number> }) {
  return (
    <nav aria-label="Menu" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card pb-[env(safe-area-inset-bottom)] desk:hidden">
      <ul className="grid grid-cols-5">
        {Object.entries(screens).filter(([, s]) => s.nav !== false).map(([k, s]) => {
          const on = route.screen === k || (k === 'wiecej' && route.screen === 'kl');
          const I = s.icon;
          const n = badges[k] ?? 0;
          return (
            <li key={k}>
              <a href={`#${k}`} aria-current={on ? 'page' : undefined} aria-label={n ? `${s.title}, ${n} nowe` : undefined}
                className={cn('flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold leading-none transition-colors duration-200', on ? 'text-action' : 'text-ink-2')}>
                <span className={cn('relative grid h-8 w-14 place-items-center rounded-full transition-colors duration-200', on && 'bg-action/12')}>
                  <I className="h-6 w-6" weight={on ? 'fill' : 'regular'} />
                  {n > 0 && <span aria-hidden className="absolute -top-1 left-[calc(50%+0.4rem)] min-w-5 rounded-full bg-danger px-1.5 py-0.5 text-center font-sans text-[11px] font-bold leading-none tabular-nums text-bg ring-2 ring-card">{badgeText(n)}</span>}
                </span>
                <span className="font-narrow">{s.title}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
