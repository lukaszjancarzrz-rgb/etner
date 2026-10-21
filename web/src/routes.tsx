import { Briefcase, CalendarDots, DotsThreeCircle, ShoppingCart, SunHorizon, type Icon } from '@phosphor-icons/react';
import { useSyncExternalStore, type ComponentType } from 'react';
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

export type Screen = { title: string; icon: Icon; component: ComponentType<{ route: Route }> };

/** Ekrany w kolejności menu (zadanie 18 podmienia komponenty). */
export const screens: Record<string, Screen> = {
  harm: { title: 'Harmonogram', icon: CalendarDots, component: Placeholder },
  jutro: { title: 'Na jutro', icon: SunHorizon, component: Placeholder },
  zl: { title: 'Zlecenia', icon: Briefcase, component: Placeholder },
  zakupy: { title: 'Zakupy', icon: ShoppingCart, component: Placeholder },
  wiecej: { title: 'Więcej', icon: DotsThreeCircle, component: More },
};

let cached: { hash: string; route: Route } = { hash: '\0', route: { screen: 'harm' } };
const snapshot = () => {
  if (cached.hash !== location.hash) cached = { hash: location.hash, route: parseHash(location.hash) };
  return cached.route;
};
export const useRoute = (): Route =>
  useSyncExternalStore((f) => { addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, snapshot);

export const go = (hash: string): void => { location.hash = hash.replace(/^#?/, '#'); };
