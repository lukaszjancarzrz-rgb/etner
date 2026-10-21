import { screens } from '../../routes.js';
import { useRoute } from '../../routes.js';
import { BottomNav } from './BottomNav.js';
import { SideNav } from './SideNav.js';
import { TopBar } from './TopBar.js';

export function Shell() {
  const route = useRoute();
  const s = screens[route.screen]!;
  const Screen = s.component;
  return (
    <div className="min-h-[100dvh] desk:pl-64">
      <SideNav route={route} />
      <TopBar title={s.title} />
      <main className="pb-[calc(5rem+env(safe-area-inset-bottom))] desk:pb-8">
        <Screen route={route} />
      </main>
      <BottomNav route={route} />
    </div>
  );
}
