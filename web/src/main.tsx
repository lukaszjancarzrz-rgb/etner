import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App.js';
import { startSession } from './core/session.js';
import { applyTheme } from './core/theme.js';
import { preloadScreen } from './routes.js';
import './theme.css';

applyTheme();
preloadScreen(location.hash);
void startSession();
createRoot(document.getElementById('root')!).render(<App />);

// Nowa wersja: sprawdzana po powrocie z tła; autoUpdate przeładowuje (kolejka zapisów jest w IndexedDB).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  // Klik w powiadomienie przy otwartej aplikacji (push-sw.js): przejście pod adres bez przeładowania.
  navigator.serviceWorker.addEventListener('message', (e: MessageEvent<{ type?: string; hash?: string }>) => {
    if (e.data?.type === 'etner-nav' && e.data.hash?.startsWith('#')) location.hash = e.data.hash;
  });
  registerSW({
    immediate: true,
    onRegisteredSW(_url, reg) {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void reg?.update();
      });
    },
  });
}
