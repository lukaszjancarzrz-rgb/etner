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
    <span className={cn('inline-flex max-w-full items-center gap-1.5 rounded-[3px] px-1.5 py-0.5 text-xs font-semibold text-ink', className)}
      style={{ background: catTint(color), boxShadow: `inset 0 0 0 1px ${catStripe(color)}` }}>
      <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: catStripe(color) }} aria-hidden />
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
          <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: catStripe(x.kolor) }} aria-hidden />{x.wartosc}
        </span>
      ))}
    </div>
  );
}

/** Skróty branż ustalone przez właściciela (2026-11-05). */
const FIXED: Record<string, string> = { elektryka: 'EL', rekuperacja: 'RW', klimatyzacja: 'KL', fotowoltaika: 'PV', 'alarmy i monitoring': 'AM' };

const letters = (s: string) => s.replace(/[^\p{L}\p{N}]/gu, '').toUpperCase();
/** Kandydaci na skrót: pierwsze litery dwóch słów, dwie pierwsze litery, potem pierwsza z każdą następną. */
function candidates(name: string): string[] {
  const words = name.trim().split(/\s+/).map(letters).filter(Boolean);
  const all = words.join('');
  const out = words.length > 1 ? [words[0]![0]! + words[1]![0]!] : [];
  if (all.length > 1) out.push(all.slice(0, 2));
  for (const ch of all.slice(2)) out.push(all[0]! + ch);
  return out;
}

/** Skrót każdej kategorii słownika: stałe skróty właściciela, reszta deterministycznie i bez powtórzeń w słowniku. */
export function catAbbrevs(names: readonly string[]): Map<string, string> {
  const m = new Map<string, string>();
  const used = new Set<string>();
  for (const n of names) { const f = FIXED[n.trim().toLowerCase()]; if (f) { m.set(n, f); used.add(f); } }
  for (const n of names) {
    if (m.has(n)) continue;
    const c = candidates(n);
    let a = c.find((x) => !used.has(x));
    for (let i = 2; !a || used.has(a); i++) a = (letters(n)[0] ?? '?') + i; // ostatecznie litera i cyfra
    m.set(n, a);
    used.add(a);
  }
  return m;
}

/** Skrót kategorii (spoza słownika: dwie pierwsze litery). */
export function useCatAbbr(): (kategoria: string) => string {
  const d = useDict('kategoria');
  return useMemo(() => {
    const m = catAbbrevs(d.map((x) => x.wartosc as string));
    return (k) => m.get(k) ?? FIXED[k.trim().toLowerCase()] ?? candidates(k)[0] ?? letters(k);
  }, [d]);
}

/** Biały albo granatowy tekst na kolorze kategorii, co da kontrast ≥4.5:1 (kolor ustawia admin). */
export function inkOn(hex: string | undefined): string {
  const m = hex?.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return '#ffffff';
  const h = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join('') : m[1]!;
  const lin = (i: number) => { const c = parseInt(h.slice(i, i + 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin(0) + 0.7152 * lin(2) + 0.0722 * lin(4);
  return 1.05 / (L + 0.05) >= 4.5 ? '#ffffff' : '#0a2240';
}

/** Zakładka-indeks branży: skrót (Condensed 800) na kolorze kategorii; `flush` = przy lewej krawędzi wiersza. Dekoracja: nazwę podaje otoczenie. */
export function CatTab({ name, flush, className }: { name: string; flush?: boolean; className?: string }) {
  const color = useCatColor()(name);
  const abbr = useCatAbbr()(name);
  const bg = color ?? '#4a5d70';
  return (
    <span aria-hidden title={name} style={{ background: bg, color: inkOn(bg) }}
      className={cn('inline-block w-10 shrink-0 py-0.5 text-center font-cond text-[0.8rem] leading-tight font-extrabold', flush ? 'rounded-r-[3px]' : 'rounded-[3px]', className)}>{abbr}</span>
  );
}
