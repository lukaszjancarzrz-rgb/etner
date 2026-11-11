import * as T from '@radix-ui/react-toast';
import { CheckCircle, Info, WarningCircle } from '@phosphor-icons/react';
import { useSyncExternalStore } from 'react';
import { cn } from './cn.js';

type Item = { id: number; title: string; body?: string; tone: 'info' | 'ok' | 'error'; action?: { label: string; onClick: () => void } };
const ICON = { info: Info, ok: CheckCircle, error: WarningCircle };
const TONE = { info: 'text-action', ok: 'text-ok', error: 'text-danger' };
let items: Item[] = [];
let n = 0;
const subs = new Set<() => void>();
const set = (v: Item[]) => { items = v; for (const f of subs) f(); };

export function toast(title: string, opts: { body?: string; tone?: Item['tone']; action?: Item['action'] } = {}): void {
  set([...items, { id: ++n, title, body: opts.body, tone: opts.tone ?? 'info', action: opts.action }]);
}

export function Toaster() {
  const list = useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => items);
  return (
    <T.Provider swipeDirection="down" duration={6000} label="Powiadomienie">
      {list.map((t) => (
        <T.Root key={t.id} onOpenChange={(o) => !o && set(items.filter((i) => i.id !== t.id))}
          className={cn('flex gap-3 rounded-[6px] border bg-card p-4 shadow-overlay', t.tone === 'error' ? 'border-danger/60' : 'border-line')}>
          {(() => { const I = ICON[t.tone]; return <I className={cn('mt-0.5 h-5 w-5 shrink-0', TONE[t.tone])} weight="fill" aria-hidden />; })()}
          <div className="min-w-0">
            <T.Title className="font-semibold">{t.title}</T.Title>
            {t.body && <T.Description className="mt-1 text-sm text-ink-2">{t.body}</T.Description>}
          </div>
          {t.action && <T.Action altText={t.action.label} onClick={t.action.onClick} className="ml-auto min-h-11 shrink-0 self-center px-2 font-semibold text-action">{t.action.label}</T.Action>}
        </T.Root>
      ))}
      <T.Viewport className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 grid gap-2 desk:inset-x-auto desk:right-6 desk:bottom-6 desk:w-96" />
    </T.Provider>
  );
}
