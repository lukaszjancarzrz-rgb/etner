import { fmtZl } from '@etner/shared';

export const MIES = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru'];
export const MIES_PELNE = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];

/** Kwota w tabeli: „1 234,50”, zero jako myślnik. */
export const kw = (gr: number | null | undefined): string => (gr ? fmtZl(gr).replace(/\s?zł$/, '') : '—');
/** Kwota do pola tekstowego: „1234,50”. */
export const zlText = (gr: number): string => (gr / 100).toFixed(2).replace('.', ',');
/** Godziny i dni (do 1 miejsca po przecinku), zero jako myślnik. */
export const lb = (v: number | null | undefined): string => (v ? v.toLocaleString('pl-PL', { maximumFractionDigits: 1 }) : '—');

/** Godziny z pola: puste = null (brak), inaczej liczba 0–744 albo błąd. */
export function parseH(text: string): number | null | 'error' {
  const s = text.trim().replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return /^\d+(\.\d+)?$/.test(s) && n <= 744 ? n : 'error';
}

/** Poprzedni miesiąc kalendarzowy (RRRR-MM) względem dnia RRRR-MM-DD. */
export function poprzedniMiesiac(dzis: string): string {
  const y = Number(dzis.slice(0, 4)), m = Number(dzis.slice(5, 7));
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}
