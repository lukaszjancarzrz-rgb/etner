import { expect, it } from 'vitest';
import { newId } from './ids.js';

it('newId zwraca unikalny ULID', () => {
  const a = newId();
  expect(a).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  expect(newId()).not.toBe(a);
});
