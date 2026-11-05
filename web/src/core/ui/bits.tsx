import { CaretDown, type Icon } from '@phosphor-icons/react';
import type { HTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';
import { cn } from './cn.js';

/** Nagłówek sekcji (17–18 px, 700) z liczbą pozycji. `toggle` = sekcja zwijana (przycisk w nagłówku). */
export function SectionTitle({ children, count, className, toggle }: { children: ReactNode; count?: number; className?: string; toggle?: { open: boolean; onToggle: () => void } }) {
  const label = <span className="flex items-baseline gap-2">{children}{count !== undefined && <span className="text-sm font-semibold text-ink-2 desk:text-base">{count}</span>}</span>;
  return (
    <h2 className={cn('flex min-h-11 items-center text-lg font-bold desk:text-xl', className)}>
      {toggle ? (
        <button type="button" onClick={toggle.onToggle} aria-expanded={toggle.open} className="flex min-h-11 flex-1 items-center justify-between gap-3 text-left">
          {label}<CaretDown className={cn('h-5 w-5 text-ink-2 transition-transform duration-200', toggle.open && 'rotate-180')} aria-hidden />
        </button>
      ) : label}
    </h2>
  );
}

/** Pusty stan: ikona, zdanie, podpowiedź co zrobić (zwarty, bez ramki). */
export const Empty = ({ icon: I, title, hint, children }: { icon: Icon; title: string; hint?: string; children?: ReactNode }) => (
  <div className="grid place-items-center gap-1.5 px-6 py-8 text-center">
    <I className="h-8 w-8 text-ink-2" />
    <p className="font-semibold">{title}</p>
    {hint && <p className="max-w-[44ch] text-sm text-ink-2">{hint}</p>}
    {children}
  </div>
);

export const Badge = ({ children, tone = 'line', className }: { children: ReactNode; tone?: 'line' | 'ok' | 'action' | 'warn' | 'danger' | 'ink' | 'new'; className?: string }) => (
  <span className={cn('inline-flex h-6 shrink-0 items-center gap-1 rounded-[3px] px-2 text-xs font-semibold whitespace-nowrap', {
    line: 'border border-line text-ink-2',
    ok: 'bg-ok text-ok-ink',
    action: 'bg-action/12 text-action',
    warn: 'border border-danger/50 text-danger',
    danger: 'bg-danger text-danger-ink',
    ink: 'bg-ink text-bg',
    new: 'bg-new font-bold text-white',
  }[tone], className)}>{children}</span>
);

/** Czerwony znacznik „nowe” przy wpisie lub polu zmienionym przez inną osobę od ostatniej wizyty; `sr`: co jest nowe (dla czytnika). */
export const NewMark = ({ sr }: { sr: string }) => (
  <Badge tone="new" className="h-5 px-1.5"><span aria-hidden>nowe</span><span className="sr-only">{sr}</span></Badge>
);

/** Przełącznik segmentowy (radio): ramka 1 px, wybrany segment granatowy. */
export function Segmented<T extends string>({ value, onChange, options, label, className }: {
  value: T; onChange: (v: T) => void; options: { v: T; label: string }[]; label: string; className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('grid auto-cols-fr grid-flow-col divide-x divide-line overflow-hidden rounded-[4px] border border-line bg-card', className)}>
      {options.map((o, i) => (
        <button key={o.v} type="button" role="radio" aria-checked={value === o.v} onClick={() => onChange(o.v)}
          // radio: jeden przystanek Tab, strzałki przełączają (wzorzec ARIA radiogroup)
          tabIndex={value === o.v || (!options.some((x) => x.v === value) && i === 0) ? 0 : -1}
          onKeyDown={(e) => {
            const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
            if (!d) return;
            e.preventDefault();
            const n = options[(i + d + options.length) % options.length]!;
            onChange(n.v);
            (e.currentTarget.parentElement?.children[options.indexOf(n)] as HTMLElement | undefined)?.focus();
          }}
          className={cn('h-11 truncate px-3 text-sm font-semibold transition-colors duration-150 focus-visible:outline-offset-[-2px]', value === o.v ? 'bg-ink text-bg' : 'text-ink-2 hover:bg-ink/6 hover:text-ink')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const Textarea = ({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea
    className={cn('min-h-24 w-full rounded-[4px] border border-field bg-card px-3 py-2.5 text-base text-ink placeholder:text-ink-3 hover:border-ink-2 focus:border-action focus:outline-none focus:ring-2 focus:ring-action/25 aria-invalid:border-danger', className)}
    {...p}
  />
);

/** Panel: biała powierzchnia z ramką 1 px (bez cienia); wiersze w środku dzielić `divide-y divide-rule`. */
export const Panel = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('rounded-[4px] border border-line bg-card', className)} {...p} />
);
