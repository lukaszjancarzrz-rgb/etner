import { cn } from './cn.js';

export const Skeleton = ({ className }: { className?: string }) => (
  <div aria-hidden className={cn('animate-pulse rounded-[4px] bg-line/50', className)} />
);
