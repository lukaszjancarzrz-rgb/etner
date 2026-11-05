import { useState } from 'react';
import { useNames } from '../data.js';
import { useEntity } from '../store.js';
import { cn } from './cn.js';

/** „Bartek Gawlik” → „BG”, „Szef” → „S”. */
export function initials(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '?';
  return (w[0]![0]! + (w.length > 1 ? w[w.length - 1]![0]! : '')).toLocaleUpperCase('pl');
}

// ciemne odcienie: biały tekst ma kontrast ≥4.5:1 w obu motywach
const COLORS = ['#0070ab', '#00736b', '#8a5a00', '#7a3e9d', '#b3261e', '#3f5368', '#2e7d32', '#ad1457'];
/** Stały kolor kółka dla danego id (ten sam na każdym urządzeniu). */
export function avatarColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length]!;
}

const SIZES = { xs: 'h-5 w-5 text-[9px]', sm: 'h-7 w-7 text-[11px]', md: 'h-9 w-9 text-sm', lg: 'h-12 w-12 text-base', xl: 'h-20 w-20 text-2xl' };

/** Zdjęcie użytkownika albo inicjały w kolorowym kółku. Bez `userId` (np. autor spoza ETNER) tylko inicjały z `name`. Ozdobnik: imię jest obok w tekście. */
export function Avatar({ userId, name, size = 'md', className }: { userId?: string | null; name?: string; size?: keyof typeof SIZES; className?: string }) {
  const u = useEntity('users', userId ?? undefined);
  const names = useNames();
  const [broken, setBroken] = useState<string>();
  const label = name ?? (userId ? names(userId) : '?');
  const key = u?.avatarKey as string | null | undefined;
  const src = userId && key && broken !== key ? `/api/users/${userId}/avatar?k=${encodeURIComponent(key)}` : undefined;
  return (
    <span aria-hidden className={cn('inline-grid shrink-0 place-items-center overflow-hidden rounded-full font-bold leading-none text-white select-none', SIZES[size], className)}
      style={{ background: avatarColor(userId ?? label) }}>
      {src ? <img src={src} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" onError={() => setBroken(key!)} /> : initials(label)}
    </span>
  );
}
