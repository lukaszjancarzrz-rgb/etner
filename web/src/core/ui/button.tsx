import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from './cn.js';

const variants = {
  primary: 'bg-action text-action-ink hover:brightness-110',
  secondary: 'bg-card text-ink border border-line hover:border-ink-2',
  ghost: 'text-ink hover:bg-ink/5',
  ok: 'bg-ok text-ok-ink hover:brightness-110',
  danger: 'bg-danger text-danger-ink hover:brightness-110',
};
const sizes = { md: 'h-12 px-5 text-base', sm: 'h-10 px-4 text-sm', icon: 'h-12 w-12', iconTight: 'h-11 w-9 min-[560px]:w-11' };

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants; size?: keyof typeof sizes };

/** Przycisk-pigułka; min. 40–48 px wysokości (dotyk). */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant = 'primary', size = 'md', type = 'button', ...p }, ref) => (
  <button
    ref={ref}
    type={type}
    className={cn(
      'inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap select-none',
      'transition-[filter,transform,border-color] duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
      variants[variant], sizes[size], className,
    )}
    {...p}
  />
));
Button.displayName = 'Button';
