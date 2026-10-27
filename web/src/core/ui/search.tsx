import { MagnifyingGlass, X } from '@phosphor-icons/react';
import { Input } from './input.js';

/** Pole wyszukiwania z ikoną i czyszczeniem (Narzędzia, Magazyn). */
export function Search({ value, onChange, label, placeholder }: { value: string; onChange: (v: string) => void; label: string; placeholder: string }) {
  return (
    <div className="relative">
      <MagnifyingGlass className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-ink-2" aria-hidden />
      <Input type="search" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pr-12 pl-11 [&::-webkit-search-cancel-button]:hidden" />
      {value && <button type="button" onClick={() => onChange('')} aria-label="Wyczyść wyszukiwanie" className="absolute top-1/2 right-1 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full text-ink-2 hover:bg-ink/5"><X className="h-5 w-5" /></button>}
    </div>
  );
}
