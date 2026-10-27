import { CaretRight, GearSix, Handshake, ListChecks, SignOut, UserGear, UsersThree, Van, type Icon } from '@phosphor-icons/react';
import { logout, useSession } from '../core/session.js';
import { Button } from '../core/ui/button.js';

const Tile = ({ href, icon: I, title, hint }: { href: string; icon: Icon; title: string; hint: string }) => (
  <a href={href} className="flex min-h-16 items-center gap-4 rounded-2xl border border-line bg-card px-5 py-4 hover:border-ink-2">
    <I className="h-7 w-7 text-action" weight="duotone" />
    <span className="min-w-0 flex-1"><span className="block font-wide text-lg font-extrabold">{title}</span><span className="block text-sm text-ink-2">{hint}</span></span>
    <CaretRight className="h-5 w-5 text-ink-2" />
  </a>
);

/** Więcej: Samochody; Leady, Zadania, Klienci, Użytkownicy (admin); Ustawienia, wylogowanie. */
export function More() {
  const { me } = useSession();
  return (
    <section className="mx-auto grid max-w-2xl gap-6 px-4 py-6">
      <div className="grid gap-3">
        <Tile href="#auta" icon={Van} title="Samochody" hint="Usterki aut, terminy napraw" />
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
