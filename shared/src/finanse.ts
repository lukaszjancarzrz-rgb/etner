/** Finanse (moduł 3a): stałe i funkcje bez zod (schematy w schemas/finanse.ts), wspólne dla serwera i przeglądarki. */

export const SPOSOBY = ['bez', 'vat8', 'vat23', 'zwrot'] as const;
export type Sposob = (typeof SPOSOBY)[number];
export const SPOSOB_LABEL: Record<Sposob, string> = { bez: 'Bez faktury', vat8: 'Faktura VAT 8%', vat23: 'Faktura VAT 23%', zwrot: 'Zwrot VAT z US' };

const STAWKA: Partial<Record<Sposob, number>> = { vat8: 8, vat23: 23 };

/** Kwota wpisana jako brutto (vat8/vat23) albo bez VAT (bez/zwrot) → netto i VAT w groszach. */
export function rozbij(kwotaGr: number, sposob: Sposob): { nettoGr: number; vatGr: number } {
  const s = STAWKA[sposob];
  if (!s) return { nettoGr: kwotaGr, vatGr: 0 };
  const nettoGr = Math.round((kwotaGr * 100) / (100 + s));
  return { nettoGr, vatGr: kwotaGr - nettoGr };
}

/** Miesiąc (RRRR-MM), do którego liczy się przychód: „inny miesiąc” ma pierwszeństwo przed datą. */
export const miesiacPrzychodu = (dzien: string | null, innyMiesiac: string | null): string | null =>
  innyMiesiac || (dzien ? dzien.slice(0, 7) : null);
