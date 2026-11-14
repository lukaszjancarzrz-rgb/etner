import { describe, expect, it } from 'vitest';
import { mapsUrl } from './data.js';

describe('mapsUrl (Nawiguj)', () => {
  const q = (s: string) => `https://www.google.com/maps/search/?api=1&query=${s}`;
  it('link z https, bez https, współrzędne, sam adres, nic', () => {
    expect(mapsUrl({ id: '1', mapa: 'https://maps.app.goo.gl/abc' })).toBe('https://maps.app.goo.gl/abc');
    expect(mapsUrl({ id: '1', mapa: 'maps.app.goo.gl/abc' })).toBe('https://maps.app.goo.gl/abc');
    expect(mapsUrl({ id: '1', mapa: 'www.google.com/maps/place/x' })).toBe('https://www.google.com/maps/place/x');
    expect(mapsUrl({ id: '1', mapa: '49.6235, 19.5312' })).toBe(q('49.6235,19.5312'));
    expect(mapsUrl({ id: '1', mapa: '49,6235 19,5312' })).toBe(q('49.6235,19.5312'));
    expect(mapsUrl({ id: '1', adres: 'Krótka 1', miejscowosc: 'Zawoja', mapa: '' })).toBe(q(encodeURIComponent('Krótka 1, Zawoja')));
    expect(mapsUrl({ id: '1', mapa: 'Zawoja Centrum' })).toBe(q(encodeURIComponent('Zawoja Centrum')));
    expect(mapsUrl({ id: '1' })).toBeUndefined();
  });
});
