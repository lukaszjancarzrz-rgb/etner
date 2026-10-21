import { useSyncExternalStore } from 'react';
import { bus } from '../api.js';
import { outbox } from '../outbox.js';

export const useOnline = () =>
  useSyncExternalStore((f) => { addEventListener('online', f); addEventListener('offline', f); return () => { removeEventListener('online', f); removeEventListener('offline', f); }; }, () => navigator.onLine);

export const useQueued = () =>
  useSyncExternalStore((f) => { bus.addEventListener('outbox', f); return () => bus.removeEventListener('outbox', f); }, () => outbox.pending());
