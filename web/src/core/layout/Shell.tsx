import { LockKey } from '@phosphor-icons/react';
import { Suspense } from 'react';
import { useSession } from '../session.js';
import { Empty } from '../ui/bits.js';
import { screens } from '../../routes.js';
import { Skeleton } from '../ui/skeleton.js';
import { useRoute } from '../../routes.js';
import { BottomNav } from './BottomNav.js';
import { SideNav } from './SideNav.js';
import { TopBar } from './TopBar.js';
import { useBadges } from './useBadges.js';

export function Shell() {
  const route = useRoute();
  const s = screens[route.screen]!;
  const Screen = s.component;
  const badges = useBadges();
  const { me } = useSession();
  const denied = s.admin && me?.role !== 'admin'; // serwer i tak nie wyśle danych; tu tylko czytelny ekran
  return (
    <div className="min-h-[100dvh] desk:pl-64">
      <SideNav route={route} badges={badges} />
      <TopBar title={denied ? 'Brak dostępu' : s.title} />
      <main className="pb-[calc(5rem+env(safe-area-inset-bottom))] desk:pb-8">
        <Suspense fallback={<div className="mx-auto grid max-w-2xl gap-3 p-4" aria-busy="true"><Skeleton className="h-24" /><Skeleton className="h-48" /></div>}>
          {denied ? (
            <div className="mx-auto max-w-xl px-4 py-10"><Empty icon={LockKey} title="Brak dostępu" hint="Ten ekran jest tylko dla administratora."><a href="#harm" className="font-semibold text-action">Harmonogram</a></Empty></div>
          ) : <Screen route={route} />}
        </Suspense>
      </main>
      <BottomNav route={route} badges={badges} />
    </div>
  );
}
