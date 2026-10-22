import { useMemo } from 'react';
import { useDict } from '../data.js';
import { cn } from './cn.js';

/** R30: kolor zlecenia = kolor kategorii ze słownika `kategoria`. */
export function useCatColor(): (kategoria: string | null | undefined) => string | undefined {
  const d = useDict('kategoria');
  return useMemo(() => {
    const m = new Map(d.filter((x) => x.kolor).map((x) => [x.wartosc as string, x.kolor as string]));
    return (k) => (k ? m.get(k) : undefined);
  }, [d]);
}

/** Pasek (w trybie ciemnym jaśniejszy, kontrast z kartą) i tło z odcieniem; tekst zostaje w kolorze ink. */
export const catStripe = (c: string | undefined) => (c ? `color-mix(in srgb, ${c}, white var(--crew-mix))` : 'var(--line)');
export const catTint = (c: string | undefined) => (c ? `color-mix(in srgb, ${c} 13%, transparent)` : 'color-mix(in srgb, var(--bg) 70%, transparent)');

export function CategoryPill({ name, color, className }: { name: string; color?: string; className?: string }) {
  return (
    <span className={cn('inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold text-ink', className)}
      style={{ background: catTint(color), boxShadow: `inset 0 0 0 1px ${catStripe(color)}` }}>
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: catStripe(color) }} aria-hidden />
      <span className="truncate">{name}</span>
    </span>
  );
}

/** Legenda: kategoria → kolor. */
export function CategoryLegend({ className }: { className?: string }) {
  const d = useDict('kategoria').filter((x) => x.kolor);
  if (!d.length) return null;
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-ink-2', className)} role="group" aria-label="Kolory kategorii">
      <span className="font-semibold">Kategoria:</span>
      {d.map((x) => (
        <span key={x.id} className="inline-flex items-center gap-1.5 text-ink">
          <span className="h-3 w-1 rounded-full" style={{ background: catStripe(x.kolor) }} aria-hidden />{x.wartosc}
        </span>
      ))}
    </div>
  );
}
