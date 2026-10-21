import * as T from '@radix-ui/react-toast';
import { useSyncExternalStore } from 'react';
import { cn } from './cn.js';

type Item = { id: number; title: string; body?: string; tone: 'info' | 'ok' | 'error' };
let items: Item[] = [];
let n = 0;
const subs = new Set<() => void>();
const set = (v: Item[]) => { items = v; for (const f of subs) f(); };

export function toast(title: string, opts: { body?: string; tone?: Item['tone'] } = {}): void {
  set([...items, { id: ++n, title, body: opts.body, tone: opts.tone ?? 'info' }]);
}

export function Toaster() {
  const list = useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => items);
  return (
    <T.Provider swipeDirection="down" duration={6000} label="Powiadomienie">
      {list.map((t) => (
        <T.Root key={t.id} onOpenChange={(o) => !o && set(items.filter((i) => i.id !== t.id))}
          className={cn('rounded-2xl border border-line bg-card p-4 shadow-card border-l-4', t.tone === 'error' ? 'border-l-danger' : t.tone === 'ok' ? 'border-l-ok' : 'border-l-action')}>
          <T.Title className="font-semibold">{t.title}</T.Title>
          {t.body && <T.Description className="mt-1 text-sm text-ink-2">{t.body}</T.Description>}
        </T.Root>
      ))}
      <T.Viewport className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 grid gap-2 desk:inset-x-auto desk:right-6 desk:bottom-6 desk:w-96" />
    </T.Provider>
  );
}
