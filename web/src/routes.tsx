import { Briefcase, CalendarDots, DotsThreeCircle, ShoppingCart, SunHorizon, UsersThree, type Icon } from '@phosphor-icons/react';
import { lazy, useSyncExternalStore, type ComponentType } from 'react';
import { Placeholder } from './screens/Placeholder.js';
import { More } from './screens/More.js';

export type Route = { screen: string; param?: string; highlight?: string };

/** `#<screen>/<param>~<highlightId>`, np. `#zl/01J..~01K..`, `#harm/2026-10-21`, `#jutro~01K..`. */
export function parseHash(hash: string): Route {
  const h = decodeURIComponent(hash.replace(/^#/, ''));
  const [path = '', highlight] = h.split('~');
  const [screen, ...rest] = path.split('/');
  const param = rest.join('/');
  return { screen: screen && screens[screen] ? screen : 'harm', ...(param && { param }), ...(highlight && { highlight }) };
}

export type Screen = { title: string; icon: Icon; component: ComponentType<{ route: Route }>; nav?: false };

// Ekrany ładowane osobno (mniejszy pierwszy pakiet JS).
const Harmonogram = lazy(() => import('./features/harmonogram/Harmonogram.js').then((m) => ({ default: m.Harmonogram })));
const Zlecenia = lazy(() => import('./features/zlecenia/Zlecenia.js').then((m) => ({ default: m.Zlecenia })));
const Zakupy = lazy(() => import('./features/zakupy/Zakupy.js').then((m) => ({ default: m.Zakupy })));
const Klienci = lazy(() => import('./features/klienci/Klienci.js').then((m) => ({ default: m.Klienci })));

/** Ekrany w kolejności menu; `nav: false` = poza menu. */
export const screens: Record<string, Screen> = {
  harm: { title: 'Harmonogram', icon: CalendarDots, component: Harmonogram },
  jutro: { title: 'Na jutro', icon: SunHorizon, component: Placeholder },
  zl: { title: 'Zlecenia', icon: Briefcase, component: Zlecenia },
  zakupy: { title: 'Zakupy', icon: ShoppingCart, component: Zakupy },
  wiecej: { title: 'Więcej', icon: DotsThreeCircle, component: More },
  kl: { title: 'Klienci', icon: UsersThree, component: Klienci, nav: false },
};

let cached: { hash: string; route: Route } = { hash: '\0', route: { screen: 'harm' } };
const snapshot = () => {
  if (cached.hash !== location.hash) cached = { hash: location.hash, route: parseHash(location.hash) };
  return cached.route;
};
export const useRoute = (): Route =>
  useSyncExternalStore((f) => { addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, snapshot);

export const go = (hash: string): void => { location.hash = hash.replace(/^#?/, '#'); };
