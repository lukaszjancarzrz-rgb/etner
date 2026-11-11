import { useDesk } from '../core/layout/status.js';
import { Segmented } from '../core/ui/bits.js';
import { Select } from '../core/ui/select.js';
import { go, screens } from '../routes.js';
import { ZAPLECZE, zapamietaj } from './Zaplecze.js';

/** Pasek zakładek nad ekranem Zaplecza (Shell, tylko admin); osobny pakiet – nie obciąża startu aplikacji. */
export default function ZapleczeTabs({ screen, badges }: { screen: string; badges: Record<string, number> }) {
  const desk = useDesk();
  zapamietaj(screen);
  const opts = ZAPLECZE.map((k) => ({ v: k as string, label: screens[k]!.title, count: badges[k] ?? 0 }));
  return (
    <nav aria-label="Zaplecze" className={desk ? 'mx-auto max-w-[1400px] px-8 pt-5' : 'mx-auto max-w-3xl px-4 pt-4'}>
      {desk ? <Segmented label="Zaplecze" value={screen} onChange={(k) => go(`#${k}`)} options={opts} className="max-w-3xl" />
        : <Select aria-label="Zaplecze" value={screen} onValueChange={(k) => go(`#${k}`)} options={opts.map((o) => ({ value: o.v, label: o.label, count: o.count }))} />}
    </nav>
  );
}
