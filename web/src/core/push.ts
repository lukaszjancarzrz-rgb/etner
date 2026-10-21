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

const supported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const standalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
const reg = () => navigator.serviceWorker.ready;

/** Stan na tym urządzeniu (bez pytania o zgodę). */
export async function pushState(): Promise<PushState> {
  if (needsHomeScreen(navigator.userAgent, standalone())) return 'ios';
  if (!supported()) return 'brak';
  const { key } = await api<{ key: string | null }>('/api/push/key');
  if (!key) return 'serwer';
  if (Notification.permission === 'denied') return 'zablokowane';
  const sub = await (await reg()).pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'wlaczone' : 'wylaczone';
}

const b64 = (s: string) => Uint8Array.from(atob((s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

export async function enablePush(): Promise<PushState> {
  if ((await Notification.requestPermission()) !== 'granted') return Notification.permission === 'denied' ? 'zablokowane' : 'wylaczone';
  const { key } = await api<{ key: string | null }>('/api/push/key');
  if (!key) return 'serwer';
  const r = await reg();
  const sub = (await r.pushManager.getSubscription()) ?? await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) });
  const j = sub.toJSON();
  await api('/api/push/subscribe', { method: 'POST', json: { endpoint: j.endpoint, keys: j.keys, device: deviceLabel(navigator.userAgent) } });
  return 'wlaczone';
}

export async function disablePush(): Promise<PushState> {
  const sub = await (await reg()).pushManager.getSubscription();
  if (sub) {
    await api('/api/push/unsubscribe', { method: 'POST', json: { endpoint: sub.endpoint } });
    await sub.unsubscribe();
  }
  return 'wylaczone';
}

export const testPush = () => api<{ sent: number }>('/api/push/test', { method: 'POST' });
