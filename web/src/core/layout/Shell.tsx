import { Suspense } from 'react';
import { screens } from '../../routes.js';
import { Skeleton } from '../ui/skeleton.js';
import { useRoute } from '../../routes.js';
import { BottomNav } from './BottomNav.js';
import { SideNav } from './SideNav.js';
import { TopBar } from './TopBar.js';
import { useBadges, useMarkScreen } from './useBadges.js';

export function Shell() {
  const route = useRoute();
  const s = screens[route.screen]!;
  const Screen = s.component;
  useMarkScreen(route.screen);
  const badges = useBadges();
  return (
    <div className="min-h-[100dvh] desk:pl-64">
      <SideNav route={route} badges={badges} />
      <TopBar title={s.title} />
      <main className="pb-[calc(5rem+env(safe-area-inset-bottom))] desk:pb-8">
        <Suspense fallback={<div className="mx-auto grid max-w-2xl gap-3 p-4" aria-busy="true"><Skeleton className="h-24" /><Skeleton className="h-48" /></div>}>
          <Screen route={route} />
        </Suspense>
      </main>
      <BottomNav route={route} badges={badges} />
    </div>
  );
}
