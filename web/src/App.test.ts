import { expect, it } from 'vitest';
import { App } from './App.js';
import { parseHash } from './routes.js';

it('App jest komponentem', () => {
  expect(typeof App).toBe('function');
});

it('trasy: #ekran/param~wyróżnienie, domyślnie harmonogram', () => {
  expect(parseHash('#zl/01J9~01K2')).toEqual({ screen: 'zl', param: '01J9', highlight: '01K2' });
  expect(parseHash('#harm/2026-10-21')).toEqual({ screen: 'harm', param: '2026-10-21' });
  expect(parseHash('#jutro~01K2')).toEqual({ screen: 'jutro', highlight: '01K2' });
  expect(parseHash('#zakupy')).toEqual({ screen: 'zakupy' });
  expect(parseHash('')).toEqual({ screen: 'harm' });
  expect(parseHash('#nieznany/x')).toEqual({ screen: 'harm', param: 'x' });
});
