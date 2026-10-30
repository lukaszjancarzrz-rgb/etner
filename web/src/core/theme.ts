import { useSyncExternalStore } from 'react';

export type Theme = 'system' | 'light' | 'dark';
const subs = new Set<() => void>();

export function getTheme(): Theme {
  try {
    const t = localStorage.getItem('theme');
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(t: Theme = getTheme()): void {
  if (t === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}

export function setTheme(t: Theme): void {
  try { localStorage.setItem('theme', t); } catch { /* prywatne okno */ }
  applyTheme(t);
  for (const f of subs) f();
}

export const useTheme = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, getTheme);
