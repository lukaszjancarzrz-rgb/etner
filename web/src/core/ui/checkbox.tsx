import * as C from '@radix-ui/react-checkbox';
import { Check } from '@phosphor-icons/react';
import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import { cn } from './cn.js';

export const Checkbox = forwardRef<HTMLButtonElement, ComponentPropsWithoutRef<typeof C.Root>>(({ className, ...p }, ref) => (
  <C.Root
    ref={ref}
    className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-lg border-2 border-line bg-card data-[state=checked]:border-ok data-[state=checked]:bg-ok', className)}
    {...p}
  >
    <C.Indicator><Check weight="bold" className="h-[60%] w-[60%] text-bg" /></C.Indicator>
  </C.Root>
));
Checkbox.displayName = 'Checkbox';
