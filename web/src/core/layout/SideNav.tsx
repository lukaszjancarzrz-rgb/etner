import { inSideNav, navKey, screens, type Route } from '../../routes.js';
import { SignOut } from '@phosphor-icons/react';
import { moreGroups } from '../../screens/More.js';
import { logout, useSession } from '../session.js';
import { badgeLabel, badgeText } from '../badges.js';
import { cn } from '../ui/cn.js';
import { Logo } from './Logo.js';

/** Komputer: granatowa szyna menu (224 px) z białym blokiem logo; tylko na komputerze, więc wymiary w px (bez skalowania gęstości). */
export function SideNav({ route, badges }: { route: Route; badges: Record<string, number> }) {
  const { me } = useSession();
  const admin = me?.role === 'admin';
  const more = moreGroups(admin, true).length > 0; // Więcej tylko z ekranami spoza tego menu (adres #wiecej działa dalej)
  return (
    <nav aria-label="Menu" className="fixed inset-y-0 left-0 z-30 hidden w-[224px] flex-col bg-rail text-white desk:flex">
      {/* logo na pełną szerokość szyny: hasło „INTELIGENTNY WYBÓR” ma być czytelne */}
      <Logo rail className="px-[6px] py-[12px]" />
      <ul className="grid min-h-0 content-start gap-px overflow-y-auto px-[8px] py-[12px]">
        {Object.entries(screens).filter(([k, s]) => (k === 'wiecej' ? more : inSideNav(k, admin)))
          .sort(([, a], [, b]) => (admin ? Number(!!a.adminEnd) - Number(!!b.adminEnd) : 0)).map(([k, s]) => {
          const on = navKey(route.screen) === k;
          const I = s.icon;
          const n = badges[k] ?? 0;
          return (
            <li key={k}>
              <a href={`#${k}`} aria-current={on ? 'page' : undefined}
                className={cn('flex h-[38px] items-center gap-[10px] rounded-[4px] px-[12px] text-[15px] transition-colors duration-150 focus-visible:outline-white focus-visible:outline-offset-[-2px]',
                  on ? 'bg-rail-on font-bold text-white' : 'font-medium text-rail-ink hover:bg-white/6 hover:text-white')}>
                <I className="h-[18px] w-[18px] shrink-0" weight={on ? 'fill' : 'regular'} /><span className="truncate" aria-hidden={n > 0 || undefined}>{s.title}</span>{n > 0 && <span className="sr-only">{s.title}{badgeLabel(k, n)}</span>}
                {n > 0 && <span aria-hidden className="ml-auto min-w-[22px] rounded-[3px] bg-new px-[6px] py-[2px] text-center text-[12px] font-bold leading-[16px] tabular-nums text-white">{badgeText(n)}</span>}
              </a>
            </li>
          );
        })}
      </ul>
      {me && (
        <div className="mt-auto flex items-center gap-[8px] border-t border-white/12 py-[10px] pr-[8px] pl-[20px] text-[14px]">
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{me.name}</p>
            <p className="truncate text-rail-ink">{me.role === 'admin' ? 'Administrator' : `Pracownik${me.ekipa ? `, ${me.ekipa}` : ''}`}</p>
          </div>
          {/* komputer: Więcej bywa poza menu, więc wylogowanie jest tutaj */}
          <button type="button" onClick={() => void logout()} aria-label="Wyloguj" title="Wyloguj"
            className="grid h-[40px] w-[40px] shrink-0 place-items-center rounded-[4px] text-rail-ink transition-colors duration-150 hover:bg-white/10 hover:text-white focus-visible:outline-white"><SignOut className="h-[20px] w-[20px]" /></button>
        </div>
      )}
    </nav>
  );
}
