import { Briefcase, CalendarDots, DotsThreeCircle, GearSix, Handshake, IdentificationCard, ListChecks, Package, ShoppingCart, SunHorizon, UserGear, UsersThree, Van, Wrench, type Icon } from '@phosphor-icons/react';
import { lazy, useSyncExternalStore, type ComponentType } from 'react';
import { More } from './screens/More.js';

/** `parts`: odkodowane segmenty parametru, gdy jest ich kilka (np. `#psz/<siteId>/<kategoria>`; w kategorii może być „/” i „~”). */
export type Route = { screen: string; param?: string; highlight?: string; parts?: string[] };

const dec = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };
/** Segment adresu: „/” i „~” zakodowane (encodeURIComponent zostawia „~”). */
export const seg = (s: string) => encodeURIComponent(s).replace(/~/g, '%7E');

/** `#<screen>/<param>~<highlightId>`, np. `#zl/01J..~01K..`, `#harm/2026-10-21`, `#jutro~01K..`. Najpierw podział, potem odkodowanie każdego segmentu. */
export function parseHash(hash: string): Route {
  const [path = '', hl] = hash.replace(/^#/, '').split('~');
  const [screen = '', ...rest] = path.split('/').map(dec);
  const param = rest.join('/');
  const highlight = hl && dec(hl);
  return { screen: screens[screen] ? screen : 'harm', ...(param && { param }), ...(rest.length > 1 && { parts: rest }), ...(highlight && { highlight }) };
}

/**
 * `nav`: brak = dolny pasek i menu boczne; 'side' = tylko menu boczne i kafelek w Więcej; false = poza menu. `admin` = tylko admin (inni: „Brak dostępu”).
 * `adminEnd`: u admina poza dolnym paskiem, na końcu menu bocznego i kafelków Więcej (pracownik bez zmian).
 */
export type Screen = { title: string; icon: Icon; component: ComponentType<{ route: Route }>; nav?: false | 'side'; admin?: true; adminEnd?: true; moreOnly?: true };

// Ekrany ładowane osobno (mniejszy pierwszy pakiet JS); `preload` = pobranie pakietu bez renderu.
const lazyScreen = (f: () => Promise<{ default: ComponentType<{ route: Route }> }>) => Object.assign(lazy(f), { preload: f });
const Harmonogram = lazyScreen(() => import('./features/harmonogram/Harmonogram.js').then((m) => ({ default: m.Harmonogram })));
const Zlecenia = lazyScreen(() => import('./features/zlecenia/Zlecenia.js').then((m) => ({ default: m.Zlecenia })));
const Zakupy = lazyScreen(() => import('./features/zakupy/Zakupy.js').then((m) => ({ default: m.Zakupy })));
const NaJutro = lazyScreen(() => import('./features/na-jutro/NaJutro.js').then((m) => ({ default: m.NaJutro })));
const Leady = lazyScreen(() => import('./features/leady/Leady.js').then((m) => ({ default: m.Leady })));
const Zadania = lazyScreen(() => import('./features/zadania/Zadania.js').then((m) => ({ default: m.Zadania })));
const Uzytkownicy = lazyScreen(() => import('./features/uzytkownicy/Uzytkownicy.js').then((m) => ({ default: m.Uzytkownicy })));
const Ustawienia = lazyScreen(() => import('./features/ustawienia/Ustawienia.js').then((m) => ({ default: m.Ustawienia })));
const Samochody = lazyScreen(() => import('./features/samochody/Samochody.js').then((m) => ({ default: m.Samochody })));
const Narzedzia = lazyScreen(() => import('./features/narzedzia/Narzedzia.js').then((m) => ({ default: m.Narzedzia })));
const Magazyn = lazyScreen(() => import('./features/magazyn/Magazyn.js').then((m) => ({ default: m.Magazyn })));
const Teczka = lazyScreen(() => import('./features/paszport/Teczka.js').then((m) => ({ default: m.Teczka })));
const Paszporty = lazyScreen(() => import('./features/paszport/Paszporty.js').then((m) => ({ default: m.Paszporty })));
const Klienci = lazyScreen(() => import('./features/klienci/Klienci.js').then((m) => ({ default: m.Klienci })));

/** Ekrany w kolejności menu. */
export const screens: Record<string, Screen> = {
  harm: { title: 'Harmonogram', icon: CalendarDots, component: Harmonogram },
  jutro: { title: 'Na jutro', icon: SunHorizon, component: NaJutro, adminEnd: true }, // admin rzadko: koniec menu
  zl: { title: 'Zlecenia', icon: Briefcase, component: Zlecenia },
  leady: { title: 'Leady', icon: Handshake, component: Leady, nav: 'side', admin: true },
  paszporty: { title: 'Paszporty', icon: IdentificationCard, component: Paszporty, nav: 'side', moreOnly: true },
  zakupy: { title: 'Zakupy', icon: ShoppingCart, component: Zakupy },
  auta: { title: 'Samochody', icon: Van, component: Samochody, nav: 'side' },
  narz: { title: 'Narzędzia', icon: Wrench, component: Narzedzia, nav: 'side' },
  mag: { title: 'Rzeczy nietypowe', icon: Package, component: Magazyn, nav: 'side' },
  zad: { title: 'Zadania', icon: ListChecks, component: Zadania, nav: 'side', admin: true },
  uz: { title: 'Użytkownicy', icon: UserGear, component: Uzytkownicy, nav: 'side', admin: true, moreOnly: true },
  ust: { title: 'Ustawienia', icon: GearSix, component: Ustawienia, nav: 'side', moreOnly: true },
  wiecej: { title: 'Więcej', icon: DotsThreeCircle, component: More },
  kl: { title: 'Klienci', icon: UsersThree, component: Klienci, nav: false },
  ld: { title: 'Leady', icon: Handshake, component: Leady, nav: false, admin: true },
  psz: { title: 'Paszport', icon: IdentificationCard, component: Teczka, nav: false },
};

/** Pakiet ekranu z adresu startowego pobierany od razu, równolegle z danymi z urządzenia (krótszy łańcuch do LCP). */
export const preloadScreen = (hash: string): void => { void (screens[parseHash(hash).screen]!.component as { preload?: () => Promise<unknown> }).preload?.().catch(() => {}); };

let cached: { hash: string; route: Route } = { hash: '\0', route: { screen: 'harm' } };
const snapshot = () => {
  if (cached.hash !== location.hash) cached = { hash: location.hash, route: parseHash(location.hash) };
  return cached.route;
};
export const useRoute = (): Route =>
  useSyncExternalStore((f) => { addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, snapshot);

/** Czy ekran jest w dolnym pasku telefonu (reszta: w Więcej). */
export const inBottomBar = (k: string, admin: boolean): boolean => screens[k]?.nav === undefined && !(admin && screens[k]!.adminEnd);

/** Czy ekran jest w menu bocznym komputera (bez Więcej). */
export const inSideNav = (k: string, admin: boolean): boolean => k !== 'wiecej' && screens[k]?.nav !== false && !screens[k]!.moreOnly && (!screens[k]!.admin || admin);

/** Ekran podświetlany w menu: `ld` (karta leada) → Leady, `psz` (teczka) → Paszporty, `kl` i ekrany tylko z Więcej → Więcej. */
export const navKey = (screen: string): string => (screen === 'ld' ? 'leady' : screen === 'psz' ? 'wiecej' : screen === 'kl' || screens[screen]?.moreOnly ? 'wiecej' : screen);

// poprzedni adres w aplikacji (np. po zapisie wpisu: „wstecz”, gdy przyszliśmy z teczki – bez podwójnego wpisu historii)
let prevHash = '';
if (typeof addEventListener === 'function') addEventListener('hashchange', (e) => { prevHash = new URL(e.oldURL).hash; });
/** Czy poprzedni ekran to `hash` (porównanie po odkodowaniu). */
export const cameFrom = (hash: string): boolean => !!prevHash && JSON.stringify(parseHash(prevHash)) === JSON.stringify(parseHash(hash));

export const go = (hash: string): void => { location.hash = hash.replace(/^#?/, '#'); };
