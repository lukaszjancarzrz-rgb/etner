import { useEffect } from 'react';

/** Zakładki Zaplecza (tylko admin): te same ekrany i adresy co dotąd, jedna pozycja w menu. */
export const ZAPLECZE = ['auta', 'narz', 'mag', 'jutro'] as const;
let ostatnia: string = ZAPLECZE[0];
export const zapamietaj = (k: string) => { ostatnia = k; };

/** Znaczek Zaplecza w menu: suma znaczków jego zakładek. */
export const zapleczeBadge = (badges: Record<string, number>): number => ZAPLECZE.reduce((s, k) => s + (badges[k] ?? 0), 0);

/** `#zap` – przejście do ostatnio otwartej zakładki (bez wpisu w historii). */
export function Zaplecze() {
  useEffect(() => { location.replace(`#${ostatnia}`); }, []);
  return null;
}
