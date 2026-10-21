import type { Me } from '@etner/shared';
import { del, get, set } from 'idb-keyval';
import { useSyncExternalStore } from 'react';
import { ApiError, api, bus } from './api.js';
import { outbox } from './outbox.js';
import { store } from './store.js';
import { sync } from './sync.js';

/** loading – start; in – zalogowany (też offline z zapamiętanym kontem); out – brak sesji; expired – sesja wygasła, dane i kolejka zostają. */
export type Status = 'loading' | 'in' | 'out' | 'expired';
let state: { status: Status; me: Me | null; error?: string } = { status: 'loading', me: null };
const subs = new Set<() => void>();
const setState = (s: Partial<typeof state>) => { state = { ...state, ...s }; for (const f of subs) f(); };

export const useSession = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state);

bus.addEventListener('session-expired', () => { if (state.status === 'in') setState({ status: 'expired' }); });

/** Ustawia konto; inny użytkownik niż zapamiętany = czyścimy dane i kolejkę z tego urządzenia. */
async function signedIn(me: Me) {
  const prev = (await get('me')) as Me | undefined;
  if (prev && prev.id !== me.id) {
    await store.clear();
    await outbox.clear();
  }
  await set('me', me);
  setState({ status: 'in', me, error: undefined });
  outbox.resume();
  void outbox.start(); // dopiero po sprawdzeniu konta: cudze zapisy nie pójdą z nowym ciasteczkiem
  void sync.start();
}

/** Start aplikacji: `/login#<token>` przed routerem, potem /api/me (offline: zapamiętane konto). */
export async function startSession(): Promise<void> {
  await store.load();
  addEventListener('online', () => { outbox.kick(); sync.wake(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { outbox.kick(); sync.wake(); }
  });

  if (location.pathname === '/login') {
    const token = decodeURIComponent(location.hash.slice(1));
    history.replaceState(null, '', '/#harm'); // token nie zostaje w historii
    try {
      return await signedIn(await api<Me>('/api/login', { method: 'POST', json: { token } }));
    } catch (e) {
      const offline = !(e instanceof ApiError);
      return setState({ status: 'out', error: offline ? 'Brak połączenia. Otwórz link jeszcze raz, gdy będzie zasięg.' : 'Link logowania jest nieprawidłowy lub wyłączony. Poproś o nowy.' });
    }
  }
  try {
    await signedIn(await api<Me>('/api/me'));
  } catch (e) {
    const cached = (await get('me')) as Me | undefined;
    if (e instanceof ApiError && e.status === 401) setState(cached ? { status: 'expired', me: cached } : { status: 'out' });
    else if (cached) { setState({ status: 'in', me: cached }); void outbox.start(); void sync.start(); } // offline
    else setState({ status: 'out', error: 'Brak połączenia z serwerem.' });
  }
}

export async function logout(): Promise<void> {
  await api('/api/logout', { method: 'POST' }).catch(() => {});
  sync.stop();
  await store.clear();
  await outbox.clear();
  await del('me');
  setState({ status: 'out', me: null });
}
