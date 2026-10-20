import { expect, it } from 'vitest';
import { PACKAGE } from './index.js';

it('eksportuje nazwę pakietu', () => {
  expect(PACKAGE).toBe('@etner/shared');
});
