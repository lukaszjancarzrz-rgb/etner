import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn.js';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input
    ref={ref}
    className={cn(
      'h-12 w-full rounded-xl border border-line bg-card px-4 text-base text-ink placeholder:text-ink-2',
      'focus:border-action focus:outline-none focus:ring-2 focus:ring-action/30 aria-invalid:border-danger',
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
    <div className="grid gap-2">
      <label htmlFor={id} className="text-sm font-semibold">{label}</label>
      {children(id, desc)}
      {(error || hint) && <p id={desc} className={cn('text-sm', error ? 'text-danger' : 'text-ink-2')}>{error || hint}</p>}
    </div>
  );
}
