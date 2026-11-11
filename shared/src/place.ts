/** Płace (moduł 4): stałe bez zod (schematy w schemas/place.ts), wspólne dla serwera i przeglądarki. */

export const FORMY = ['uop', 'zlecenie', 'inna', 'brak'] as const;
export type Forma = (typeof FORMY)[number];
export const FORMA_LABEL: Record<Forma, string> = { uop: 'Umowa o pracę', zlecenie: 'Umowa zlecenie', inna: 'Inna umowa (koszt ręcznie)', brak: 'Bez umowy' };

export const RODZAJE_WPISU = ['zaliczka', 'przelew', 'premia', 'inny'] as const;
export type RodzajWpisu = (typeof RODZAJE_WPISU)[number];
export const RODZAJ_WPISU_LABEL: Record<RodzajWpisu, string> = { zaliczka: 'Zaliczka / wypłata', przelew: 'Przelew na konto', premia: 'Premia / dodatek', inny: 'Inny koszt firmy' };

/** Parametry płac na rok: składki i stawki jako ułamki (0,0976), kwoty w groszach. */
export interface Parametry {
  placaMinGr: number; emP: number; rentP: number; chor: number; zdr: number; pit: number; kwotaZmnGr: number; kupGr: number; kupZl: number;
  emF: number; rentF: number; wyp: number; fp: number; fgsp: number; godzDnia: number; urlopMin: number; urlopMax: number; godzUrlop: number;
}

/** Stawki na 2026 r. (przepisy; zmieniane w Ustawieniach, gdy zmienią się przepisy). */
export const PARAMETRY_2026: Parametry = {
  placaMinGr: 480_600, emP: 0.0976, rentP: 0.015, chor: 0.0245, zdr: 0.09, pit: 0.12, kwotaZmnGr: 30_000, kupGr: 25_000, kupZl: 0.2,
  emF: 0.0976, rentF: 0.065, wyp: 0.0167, fp: 0.0245, fgsp: 0.001, godzDnia: 8, urlopMin: 20, urlopMax: 26, godzUrlop: 8,
};

/** Parametry miesiąca (RRRR-MM albo RRRR): z jego roku, inaczej z najbliższego wcześniejszego, inaczej domyślne 2026. */
export function parametryMiesiaca(mapa: Record<string, Parametry>, miesiac: string): Parametry {
  const rok = miesiac.slice(0, 4);
  const lata = Object.keys(mapa).filter((y) => y <= rok).sort();
  return lata.length ? { ...PARAMETRY_2026, ...mapa[lata[lata.length - 1]!] } : PARAMETRY_2026;
}
