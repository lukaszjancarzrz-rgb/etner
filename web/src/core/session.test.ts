import { keys, set } from 'idb-keyval';
import { http, HttpResponse } from 'msw';
import { expect, it, vi } from 'vitest';
import { store } from './store.js';
import { outbox } from './outbox.js';
import { getSession, login, startSession } from './session.js';
import { B, server, until } from './test-setup.js';

// Strumień w testach: atrapa (Node nie ma EventSource); musi być przed importem sync.ts.
vi.hoisted(() => {
  (globalThis as { EventSource?: unknown }).EventSource = class { addEventListener() {} close() {} readyState = 1; onerror = null; };
});

it('login: komunikaty po polsku dla złych danych, blokady i braku sieci', async () => {
  server.use(http.post(`${B}/api/login`, () => HttpResponse.json({ error: 'ZLE_DANE' }, { status: 401 })));
  expect(await login('jan', 'zle')).toBe('Nieprawidłowy login lub hasło.');
  server.use(http.post(`${B}/api/login`, () => HttpResponse.json({ error: 'ZA_DUZO_PROB' }, { status: 429 })));
  expect(await login('jan', 'zle')).toBe('Za dużo prób. Spróbuj ponownie za kilkanaście minut.');
  server.use(http.post(`${B}/api/login`, () => HttpResponse.error()));
  expect(await login('jan', 'x')).toBe('Brak połączenia z serwerem.');
});

it('start z zapamiętanym kontem: ekran od razu, kolejka nie wysyła przed /api/me; 401 → wygasła, kolejka zostaje', async () => {
  vi.stubGlobal('addEventListener', () => {});
  vi.stubGlobal('document', { addEventListener: () => {}, visibilityState: 'visible' });
  await set('me', { id: 'u1', name: 'Jan', role: 'pracownik', perms: [], ekipa: null, scheduleCol: null });
  let sent = 0;
  let answer!: () => void;
  const me = new Promise<void>((r) => { answer = r; });
  server.use(
    http.get(`${B}/api/me`, async () => { await me; return HttpResponse.json({ error: 'BRAK_SESJI' }, { status: 401 }); }),
    http.post(`${B}/api/x`, () => { sent++; return HttpResponse.json({}); }),
  );
  outbox.enqueue({ kind: 't', url: '/api/x', method: 'POST', body: {} }).catch(() => {});
  const started = startSession();
  await until(() => getSession().status === 'in');
  expect(getSession().me?.id).toBe('u1');
  await new Promise((r) => setTimeout(r, 30));
  expect(sent).toBe(0);
  answer();
  await started;
  expect(getSession()).toMatchObject({ status: 'expired', askLogin: true });
  await new Promise((r) => setTimeout(r, 30));
  expect(sent).toBe(0);
  expect((await keys()).filter((k) => String(k).startsWith('ob:'))).toHaveLength(1);
  vi.unstubAllGlobals();
});

it('to samo konto z inną ekipą (przeniesiony pracownik): dane urządzenia od nowa ze snapshotu, kolejka zostaje', async () => {
  vi.stubGlobal('addEventListener', () => {});
  vi.stubGlobal('document', { addEventListener: () => {}, visibilityState: 'visible' });
  const me = { id: 'u1', name: 'Jan', role: 'pracownik', perms: [], ekipa: 'A', scheduleCol: null };
  await set('me', me);
  await set('e:checklists', [{ id: 'c-a', ekipa: 'A' }]);
  await set('last', 7);
  let sent = 0;
  const snaps: string[] = [];
  server.use(
    http.get(`${B}/api/me`, () => HttpResponse.json({ ...me, ekipa: 'B' })),
    http.get(`${B}/api/changes`, () => HttpResponse.json({ changes: [], last: 7, more: false })),
    http.get(`${B}/api/snapshot`, () => {
      snaps.push('x');
      return HttpResponse.json({ records: [{ entity: 'checklists', id: 'c-b', data: { id: 'c-b', ekipa: 'B' } }], last: 9 });
    }),
    http.get(`${B}/api/push/key`, () => HttpResponse.json({ key: null })),
    http.post(`${B}/api/y`, () => { sent++; return HttpResponse.json({}); }),
  );
  outbox.enqueue({ kind: 't', url: '/api/y', method: 'POST', body: {} }).catch(() => {});
  await startSession();
  await until(() => snaps.length === 1 && sent === 1);
  expect(store.all('checklists').map((r) => r.id)).toEqual(['c-b']);
  expect(store.last).toBe(9);
  vi.unstubAllGlobals();
});
