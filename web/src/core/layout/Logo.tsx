import { useId } from 'react';
import { cn } from '../ui/cn.js';

/** Znak ETNER: pierścień (turkus → błękit), dach i linia impulsu w kolorze tekstu (currentColor). Ten sam co public/icon.svg. */
export function Mark({ className = 'h-9 w-9' }: { className?: string }) {
  const g = useId();
  return (
    <svg viewBox="0 0 100 100" className={cn('shrink-0', className)} aria-hidden>
      <defs><linearGradient id={g} gradientUnits="userSpaceOnUse" x1="6" y1="0" x2="94" y2="0"><stop offset="0" stopColor="#14998a" /><stop offset="1" stopColor="#3ba3dc" /></linearGradient></defs>
      <g fill="none" strokeWidth="3">
        <path d="M44.6 6.3A44 44 0 0 0 44.6 93.7M55.4 6.3A44 44 0 0 1 55.4 93.7" stroke={`url(#${g})`} strokeWidth="2" />
        <path d="M27 44 49.3 22 69.8 42.5H90" stroke="#3ba3dc" />
        <path d="M14 68.7H40.7V46.3H57.5V68.7H70" stroke="currentColor" />
      </g>
      <circle cx="50" cy="6" r="2.4" fill="#3ba3dc" /><circle cx="50" cy="94" r="2.4" fill="#14998a" />
    </svg>
  );
}

/** Logo firmy na białym bloku w obu motywach: znak i napis „ETNER” to wycinki public/logo.png (znak 250×255, napis 197×51),
 * hasło „INTELIGENTNY WYBÓR” jako żywy tekst (ostre w każdej skali, kontrast 9,6:1 na bieli). Wielkość całości ustawia `font-size` (klasa w `className`).
 * `rail`: szyna 224 px – hasło w osobnym wierszu na całą szerokość, żeby wersaliki miały ≥10 px. */
export function Logo({ className, rail }: { className?: string; rail?: boolean }) {
  const haslo = <span className="block font-semibold tracking-[0.18em] whitespace-nowrap text-[#33475e]">INTELIGENTNY WYBÓR</span>;
  return (
    <span className={cn('grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-[0.7em] bg-white leading-none', className)} role="img" aria-label="ETNER, inteligentny wybór" data-logo>
      <img src="/logo-mark.png" alt="" width={250} height={255} className={cn('block w-auto', rail ? 'h-[3.1em]' : 'h-[5.6em]')} />
      {rail ? <img src="/logo-name.png" alt="" width={197} height={51} className="block h-[2.1em] w-auto" />
        : <span className="grid gap-[0.55em]"><img src="/logo-name.png" alt="" width={197} height={51} className="block h-auto w-[8.4em]" />{haslo}</span>}
      {rail && <span className="col-span-2 mt-[0.5em]">{haslo}</span>}
    </span>
  );
}
