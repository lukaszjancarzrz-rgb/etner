import { useEffect } from 'react';
import { RevenueHost } from './features/finanse/RevenueForm.js';
import { bus } from './core/api.js';
import { Shell } from './core/layout/Shell.js';
import { Login } from './screens/Login.js';
import { useSession } from './core/session.js';
import { Skeleton } from './core/ui/skeleton.js';
import { Toaster, toast } from './core/ui/toast.js';

function Loading() {
  return (
    <div className="min-h-[100dvh] desk:pl-[224px]" aria-busy="true" aria-label="Wczytywanie">
      <div className="h-14 bg-rail desk:h-16 desk:border-b desk:border-line desk:bg-bg" />
      <div className="mx-auto grid max-w-2xl gap-3 p-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    </div>
  );
}

export function App() {
  const { status, askLogin } = useSession();
  useEffect(() => {
    // odrzucony zapis, którego formularz już nie istnieje (np. po restarcie)
    const f = (e: Event) => {
      const d = (e as CustomEvent<{ kind: string; message: string }>).detail;
      toast('Zapis nie został przyjęty', { body: d.message, tone: 'error' });
    };
    bus.addEventListener('outbox-failed', f);
    return () => bus.removeEventListener('outbox-failed', f);
  }, []);
  return (
    <>
      {status === 'loading' ? <Loading /> : status === 'out' || (status === 'expired' && askLogin) ? <Login /> : <Shell />}
      <Toaster />
      <RevenueHost />
    </>
  );
}
