import * as S from '@radix-ui/react-select';
import { CaretDown, Check } from '@phosphor-icons/react';
import { cn } from './cn.js';

export type Option = { value: string; label: string };

export function Select({ value, onValueChange, options, placeholder, id, className, 'aria-label': label }: {
  'aria-label'?: string; value?: string; onValueChange: (v: string) => void; options: Option[]; placeholder?: string; id?: string; className?: string;
}) {
  return (
    <S.Root value={value} onValueChange={onValueChange}>
      <S.Trigger id={id} aria-label={label} className={cn('flex h-12 w-full items-center justify-between gap-2 rounded-xl border border-line bg-card px-4 text-left text-base data-[placeholder]:text-ink-2', className)}>
        <S.Value placeholder={placeholder} />
        <S.Icon><CaretDown className="h-4 w-4 text-ink-2" /></S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Content position="popper" sideOffset={6} className="z-50 max-h-[60dvh] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-line bg-card shadow-card">
          <S.Viewport className="p-1">
            {options.map((o) => (
              <S.Item key={o.value} value={o.value} className="flex h-11 cursor-pointer items-center justify-between gap-3 rounded-lg px-3 outline-none data-[highlighted]:bg-action/10">
                <S.ItemText>{o.label}</S.ItemText>
                <S.ItemIndicator><Check className="h-4 w-4 text-action" /></S.ItemIndicator>
              </S.Item>
            ))}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  );
}
