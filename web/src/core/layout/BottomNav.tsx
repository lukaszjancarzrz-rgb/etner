import { screens, type Route } from '../../routes.js';
import { cn } from '../ui/cn.js';

export function BottomNav({ route }: { route: Route }) {
  return (
    <nav aria-label="Menu" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card pb-[env(safe-area-inset-bottom)] desk:hidden">
      <ul className="grid grid-cols-5">
        {Object.entries(screens).filter(([, s]) => s.nav !== false).map(([k, s]) => {
          const on = route.screen === k || (k === 'wiecej' && route.screen === 'kl');
          const I = s.icon;
          return (
            <li key={k}>
              <a href={`#${k}`} aria-current={on ? 'page' : undefined}
                className={cn('flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold leading-none transition-colors duration-200', on ? 'text-action' : 'text-ink-2')}>
                <span className={cn('grid h-8 w-14 place-items-center rounded-full transition-colors duration-200', on && 'bg-action/12')}>
                  <I className="h-6 w-6" weight={on ? 'fill' : 'regular'} />
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
