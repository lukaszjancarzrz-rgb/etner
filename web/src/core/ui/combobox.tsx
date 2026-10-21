import * as P from '@radix-ui/react-popover';
import { CaretUpDown, Check } from '@phosphor-icons/react';
import { Command } from 'cmdk';
import { useState } from 'react';
import { cn } from './cn.js';
import type { Option } from './select.js';

/** Wybór z wyszukiwaniem (klienci, zlecenia). */
export function Combobox({ value, onValueChange, options, placeholder = 'Wybierz', search = 'Szukaj', empty = 'Nic nie znaleziono.', id }: {
  value?: string; onValueChange: (v: string) => void; options: Option[]; placeholder?: string; search?: string; empty?: string; id?: string;
}) {
  const [open, setOpen] = useState(false);
  const cur = options.find((o) => o.value === value);
  return (
    <P.Root open={open} onOpenChange={setOpen}>
      <P.Trigger id={id} className={cn('flex h-12 w-full items-center justify-between gap-2 rounded-xl border border-line bg-card px-4 text-left text-base', !cur && 'text-ink-2')}>
        <span className="truncate">{cur?.label ?? placeholder}</span>
        <CaretUpDown className="h-4 w-4 shrink-0 text-ink-2" />
      </P.Trigger>
      <P.Portal>
        <P.Content sideOffset={6} align="start" className="z-50 w-[var(--radix-popover-trigger-width)] min-w-64 rounded-xl border border-line bg-card shadow-card">
          <Command>
            <Command.Input placeholder={search} className="h-12 w-full border-b border-line bg-transparent px-4 text-base outline-none placeholder:text-ink-2" />
            <Command.List className="max-h-72 overflow-y-auto p-1">
              <Command.Empty className="px-3 py-4 text-sm text-ink-2">{empty}</Command.Empty>
              {options.map((o) => (
                <Command.Item key={o.value} value={`${o.label} ${o.value}`} onSelect={() => { onValueChange(o.value); setOpen(false); }}
                  className="flex h-11 cursor-pointer items-center justify-between gap-3 rounded-lg px-3 data-[selected=true]:bg-action/10">
                  <span className="truncate">{o.label}</span>
                  {o.value === value && <Check className="h-4 w-4 text-action" />}
                </Command.Item>
              ))}
            </Command.List>
          </Command>
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}
