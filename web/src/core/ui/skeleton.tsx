import { cn } from './cn.js';

export const Skeleton = ({ className }: { className?: string }) => (
  <div aria-hidden className={cn('animate-pulse rounded-xl bg-line/60', className)} />
);
