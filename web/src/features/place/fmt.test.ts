import { describe, expect, it } from 'vitest';
import { parseH, poprzedniMiesiac, zlText } from './fmt.js';

describe('fmt płac', () => {
  it('godziny z pola', () => {
    expect(parseH('')).toBeNull();
    expect(parseH(' 168,5 ')).toBe(168.5);
    expect(parseH('0')).toBe(0);
    expect(parseH('abc')).toBe('error');
    expect(parseH('-1')).toBe('error');
    expect(parseH('745')).toBe('error');
  });
  it('poprzedni miesiąc', () => {
    expect(poprzedniMiesiac('2026-11-11')).toBe('2026-10');
    expect(poprzedniMiesiac('2026-01-05')).toBe('2025-12');
  });
  it('kwota do pola', () => expect(zlText(123450)).toBe('1234,50'));
});
