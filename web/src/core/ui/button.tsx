import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from './cn.js';

const variants = {
  primary: 'bg-action text-action-ink hover:brightness-110',
  secondary: 'bg-card text-ink border border-line hover:border-ink-2',
  ghost: 'text-ink hover:bg-ink/6',
  ok: 'bg-ok text-ok-ink hover:brightness-110',
  danger: 'bg-danger text-danger-ink hover:brightness-110',
};
const sizes = { md: 'h-12 px-4 text-base', sm: 'h-10 px-3 text-sm', icon: 'h-12 w-12', iconTight: 'h-11 w-9 min-[560px]:w-11' };

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants; size?: keyof typeof sizes };

/** Przycisk prostokątny (promień 4 px); min. 40–48 px wysokości (dotyk). */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant = 'primary', size = 'md', type = 'button', ...p }, ref) => (
  <button
    ref={ref}
    type={type}
    className={cn(
      'inline-flex shrink-0 items-center justify-center gap-2 rounded-[4px] font-bold whitespace-nowrap select-none',
      'transition-[filter,background-color,border-color] duration-150 active:brightness-95 disabled:pointer-events-none disabled:opacity-50',
      variants[variant], sizes[size], className,
    )}
    {...p}
  />
));
Button.displayName = 'Button';
