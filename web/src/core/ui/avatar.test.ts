import { describe, expect, it } from 'vitest';
import { avatarColor, initials } from './avatar.js';

describe('avatar', () => {
  it('inicjały: pierwsza i ostatnia litera słów, wielkie (także polskie)', () => {
    expect(initials('Bartek Gawlik')).toBe('BG');
    expect(initials('  łukasz  jan  żak ')).toBe('ŁŻ');
    expect(initials('Szef')).toBe('S');
    expect(initials('')).toBe('?');
  });
  it('kolor: stały dla id, z palety, różne id dają różne kolory', () => {
    expect(avatarColor('01ABC')).toBe(avatarColor('01ABC'));
    expect(avatarColor('x')).toMatch(/^#[0-9a-f]{6}$/);
    expect(new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(avatarColor)).size).toBeGreaterThan(3);
  });
});
