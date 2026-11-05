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

/** Logo firmy (public/logo.png) na białym bloku w obu motywach (PNG ma ciemny napis). `imgClass`: szerokość obrazka.
 * `rail`: ten sam PNG w dwóch wycinkach (znak + napis), żeby w szynie 224 px hasło miało ≥10 px wysokości wersalików (cały obrazek dałby ~8 px). */
export function Logo({ className, imgClass = 'w-52', rail }: { className?: string; imgClass?: string; rail?: boolean }) {
  return (
    <span className={cn('bg-white', rail ? 'flex items-center gap-[10px]' : 'block', className)} role="img" aria-label="ETNER, inteligentny wybór" data-logo>
      {rail ? (
        <>
          {/* PNG 601×255: znak x 0–249, napis x 274–601 / y 90–181 */}
          <span aria-hidden className="block h-[58px] w-[57px] shrink-0 bg-[url(/logo.png)] bg-[length:auto_58px] bg-no-repeat" />
          <span aria-hidden className="block h-[40px] w-[144px] bg-[url(/logo.png)] bg-[length:264px_auto] bg-[position:-121px_-40px] bg-no-repeat" />
        </>
      ) : <img src="/logo.png" alt="" width={601} height={255} className={cn('block h-auto', imgClass)} />}
    </span>
  );
}
