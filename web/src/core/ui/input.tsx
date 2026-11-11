import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn.js';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input
    ref={ref}
    className={cn(
      'h-12 w-full rounded-[4px] border border-field bg-card px-3 text-base text-ink placeholder:text-ink-3',
      'hover:border-ink-2 focus:border-action focus:outline-none focus:ring-2 focus:ring-action/25 aria-invalid:border-danger',
      className,
    )}
    {...p}
  />
));
Input.displayName = 'Input';

/** Etykieta nad polem, podpowiedź i błąd pod polem. */
export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: (id: string, describedBy?: string) => ReactNode }) {
  const id = useId();
  const desc = error || hint ? `${id}-d` : undefined;
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">{label}</label>
      {children(id, desc)}
      {(error || hint) && <p id={desc} className={cn('text-sm', error ? 'text-danger' : 'text-ink-2')}>{error || hint}</p>}
    </div>
  );
}
