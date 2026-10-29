import type { Me } from '@etner/shared';
import { del, get, set } from 'idb-keyval';
import { useSyncExternalStore } from 'react';
import { ApiError, api, bus, emit } from './api.js';
import { outbox } from './outbox.js';
import { forgetPushOnServer, pushState } from './push.js';
import { store } from './store.js';
import { sync } from './sync.js';
import { dropTmp } from './write.js';

/** loading – start; in – zalogowany (też offline z zapamiętanym kontem); out – brak sesji; expired – sesja wygasła, dane i kolejka zostają. */
export type Status = 'loading' | 'in' | 'out' | 'expired';
/** askLogin – przy `expired` pokazuje ekran logowania (dane i kolejka zostają pod spodem). */
let state: { status: Status; me: Me | null; askLogin?: boolean } = { status: 'loading', me: null };
const subs = new Set<() => void>();
const setState = (s: Partial<typeof state>) => { state = { ...state, ...s }; for (const f of subs) f(); };

export const getSession = () => state;
export const useSession = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state);

bus.addEventListener('session-expired', () => { if (state.status === 'in') setState({ status: 'expired' }); });
// Serwer zakończył strumień po zmianie roli, uprawnień lub ekipy: sprawdzamy konto (signedIn bierze świeży snapshot).
bus.addEventListener('resync', () => {
  api<Me>('/api/me').then(signedIn, (e) => (e instanceof ApiError && e.status === 401 ? emit('session-expired') : sync.wake()));
});

const accessChanged = (a: Me, b: Me) => a.role !== b.role || a.ekipa !== b.ekipa || JSON.stringify(a.perms) !== JSON.stringify(b.perms);

/** Ustawia konto; inny użytkownik niż zapamiętany = czyścimy dane i kolejkę z tego urządzenia; ta sama osoba z inną rolą, uprawnieniami lub ekipą = same dane (kolejka zostaje), potem świeży snapshot. */
async function signedIn(me: Me) {
  const prev = (await get('me')) as Me | undefined;
  if (prev && prev.id !== me.id) {
    sync.stop();
    await store.clear();
    await outbox.clear();
  } else if (prev && accessChanged(prev, me)) {
    sync.stop();
    await store.clear();
  }
  await set('me', me);
  setState({ status: 'in', me, askLogin: false });
  outbox.resume();
  void outbox.start(); // dopiero po sprawdzeniu konta: cudze zapisy nie pójdą z nowym ciasteczkiem
  void sync.start();
  void pushState().catch(() => {}); // istniejąca subskrypcja tego urządzenia przechodzi na zalogowaną osobę
}

/** Start aplikacji: zapamiętane konto od razu, potem /api/me (401 = ekran logowania; offline: zostaje zapamiętane konto). */
export async function startSession(): Promise<void> {
  const meReq = api<Me>('/api/me'); // równolegle z wczytaniem danych z urządzenia
  meReq.catch(() => {}); // błąd obsłużony niżej
  await store.load();
  dropTmp();
  addEventListener('online', () => { outbox.kick(); sync.wake(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { outbox.kick(); sync.wake(); }
  });

  const cached = (await get('me')) as Me | undefined;
  // zapamiętane konto od razu: ekran z danych z urządzenia bez czekania na sieć (LCP); kolejka i synchronizacja ruszają dopiero po /api/me
  if (cached) setState({ status: 'in', me: cached });
  try {
    await signedIn(await meReq);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      setState(cached ? { status: 'expired', me: cached, askLogin: true } : { status: 'out' });
      void outbox.refresh(); // licznik zapisów czekających na ponowne zalogowanie
    }
    else if (cached) { setState({ status: 'in', me: cached }); void outbox.start(); void sync.start(); } // offline
    else setState({ status: 'out' });
  }
}

export const askLogin = () => setState({ askLogin: true });

const LOGIN_ERRORS: Record<string, string> = {
  ZLE_DANE: 'Nieprawidłowy login lub hasło.',
  ZA_DUZO_PROB: 'Za dużo prób. Spróbuj ponownie za kilkanaście minut.',
};
/** Loguje; zwraca komunikat błędu po polsku albo null po sukcesie (kolejka wstrzymana wznawia się w signedIn). */
export async function login(login: string, haslo: string): Promise<string | null> {
  try {
    await signedIn(await api<Me>('/api/login', { method: 'POST', json: { login, haslo } }));
    return null;
  } catch (e) {
    if (!(e instanceof ApiError)) return 'Brak połączenia z serwerem.';
    const code = (e.body as { error?: string } | null)?.error;
    return (code && LOGIN_ERRORS[code]) || 'Nie udało się zalogować. Spróbuj ponownie.';
  }
}

export async function logout(): Promise<void> {
  await forgetPushOnServer().catch(() => {}); // powiadomienia tej osoby nie trafiają już na urządzenie, które opuściła
  await api('/api/logout', { method: 'POST' }).catch(() => {});
  sync.stop();
  await store.clear();
  await outbox.clear();
  await del('me');
  setState({ status: 'out', me: null });
}
