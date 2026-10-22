import { http, HttpResponse } from 'msw';
import { expect, it } from 'vitest';
import { login } from './session.js';
import { B, server } from './test-setup.js';

it('login: komunikaty po polsku dla złych danych, blokady i braku sieci', async () => {
  server.use(http.post(`${B}/api/login`, () => HttpResponse.json({ error: 'ZLE_DANE' }, { status: 401 })));
  expect(await login('jan', 'zle')).toBe('Nieprawidłowy login lub hasło.');
  server.use(http.post(`${B}/api/login`, () => HttpResponse.json({ error: 'ZA_DUZO_PROB' }, { status: 429 })));
  expect(await login('jan', 'zle')).toBe('Za dużo prób. Spróbuj ponownie za kilkanaście minut.');
  server.use(http.post(`${B}/api/login`, () => HttpResponse.error()));
  expect(await login('jan', 'x')).toBe('Brak połączenia z serwerem.');
});
