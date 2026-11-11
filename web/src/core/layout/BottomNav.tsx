import { inBottomBar, screens, type Route } from '../../routes.js';
import { useIsAdmin } from '../data.js';
import { badgeLabel, badgeText } from '../badges.js';
import { cn } from '../ui/cn.js';
import { zapleczeBadge } from '../../screens/Zaplecze.js';

export function BottomNav({ route, badges }: { route: Route; badges: Record<string, number> }) {
  const admin = useIsAdmin();
  const items = Object.entries(screens).filter(([k]) => inBottomBar(k, admin));
  return (
    <nav aria-label="Menu" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card pb-[env(safe-area-inset-bottom)] desk:hidden">
      <ul className={cn('grid', items.length === 4 ? 'grid-cols-4' : 'grid-cols-5')}>
        {items.map(([k, s]) => {
          const on = route.screen === k || (k === 'wiecej' && !!screens[route.screen] && !inBottomBar(route.screen, admin)); // ekrany spoza paska są w Więcej
          const I = s.icon;
          const n = (k === 'wiecej' ? (admin ? zapleczeBadge(badges) : badges.auta) : badges[k]) ?? 0; // telefon: Samochody (u admina całe Zaplecze) są w Więcej
          return (
            <li key={k}>
              <a href={`#${k}`} aria-current={on ? 'page' : undefined}
                className={cn('flex h-16 flex-col items-center justify-center gap-1 font-cond text-[13px] leading-none transition-colors duration-150', on ? 'font-bold text-action' : 'font-semibold text-ink-2')}>
                <span className={cn('relative grid h-8 w-14 place-items-center rounded-[4px] transition-colors duration-150', on && 'bg-action/12')}>
                  <I className="h-6 w-6" weight={on ? 'fill' : 'regular'} />
                  {n > 0 && <span aria-hidden className="absolute -top-1 left-[calc(50%+0.4rem)] min-w-5 rounded-[3px] bg-new px-1.5 py-0.5 text-center text-[11px] font-bold leading-none tabular-nums text-white ring-2 ring-card">{badgeText(n)}</span>}
                </span>
                <span className="max-w-full truncate px-0.5 tracking-[0.01em]" aria-hidden={n > 0 || undefined}>{s.title}</span>{n > 0 && <span className="sr-only">{s.title}{badgeLabel(k === 'wiecej' && admin ? 'zap' : k, n)}</span>}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
