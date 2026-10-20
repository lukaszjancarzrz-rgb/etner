import { expect, it } from 'vitest';
import { App } from './App.js';

it('App jest komponentem', () => {
  expect(typeof App).toBe('function');
});
