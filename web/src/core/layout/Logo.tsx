import { useId } from 'react';
import { cn } from '../ui/cn.js';

/** Znak ETNER: pierścień (turkus → błękit), dach i linia impulsu (w trybie ciemnym biała). Ten sam co public/icon.svg. */
export function Mark({ className = 'h-9 w-9' }: { className?: string }) {
  const g = useId();
  return (
    <svg viewBox="0 0 100 100" className={cn('shrink-0', className)} aria-hidden>
      <defs><linearGradient id={g} gradientUnits="userSpaceOnUse" x1="6" y1="0" x2="94" y2="0"><stop offset="0" stopColor="#14998a" /><stop offset="1" stopColor="#3ba3dc" /></linearGradient></defs>
      <g fill="none" strokeWidth="6">
        <path d="M44.6 6.3A44 44 0 0 0 44.6 93.7M55.4 6.3A44 44 0 0 1 55.4 93.7" stroke={`url(#${g})`} />
        <path d="M20 52 42 31 63 49H100" stroke="#3ba3dc" strokeLinecap="square" />
        <path d="M14 71H35V60H59V71H84" stroke="var(--logo-pulse)" strokeLinecap="square" />
      </g>
      <circle cx="50" cy="6" r="2.4" fill={`url(#${g})`} /><circle cx="50" cy="94" r="2.4" fill={`url(#${g})`} />
    </svg>
  );
}

/** Znak + napis „ETNER / INTELIGENTNY WYBÓR” (tam, gdzie jest miejsce). */
export function Logo({ className, size = 'md' }: { className?: string; size?: 'md' | 'lg' }) {
  const lg = size === 'lg';
  return (
    <span className={cn('inline-flex items-center gap-3', className)} role="img" aria-label="ETNER, inteligentny wybór">
      <Mark className={lg ? 'h-14 w-14' : 'h-10 w-10'} />
      <span className="grid leading-none" aria-hidden>
        <span className={cn('font-wide font-black tracking-tight', lg ? 'text-4xl' : 'text-2xl')}>
          <span className="text-[#3ba3dc]">ET</span><span className="text-[var(--logo-word)]">NER</span>
        </span>
        <span className={cn('font-light uppercase text-ink-2', lg ? 'mt-1.5 text-[11px] tracking-[0.32em]' : 'mt-1 text-[8.5px] tracking-[0.28em]')}>Inteligentny wybór</span>
      </span>
    </span>
  );
}
