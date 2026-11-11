import { describe, expect, it } from 'vitest';
import { brutto, fmtZl, toGr } from './money.js';

describe('toGr', () => {
  it('parsuje formaty', () => {
    expect(toGr('1 234,56')).toBe(123456);
    expect(toGr('1 234,56')).toBe(123456);
    expect(toGr('1234.5')).toBe(123450);
    expect(toGr('1234')).toBe(123400);
    expect(toGr('-12,30')).toBe(-1230);
    expect(toGr('0,005')).toBe(1);
    expect(toGr('19,99')).toBe(1999);
  });
  it('odrzuca śmieci (rzuca błąd)', () => {
    for (const s of ['', 'abc', '1,2,3', '12zł', '--1']) expect(() => toGr(s)).toThrow();
  });
});

describe('fmtZl', () => {
  it('formatuje z twardą spacją', () => {
    expect(fmtZl(123456)).toBe('1 234,56 zł');
    expect(fmtZl(5)).toBe('0,05 zł');
    expect(fmtZl(-123456)).toBe('-1 234,56 zł');
  });
});

describe('brutto', () => {
  it('liczy VAT', () => {
    expect(brutto(10000, 23)).toBe(12300);
    expect(brutto(10000, 'zw')).toBe(10000);
    expect(brutto(10000, 0)).toBe(10000);
    expect(brutto(1, 50)).toBe(2); // 1.5 -> half up
  });
});
