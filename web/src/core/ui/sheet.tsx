import * as D from '@radix-ui/react-dialog';
import { X } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { cn } from './cn.js';

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

/** Okno: na telefonie arkusz od dołu, na komputerze wyśrodkowane. */
export function Sheet({ title, description, children, className }: { title: string; description?: string; children: ReactNode; className?: string }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-40 bg-[#0a2240]/50" />
      <D.Content
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-3xl border border-line bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-card',
          'desk:inset-auto desk:top-1/2 desk:left-1/2 desk:w-[min(560px,92vw)] desk:-translate-x-1/2 desk:-translate-y-1/2 desk:rounded-3xl',
          className,
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <D.Title className="font-wide text-xl font-extrabold">{title}</D.Title>
            {description ? <D.Description className="mt-1 text-sm text-ink-2">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
          </div>
          <D.Close className="grid h-11 w-11 place-items-center rounded-full hover:bg-ink/5" aria-label="Zamknij"><X className="h-5 w-5" /></D.Close>
        </div>
        {children}
      </D.Content>
    </D.Portal>
  );
}
