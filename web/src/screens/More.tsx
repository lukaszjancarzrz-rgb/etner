import { CaretRight, DotsThreeCircle, GearSix, Handshake, ListChecks, Package, SignOut, SunHorizon, UserGear, UsersThree, Van, Wrench, type Icon } from '@phosphor-icons/react';
import { badgeLabel, badgeText } from '../core/badges.js';
import { useBadges } from '../core/layout/useBadges.js';
import { logout, useSession } from '../core/session.js';
import { Button } from '../core/ui/button.js';
import { useDesk } from '../core/layout/status.js';
import { Empty } from '../core/ui/bits.js';
import { inBottomBar, inSideNav } from '../routes.js';

const Tile = ({ href, icon: I, title, hint, count = 0, sr = ' bez terminu naprawy' }: { href: string; icon: Icon; title: string; hint: string; count?: number; sr?: string }) => (
  <a href={href} className="flex min-h-16 items-center gap-4 rounded-2xl border border-line bg-card px-5 py-4 hover:border-ink-2">
    <I className="h-7 w-7 text-action" weight="duotone" />
    <span className="min-w-0 flex-1"><span className="block font-wide text-lg font-extrabold">{title}</span><span className="block text-sm text-ink-2">{hint}</span></span>
    {count > 0 && <span className="min-w-6 rounded-full bg-new px-2 py-0.5 text-center text-xs font-bold tabular-nums text-white">{badgeText(count)}<span className="sr-only">{sr}</span></span>}
    <CaretRight className="h-5 w-5 text-ink-2" />
  </a>
);

type T = { k: string; icon: Icon; title: string; hint: string | ((admin: boolean) => string) };
/** Kafelki w grupach; `admin`: grupa tylko dla admina. Klucz = ekran (`#k`). */
const GROUPS: { admin?: true; tiles: T[] }[] = [
  { tiles: [
    { k: 'auta', icon: Van, title: 'Samochody', hint: 'Usterki aut, terminy napraw' },
    { k: 'narz', icon: Wrench, title: 'Narzędzia', hint: 'Gdzie leży narzędzie: samochody i Magazyn' },
    { k: 'mag', icon: Package, title: 'Rzeczy nietypowe', hint: 'Co leży na magazynie, kto zabrał' },
  ] },
  { admin: true, tiles: [
    { k: 'leady', icon: Handshake, title: 'Leady', hint: 'Zapytania klientów, kontakty, zlecenie z leada' },
    { k: 'zad', icon: ListChecks, title: 'Zadania', hint: 'Sprawy biura: grupy, terminy, cykliczne' },
    { k: 'kl', icon: UsersThree, title: 'Klienci', hint: 'Kontakty, obiekty, leady i zlecenia klienta' },
    { k: 'uz', icon: UserGear, title: 'Użytkownicy', hint: 'Konta, hasła, kolumny harmonogramu' },
  ] },
  { tiles: [{ k: 'ust', icon: GearSix, title: 'Ustawienia', hint: (a) => (a ? 'Motyw, powiadomienia, hasło, słowniki, log błędów, kopie' : 'Motyw, powiadomienia, zmiana hasła') }] },
  { admin: true, tiles: [{ k: 'jutro', icon: SunHorizon, title: 'Na jutro', hint: 'Co ekipy biorą na następny dzień roboczy' }] },
];

/** Kafelki Więcej bez ekranów, które już są w menu: na komputerze w menu bocznym, na telefonie w dolnym pasku. */
export const moreGroups = (admin: boolean, desk: boolean): T[][] =>
  GROUPS.filter((g) => !g.admin || admin).map((g) => g.tiles.filter((t) => !(desk ? inSideNav(t.k, admin) : inBottomBar(t.k, admin)))).filter((g) => g.length);

/** Więcej: Samochody, Narzędzia, Rzeczy nietypowe; Leady, Zadania, Klienci, Użytkownicy (admin); Ustawienia; Na jutro (admin); wylogowanie. */
export function More() {
  const { me } = useSession();
  const badges = useBadges();
  const desk = useDesk();
  const admin = me?.role === 'admin';
  const groups = moreGroups(admin, desk);
  return (
    <section className="mx-auto grid max-w-2xl gap-6 px-4 py-6">
      {groups.map((g) => (
        <div key={g[0]!.k} className="grid gap-3">
          {g.map((t) => <Tile key={t.k} href={`#${t.k}`} icon={t.icon} title={t.title} hint={typeof t.hint === 'string' ? t.hint : t.hint(admin)}
            {...(t.k === 'auta' && { count: badges.auta })} {...(t.k === 'jutro' && { count: badges.jutro, sr: badgeLabel('jutro', badges.jutro ?? 0).replace(',', '') })} />)}
        </div>
      ))}
      {!desk && (
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-card p-5">
          <div className="min-w-0">
            <p className="truncate font-semibold">{me?.name}</p>
            <p className="text-sm text-ink-2">{me?.role === 'admin' ? 'Administrator' : 'Pracownik'}</p>
          </div>
          <Button variant="secondary" onClick={() => void logout()}><SignOut className="h-5 w-5" />Wyloguj</Button>
        </div>
      )}{/* komputer: konto i wylogowanie w menu bocznym */}
      {desk && !groups.length && <Empty icon={DotsThreeCircle} title="Wszystkie ekrany są w menu po lewej" />}
    </section>
  );
}
