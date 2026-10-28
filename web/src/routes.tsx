import { Briefcase, CalendarDots, DotsThreeCircle, GearSix, Handshake, ListChecks, Package, ShoppingCart, SunHorizon, UserGear, UsersThree, Van, Wrench, type Icon } from '@phosphor-icons/react';
import { lazy, useSyncExternalStore, type ComponentType } from 'react';
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

/** `nav`: brak = dolny pasek i menu boczne; 'side' = tylko menu boczne i kafelek w Więcej; false = poza menu. `admin` = tylko admin (inni: „Brak dostępu”). */
export type Screen = { title: string; icon: Icon; component: ComponentType<{ route: Route }>; nav?: false | 'side'; admin?: true };

// Ekrany ładowane osobno (mniejszy pierwszy pakiet JS).
const Harmonogram = lazy(() => import('./features/harmonogram/Harmonogram.js').then((m) => ({ default: m.Harmonogram })));
const Zlecenia = lazy(() => import('./features/zlecenia/Zlecenia.js').then((m) => ({ default: m.Zlecenia })));
const Zakupy = lazy(() => import('./features/zakupy/Zakupy.js').then((m) => ({ default: m.Zakupy })));
const NaJutro = lazy(() => import('./features/na-jutro/NaJutro.js').then((m) => ({ default: m.NaJutro })));
const Leady = lazy(() => import('./features/leady/Leady.js').then((m) => ({ default: m.Leady })));
const Zadania = lazy(() => import('./features/zadania/Zadania.js').then((m) => ({ default: m.Zadania })));
const Uzytkownicy = lazy(() => import('./features/uzytkownicy/Uzytkownicy.js').then((m) => ({ default: m.Uzytkownicy })));
const Ustawienia = lazy(() => import('./features/ustawienia/Ustawienia.js').then((m) => ({ default: m.Ustawienia })));
const Samochody = lazy(() => import('./features/samochody/Samochody.js').then((m) => ({ default: m.Samochody })));
const Narzedzia = lazy(() => import('./features/narzedzia/Narzedzia.js').then((m) => ({ default: m.Narzedzia })));
const Magazyn = lazy(() => import('./features/magazyn/Magazyn.js').then((m) => ({ default: m.Magazyn })));
const Klienci = lazy(() => import('./features/klienci/Klienci.js').then((m) => ({ default: m.Klienci })));

/** Ekrany w kolejności menu. */
export const screens: Record<string, Screen> = {
  harm: { title: 'Harmonogram', icon: CalendarDots, component: Harmonogram },
  jutro: { title: 'Na jutro', icon: SunHorizon, component: NaJutro },
  zl: { title: 'Zlecenia', icon: Briefcase, component: Zlecenia },
  zakupy: { title: 'Zakupy', icon: ShoppingCart, component: Zakupy },
  auta: { title: 'Samochody', icon: Van, component: Samochody, nav: 'side' },
  narz: { title: 'Narzędzia', icon: Wrench, component: Narzedzia, nav: 'side' },
  mag: { title: 'Rzeczy nietypowe', icon: Package, component: Magazyn, nav: 'side' },
  leady: { title: 'Leady', icon: Handshake, component: Leady, nav: 'side', admin: true },
  zad: { title: 'Zadania', icon: ListChecks, component: Zadania, nav: 'side', admin: true },
  uz: { title: 'Użytkownicy', icon: UserGear, component: Uzytkownicy, nav: 'side', admin: true },
  ust: { title: 'Ustawienia', icon: GearSix, component: Ustawienia, nav: 'side' },
  wiecej: { title: 'Więcej', icon: DotsThreeCircle, component: More },
  kl: { title: 'Klienci', icon: UsersThree, component: Klienci, nav: false },
  ld: { title: 'Leady', icon: Handshake, component: Leady, nav: false, admin: true },
};

let cached: { hash: string; route: Route } = { hash: '\0', route: { screen: 'harm' } };
const snapshot = () => {
  if (cached.hash !== location.hash) cached = { hash: location.hash, route: parseHash(location.hash) };
  return cached.route;
};
export const useRoute = (): Route =>
  useSyncExternalStore((f) => { addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, snapshot);

/** Ekran podświetlany w menu: `ld` (karta leada) → Leady, `kl` → Więcej. */
export const navKey = (screen: string): string => (screen === 'ld' ? 'leady' : screen === 'kl' ? 'wiecej' : screen);

export const go = (hash: string): void => { location.hash = hash.replace(/^#?/, '#'); };
