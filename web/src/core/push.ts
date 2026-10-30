import { api } from './api.js';

/** Krótka nazwa urządzenia z user-agenta (lista urządzeń po stronie serwera). */
export function deviceLabel(ua: string): string {
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Urządzenie';
  const br = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  return br ? `${os}, ${br}` : os;
}

/** iPhone/iPad w zwykłej karcie Safari: push działa dopiero z ikony na ekranie początkowym. */
export const needsHomeScreen = (ua: string, standalone: boolean) => /iPhone|iPad|iPod/.test(ua) && !standalone;

export type PushState = 'brak' | 'ios' | 'serwer' | 'wlaczone' | 'wylaczone' | 'zablokowane';

const isIos = (ua: string) => /iPhone|iPad|iPod/.test(ua);
const supported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const standalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
/** Rejestracja service workera; brak (np. tryb deweloperski) albo brak odpowiedzi w 5 s = null, bez wiszenia. */
async function reg(): Promise<ServiceWorkerRegistration | null> {
  if (!(await navigator.serviceWorker.getRegistration())) return null;
  return Promise.race([navigator.serviceWorker.ready, new Promise<null>((res) => setTimeout(() => res(null), 5000))]);
}

const b64 = (s: string) => Uint8Array.from(atob((s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
/** Ten sam klucz serwera (VAPID) co w subskrypcji przeglądarki. */
export const sameKey = (a: ArrayBuffer | null | undefined, b: Uint8Array) => !!a && a.byteLength === b.length && new Uint8Array(a).every((x, i) => x === b[i]);

const send = (sub: PushSubscription) => {
  const j = sub.toJSON();
  return api('/api/push/subscribe', { method: 'POST', json: { endpoint: j.endpoint, keys: j.keys, device: deviceLabel(navigator.userAgent) } });
};

/**
 * Stan na tym urządzeniu (bez pytania o zgodę). Istniejąca subskrypcja jest zapisywana ponownie na bieżącego użytkownika
 * (inna osoba mogła się wylogować na tym telefonie), a przy zmienionym kluczu serwera tworzona od nowa.
 */
export async function pushState(): Promise<PushState> {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  if (!supported() || needsHomeScreen(ua, standalone())) return isIos(ua) ? 'ios' : 'brak';
  const r = await reg();
  if (!r) return 'brak';
  const { key } = await api<{ key: string | null }>('/api/push/key');
  if (!key) return 'serwer';
  if (Notification.permission === 'denied') return 'zablokowane';
  let sub = await r.pushManager.getSubscription();
  if (!sub || Notification.permission !== 'granted') return 'wylaczone';
  if (!sameKey(sub.options.applicationServerKey, b64(key))) {
    await sub.unsubscribe();
    sub = await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) });
  }
  await send(sub);
  return 'wlaczone';
}

export async function enablePush(): Promise<PushState> {
  if ((await Notification.requestPermission()) !== 'granted') return Notification.permission === 'denied' ? 'zablokowane' : 'wylaczone';
  const r = await reg();
  if (!r) return 'brak';
  const { key } = await api<{ key: string | null }>('/api/push/key');
  if (!key) return 'serwer';
  let sub = await r.pushManager.getSubscription();
  if (sub && !sameKey(sub.options.applicationServerKey, b64(key))) { await sub.unsubscribe(); sub = null; }
  await send(sub ?? await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) }));
  return 'wlaczone';
}

export async function disablePush(): Promise<PushState> {
  const sub = await (await reg())?.pushManager.getSubscription();
  if (sub) {
    await api('/api/push/unsubscribe', { method: 'POST', json: { endpoint: sub.endpoint } });
    await sub.unsubscribe();
  }
  return 'wylaczone';
}

/** Przy wylogowaniu: serwer przestaje wysyłać na to urządzenie (subskrypcja przeglądarki zostaje dla następnej osoby). */
export async function forgetPushOnServer(): Promise<void> {
  if (!supported()) return;
  const sub = await (await reg())?.pushManager.getSubscription();
  if (sub) await api('/api/push/unsubscribe', { method: 'POST', json: { endpoint: sub.endpoint } });
}

export const testPush = () => api<{ sent: number }>('/api/push/test', { method: 'POST' });
