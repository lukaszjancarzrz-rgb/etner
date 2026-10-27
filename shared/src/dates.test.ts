import { describe, expect, it } from 'vitest';
import { addDays, addMonths, dayOf, mondayOf, nextWorkday } from './dates.js';
import { nextTermin } from './schemas/zadania.js';

describe('dates', () => {
  it('dayOf w Europe/Warsaw', () => {
    expect(dayOf('2026-10-20T22:30:00Z')).toBe('2026-10-21');
    expect(dayOf('2026-03-29T00:30:00Z')).toBe('2026-03-29');
    expect(dayOf(new Date('2026-06-30T22:30:00Z'))).toBe('2026-07-01');
  });
  it('addDays przez zmianę czasu', () => {
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
    expect(addDays('2026-10-26', -2)).toBe('2026-10-24');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('nextWorkday: pomija weekend i święta', () => {
    expect(nextWorkday('2026-10-22')).toBe('2026-10-23'); // czw → pt
    expect(nextWorkday('2026-10-23')).toBe('2026-10-26'); // pt → pon
    expect(nextWorkday('2026-10-24')).toBe('2026-10-26'); // sob → pon
    expect(nextWorkday('2026-10-25')).toBe('2026-10-26'); // niedz → pon
    expect(nextWorkday('2026-11-10')).toBe('2026-11-12'); // wt, środa 11.11 święto → czw
    expect(nextWorkday('2026-10-27', ['2026-10-28'])).toBe('2026-10-29'); // dodatkowy dzień wolny
  });
  it('mondayOf', () => {
    expect(mondayOf('2026-10-21')).toBe('2026-10-19');
    expect(mondayOf('2026-10-19')).toBe('2026-10-19');
    expect(mondayOf('2026-10-25')).toBe('2026-10-19');
    expect(mondayOf('2026-03-29')).toBe('2026-03-23');
  });
  it('addMonths: koniec miesiąca, rok przestępny, przełom roku', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-03-31', 1)).toBe('2026-04-30');
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
    expect(addMonths('2026-10-22', 1)).toBe('2026-11-22');
  });
  it('nextTermin dla każdego cyklu', () => {
    const t = '2026-08-31';
    expect(['1t', '2t', '1m', '3m', '6m', '1r'].map((c) => nextTermin(t, c as never))).toEqual(['2026-09-07', '2026-09-14', '2026-09-30', '2026-11-30', '2027-02-28', '2027-08-31']);
  });
});
