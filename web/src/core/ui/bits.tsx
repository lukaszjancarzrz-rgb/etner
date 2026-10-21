import type { Icon } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { cn } from './cn.js';

/** Nagłówek sekcji: blok z paskiem po lewej (motyw ze strony ETNER). */
export const SectionTitle = ({ children, count, className, right }: { children: ReactNode; count?: number; className?: string; right?: ReactNode }) => (
  <div className={cn('flex items-center justify-between gap-3', className)}>
    <h2 className="flex items-baseline gap-2 border-l-4 border-action pl-3 font-wide text-base font-extrabold">
      {children}{count !== undefined && <span className="font-sans text-sm font-semibold text-ink-2">{count}</span>}
    </h2>
    {right}
  </div>
);

/** Pusty stan: ikona, zdanie, podpowiedź co zrobić. */
export const Empty = ({ icon: I, title, hint, children }: { icon: Icon; title: string; hint?: string; children?: ReactNode }) => (
  <div className="grid place-items-center gap-2 rounded-2xl border border-dashed border-line px-6 py-10 text-center">
    <I className="h-10 w-10 text-ink-2" weight="duotone" />
    <p className="font-semibold">{title}</p>
    {hint && <p className="max-w-[44ch] text-sm text-ink-2">{hint}</p>}
    {children}
  </div>
);

export const Badge = ({ children, tone = 'line', className }: { children: ReactNode; tone?: 'line' | 'ok' | 'action' | 'warn' | 'ink'; className?: string }) => (
  <span className={cn('inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap', {
    line: 'border border-line text-ink-2',
    ok: 'bg-ok text-white',
    action: 'bg-action/12 text-action',
    warn: 'border border-danger/50 text-danger',
    ink: 'bg-ink text-bg',
  }[tone], className)}>{children}</span>
);

/** Przełącznik w kształcie pigułki (radio). */
export function Segmented<T extends string>({ value, onChange, options, label, className }: {
  value: T; onChange: (v: T) => void; options: { v: T; label: string }[]; label: string; className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('grid auto-cols-fr grid-flow-col gap-1 rounded-full border border-line p-1', className)}>
      {options.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={value === o.v} onClick={() => onChange(o.v)}
          className={cn('h-10 truncate rounded-full px-3 text-sm font-semibold transition-colors duration-200', value === o.v ? 'bg-ink text-bg' : 'text-ink-2 hover:text-ink')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const Textarea = ({ className, ...p }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea
    className={cn('min-h-24 w-full rounded-xl border border-line bg-card px-4 py-3 text-base text-ink placeholder:text-ink-2 focus:border-action focus:outline-none focus:ring-2 focus:ring-action/30 aria-invalid:border-danger', className)}
    {...p}
  />
);
