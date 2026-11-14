import { describe, expect, it } from 'vitest';
import { chwilaPl, fmtMinuty, godzinaPl, limitStopu, oknoEdycjiOd, wOknieEdycji } from './czas.js';

describe('czasomierz', () => {
  it('chwilaPl i godzinaPl (zima/lato)', () => {
    expect(chwilaPl('2026-11-16', '20:00')).toBe('2026-11-16T19:00:00.000Z');
    expect(chwilaPl('2026-07-01', '7:05')).toBe('2026-07-01T05:05:00.000Z');
    expect(godzinaPl('2026-11-16T06:12:00.000Z')).toBe('7:12');
  });
  it('limit: 11 h od startu albo 20:00', () => {
    expect(limitStopu(chwilaPl('2026-11-16', '07:12'))).toBe(chwilaPl('2026-11-16', '18:12'));
    expect(limitStopu(chwilaPl('2026-11-16', '10:00'))).toBe(chwilaPl('2026-11-16', '20:00'));
    expect(limitStopu(chwilaPl('2026-11-16', '21:00'))).toBe(chwilaPl('2026-11-17', '08:00'));
  });
  it('okno edycji: ten i poprzedni tydzień', () => {
    expect(oknoEdycjiOd('2026-11-18')).toBe('2026-11-09');
    expect(wOknieEdycji('2026-11-08', '2026-11-18')).toBe(false);
    expect(wOknieEdycji('2026-11-09', '2026-11-18')).toBe(true);
    expect(wOknieEdycji('2026-11-19', '2026-11-18')).toBe(false);
  });
  it('fmtMinuty', () => { expect(fmtMinuty(508)).toBe('8 h 28 min'); expect(fmtMinuty(45)).toBe('45 min'); expect(fmtMinuty(540)).toBe('9 h 00 min'); });
});
