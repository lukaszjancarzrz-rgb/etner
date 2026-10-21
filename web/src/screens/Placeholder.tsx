import type { Route } from '../routes.js';
import { screens } from '../routes.js';

/** Zaślepka ekranu do zadania 18. */
export function Placeholder({ route }: { route: Route }) {
  const s = screens[route.screen]!;
  const I = s.icon;
  return (
    <section className="mx-auto grid max-w-xl place-items-center gap-3 px-4 py-20 text-center">
      <I className="h-12 w-12 text-ink-2" weight="duotone" />
      <h2 className="font-wide text-2xl font-extrabold">{s.title}</h2>
      <p className="max-w-[40ch] text-ink-2">Ten ekran pojawi się w kolejnej wersji aplikacji.</p>
    </section>
  );
}
