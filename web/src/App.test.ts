import { expect, it } from 'vitest';
import { App } from './App.js';
import { parseHash, seg } from './routes.js';

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
  expect(parseHash('#kl/01J9')).toEqual({ screen: 'kl', param: '01J9' });
  expect(parseHash('#auta~01K2')).toEqual({ screen: 'auta', highlight: '01K2' });
  expect(parseHash('#psz/01S/Rekuperacja')).toEqual({ screen: 'psz', param: '01S/Rekuperacja', parts: ['01S', 'Rekuperacja'] });
});

it('trasy: segmenty odkodowane po podziale (kategoria z „/”, „~” i spacją)', () => {
  const kat = 'C.O./C.W.U. ~x';
  expect(parseHash(`#psz/01S/${seg(kat)}/wpis~01J`)).toEqual({ screen: 'psz', param: `01S/${kat}/wpis`, parts: ['01S', kat, 'wpis'], highlight: '01J' });
  expect(parseHash(`#psz/01S/${seg(kat)}`).parts).toEqual(['01S', kat]);
  expect(parseHash('#zl/%E2%80%A6%zle')).toEqual({ screen: 'zl', param: '%E2%80%A6%zle' }); // zły zapis: bez wyjątku
});
