import { describe, expect, it } from 'vitest';
import { genPassword, move } from './model.js';

describe('genPassword', () => {
  it('12 znaków, bez 0 O o 1 l I, różne za każdym razem', () => {
    const all = Array.from({ length: 200 }, () => genPassword());
    for (const p of all) {
      expect(p).toHaveLength(12);
      expect(p).toMatch(/^[a-zA-Z2-9]+$/);
      expect(p).not.toMatch(/[0Oo1lI]/);
    }
    expect(new Set(all).size).toBe(200);
  });
});

describe('move', () => {
  it('zamienia z sąsiadem, na brzegach bez zmian', () => {
    expect(move(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(move(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
    const l = ['a', 'b'];
    expect(move(l, 0, -1)).toBe(l);
    expect(move(l, 1, 1)).toBe(l);
  });
});
