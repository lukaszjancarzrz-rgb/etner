import { expect, it } from 'vitest';
import { newId, newOrderedId } from './ids.js';

it('newId zwraca unikalny ULID', () => {
  const a = newId();
  expect(a).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  expect(newId()).not.toBe(a);
});

it('newOrderedId rośnie także w tej samej milisekundzie', () => {
  const ids = Array.from({ length: 50 }, () => newOrderedId());
  expect([...ids].sort()).toEqual(ids);
});
