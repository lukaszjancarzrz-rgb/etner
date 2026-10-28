import { screens, type Route } from '../../routes.js';
import { badgeLabel, badgeText } from '../badges.js';
import { cn } from '../ui/cn.js';

export function BottomNav({ route, badges }: { route: Route; badges: Record<string, number> }) {
  return (
    <nav aria-label="Menu" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card pb-[env(safe-area-inset-bottom)] desk:hidden">
      <ul className="grid grid-cols-5">
        {Object.entries(screens).filter(([, s]) => s.nav === undefined).map(([k, s]) => {
          const on = route.screen === k || (k === 'wiecej' && screens[route.screen]?.nav !== undefined); // ekrany spoza paska są w Więcej
          const I = s.icon;
          const n = (k === 'wiecej' ? badges.auta : badges[k]) ?? 0; // telefon: Samochody są w Więcej
          return (
            <li key={k}>
              <a href={`#${k}`} aria-current={on ? 'page' : undefined}
                className={cn('flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold leading-none transition-colors duration-200', on ? 'text-action' : 'text-ink-2')}>
                <span className={cn('relative grid h-8 w-14 place-items-center rounded-full transition-colors duration-200', on && 'bg-action/12')}>
                  <I className="h-6 w-6" weight={on ? 'fill' : 'regular'} />
                  {n > 0 && <span aria-hidden className="absolute -top-1 left-[calc(50%+0.4rem)] min-w-5 rounded-full bg-new px-1.5 py-0.5 text-center font-sans text-[11px] font-bold leading-none tabular-nums text-white ring-2 ring-card">{badgeText(n)}</span>}
                </span>
                <span className="font-narrow" aria-hidden={n > 0 || undefined}>{s.title}</span>{n > 0 && <span className="sr-only">{s.title}{badgeLabel(k, n)}</span>}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
