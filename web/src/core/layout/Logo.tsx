import { useId } from 'react';
import { cn } from '../ui/cn.js';

/** Znak ETNER: pierścień (turkus → błękit), dach i linia impulsu (w trybie ciemnym biała). Ten sam co public/icon.svg. */
export function Mark({ className = 'h-9 w-9' }: { className?: string }) {
  const g = useId();
  return (
    <svg viewBox="0 0 100 100" className={cn('shrink-0', className)} aria-hidden>
      <defs><linearGradient id={g} gradientUnits="userSpaceOnUse" x1="6" y1="0" x2="94" y2="0"><stop offset="0" stopColor="#14998a" /><stop offset="1" stopColor="#3ba3dc" /></linearGradient></defs>
      <g fill="none" strokeWidth="3">
        <path d="M44.6 6.3A44 44 0 0 0 44.6 93.7M55.4 6.3A44 44 0 0 1 55.4 93.7" stroke={`url(#${g})`} strokeWidth="2" />
        <path d="M27 44 49.3 22 69.8 42.5H90" stroke="#3ba3dc" />
        <path d="M14 68.7H40.7V46.3H57.5V68.7H70" stroke="var(--logo-pulse)" />
      </g>
      <circle cx="50" cy="6" r="2.4" fill="#3ba3dc" /><circle cx="50" cy="94" r="2.4" fill="#14998a" />
    </svg>
  );
}

/** Logo firmy (public/logo.png); w ciemnym motywie znak + napis w kolorach motywu (PNG ma ciemny napis). */
export function Logo({ className, size = 'md' }: { className?: string; size?: 'md' | 'lg' }) {
  const lg = size === 'lg';
  return (
    <span className={className} role="img" aria-label="ETNER, inteligentny wybór" data-logo>
      <img src="/logo.png" alt="" className={lg ? 'h-24 w-auto' : 'h-16 w-auto'} style={{ display: 'var(--logo-img)' }} />
      <span className="items-center gap-3" style={{ display: 'var(--logo-svg)' }}>
      <Mark className={lg ? 'h-14 w-14' : 'h-10 w-10'} />
      <span className="grid leading-none" aria-hidden>
        <span className={cn('font-wide font-black tracking-tight', lg ? 'text-4xl' : 'text-2xl')}>
          <span className="text-[#3ba3dc]">ET</span><span className="text-[var(--logo-word)]">NER</span>
        </span>
        <span className={cn('font-light uppercase text-ink-2', lg ? 'mt-1.5 text-[11px] tracking-[0.32em]' : 'mt-1 text-[8.5px] tracking-[0.28em]')}>Inteligentny wybór</span>
      </span>
      </span>
    </span>
  );
}
