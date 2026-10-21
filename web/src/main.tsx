import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App.js';
import { startSession } from './core/session.js';
import { applyTheme } from './core/theme.js';
import './theme.css';

applyTheme();
void startSession();
createRoot(document.getElementById('root')!).render(<App />);

// Nowa wersja: sprawdzana po powrocie z tła; autoUpdate przeładowuje (kolejka zapisów jest w IndexedDB).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  registerSW({
    immediate: true,
    onRegisteredSW(_url, reg) {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void reg?.update();
      });
    },
  });
}
