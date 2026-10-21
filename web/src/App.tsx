import { useEffect } from 'react';
import { bus } from './core/api.js';
import { Shell } from './core/layout/Shell.js';
import { Logo } from './core/layout/Logo.js';
import { useSession } from './core/session.js';
import { Skeleton } from './core/ui/skeleton.js';
import { Toaster, toast } from './core/ui/toast.js';

function Login({ error }: { error?: string }) {
  return (
    <main className="grid min-h-[100dvh] grid-rows-[auto_1fr]">
      <div className="stripes h-3" aria-hidden />
      <div className="mx-auto flex w-full max-w-md flex-col justify-center gap-6 px-6 py-12">
        <div className="flex items-center gap-3">
          <Logo className="h-12 w-12" />
          <span className="font-wide text-3xl font-black tracking-tight">ETNER</span>
        </div>
        <div className="border-l-4 border-action pl-4">
          <h1 className="font-wide text-2xl font-extrabold">Zaloguj się</h1>
          <p className="mt-2 text-ink-2">Otwórz link logowania, który dostałeś od biura. Link działa tylko na Twoim telefonie.</p>
        </div>
        {error && <p role="alert" className="rounded-2xl border border-danger/40 bg-card p-4 text-sm font-semibold text-danger">{error}</p>}
      </div>
    </main>
  );
}

function Loading() {
  return (
    <div className="min-h-[100dvh] desk:pl-64" aria-busy="true" aria-label="Wczytywanie">
      <div className="h-14 border-b border-line bg-card desk:h-16" />
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
  const { status, error } = useSession();
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
      {status === 'loading' ? <Loading /> : status === 'out' ? <Login error={error} /> : <Shell />}
      <Toaster />
    </>
  );
}
