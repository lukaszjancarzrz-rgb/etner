import { CaretRight, GearSix, Handshake, ListChecks, Package, SignOut, UserGear, UsersThree, Van, Wrench, type Icon } from '@phosphor-icons/react';
import { autaCount, badgeText } from '../core/badges.js';
import { logout, useSession } from '../core/session.js';
import { useEntities } from '../core/store.js';
import { withoutEchoes } from '../core/write.js';
import { Button } from '../core/ui/button.js';

const Tile = ({ href, icon: I, title, hint, count = 0 }: { href: string; icon: Icon; title: string; hint: string; count?: number }) => (
  <a href={href} className="flex min-h-16 items-center gap-4 rounded-2xl border border-line bg-card px-5 py-4 hover:border-ink-2">
    <I className="h-7 w-7 text-action" weight="duotone" />
    <span className="min-w-0 flex-1"><span className="block font-wide text-lg font-extrabold">{title}</span><span className="block text-sm text-ink-2">{hint}</span></span>
    {count > 0 && <span className="min-w-6 rounded-full bg-new px-2 py-0.5 text-center text-xs font-bold tabular-nums text-white">{badgeText(count)}<span className="sr-only"> bez terminu naprawy</span></span>}
    <CaretRight className="h-5 w-5 text-ink-2" />
  </a>
);

/** Więcej: Samochody, Narzędzia, Rzeczy nietypowe; Leady, Zadania, Klienci, Użytkownicy (admin); Ustawienia, wylogowanie. */
export function More() {
  const { me } = useSession();
  const faults = useEntities('car_faults');
  return (
    <section className="mx-auto grid max-w-2xl gap-6 px-4 py-6">
      <div className="grid gap-3">
        <Tile href="#auta" icon={Van} title="Samochody" hint="Usterki aut, terminy napraw" count={autaCount(withoutEchoes(faults, ['carId', 'opis', 'by']))} />
        <Tile href="#narz" icon={Wrench} title="Narzędzia" hint="Gdzie leży narzędzie: samochody i Magazyn" />
        <Tile href="#mag" icon={Package} title="Rzeczy nietypowe" hint="Co leży na magazynie, kto zabrał" />
      </div>
      {me?.role === 'admin' && (
        <div className="grid gap-3">
          <Tile href="#leady" icon={Handshake} title="Leady" hint="Zapytania klientów, kontakty, zlecenie z leada" />
          <Tile href="#zad" icon={ListChecks} title="Zadania" hint="Sprawy biura: grupy, terminy, cykliczne" />
          <Tile href="#kl" icon={UsersThree} title="Klienci" hint="Kontakty, obiekty, leady i zlecenia klienta" />
          <Tile href="#uz" icon={UserGear} title="Użytkownicy" hint="Konta, hasła, kolumny harmonogramu" />
        </div>
      )}
      <Tile href="#ust" icon={GearSix} title="Ustawienia" hint={me?.role === 'admin' ? 'Motyw, powiadomienia, hasło, słowniki, log błędów, kopie' : 'Motyw, powiadomienia, zmiana hasła'} />
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-card p-5">
        <div className="min-w-0">
          <p className="truncate font-semibold">{me?.name}</p>
          <p className="text-sm text-ink-2">{me?.role === 'admin' ? 'Administrator' : 'Pracownik'}</p>
        </div>
        <Button variant="secondary" onClick={() => void logout()}><SignOut className="h-5 w-5" />Wyloguj</Button>
      </div>
    </section>
  );
}
