import { lazy, Suspense, useSyncExternalStore } from 'react';
import type { Rec } from '../../core/store.js';

// Jedno okienko przychodu na całą aplikację: otwierane też z miejsc, które same już nie istnieją (formularz zlecenia, toast „Popraw”).
// Bez zależności finansowych – formularz ładuje się dopiero przy pierwszym otwarciu (start bundle).
const RevenueForm = lazy(() => import('./RevenueForm.js').then((m) => ({ default: m.RevenueForm })));
type Open = { revenue?: Rec; prefill?: Partial<Rec>; fromJob?: boolean } | null;
let open: Open = null;
const subs = new Set<() => void>();
export const openRevenue = (o: Open) => { open = o; for (const f of subs) f(); };
export function RevenueHost() {
  const o = useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => open);
  return o ? <Suspense fallback={null}><RevenueForm key={o.revenue?.id ?? 'nowy'} {...o} onClose={() => openRevenue(null)} /></Suspense> : null;
}
