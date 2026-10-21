import { describe, expect, it } from 'vitest';
import { addDays, dayOf, mondayOf } from './dates.js';

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
  it('mondayOf', () => {
    expect(mondayOf('2026-10-21')).toBe('2026-10-19');
    expect(mondayOf('2026-10-19')).toBe('2026-10-19');
    expect(mondayOf('2026-10-25')).toBe('2026-10-19');
    expect(mondayOf('2026-03-29')).toBe('2026-03-23');
  });
});
