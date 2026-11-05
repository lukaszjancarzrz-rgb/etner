import 'fake-indexeddb/auto';
import { clear } from 'idb-keyval';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import { cfg } from './api.js';

export const B = 'http://etner.test';
export const server = setupServer();
beforeAll(() => { cfg.base = B; server.listen({ onUnhandledRequest: 'error' }); });
beforeEach(() => clear());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

export async function until(cond: () => boolean, ms = 2000): Promise<void> {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('until: przekroczony czas');
    await new Promise((r) => setTimeout(r, 5));
  }
}
