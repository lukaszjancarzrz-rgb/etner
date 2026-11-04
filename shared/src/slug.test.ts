import { expect, it } from 'vitest';
import { slug } from './slug.js';

it('slug: małe litery, bez polskich znaków, inne znaki → jeden „-”', () => {
  expect(slug('Klimatyzacja')).toBe('klimatyzacja');
  expect(slug('Pompy ciepła / C.O.')).toBe('pompy-ciepla-c-o');
  expect(slug('Łazienka Żółć Ąę ŚŃ')).toBe('lazienka-zolc-ae-sn');
  expect(slug('  ')).toBe('');
});
