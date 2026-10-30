// Garbage input throws (never NaN): a silent NaN would end up as a price.
export function toGr(text: string): number {
  const s = text.replace(/[\s  ]/g, '').replace(',', '.');
  const m = /^(-?)(\d+(?:\.\d+)?)$/.exec(s);
  if (!m) throw new Error(`Nieprawidłowa kwota: "${text}"`);
  // exponent shift keeps decimal rounding exact (1.005 -> 101)
  const gr = Math.round(Number(`${m[2]}e2`));
  return m[1] ? -gr : gr;
}

const zl = new Intl.NumberFormat('pl-PL', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  // pl-PL skips grouping for 4-digit numbers by default; TS lib types lack 'always'
  useGrouping: 'always' as unknown as boolean,
});

export const fmtZl = (gr: number): string => `${zl.format(gr / 100)} zł`;

export function brutto(nettoGr: number, vat: number | 'zw'): number {
  if (vat === 'zw') return nettoGr;
  return Math.floor((nettoGr * (100 + vat) + 50) / 100); // half up
}
