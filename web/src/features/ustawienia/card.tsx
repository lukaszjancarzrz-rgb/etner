import type { Sun } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { cn } from '../../core/ui/cn.js';

/** Karta sekcji ustawień: tytuł z ikoną, podpowiedź, treść. */
export const Card = ({ title, icon: I, hint, children, className }: { title: string; icon: typeof Sun; hint?: string; children: ReactNode; className?: string }) => (
  <section aria-label={title} className={cn('grid content-start gap-4 rounded-2xl border border-line bg-card p-5', className)}>
    <div>
      <h2 className="flex items-center gap-2 font-wide text-lg font-extrabold"><I className="h-5 w-5 text-action" weight="duotone" />{title}</h2>
      {hint && <p className="mt-1 text-sm text-ink-2">{hint}</p>}
    </div>
    {children}
  </section>
);
