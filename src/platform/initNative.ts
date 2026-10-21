import { App } from '@capacitor/app';
import type { createBrowserRouter } from 'react-router-dom';

type AppRouter = ReturnType<typeof createBrowserRouter>;

/**
 * Android app wiring that has no web equivalent. Loaded only in the app
 * (see main.tsx).
 */
export function initNative(router: AppRouter): void {
  void App.addListener('backButton', ({ canGoBack }) => {
    // An open dialog closes first, as with Escape (see Modal in ui.tsx).
    if (document.querySelector('[role="dialog"]')) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return;
    }
    if (router.state.location.pathname === '/') {
      void App.exitApp();
    } else if (canGoBack) {
      // Through the router, so the editor's unsaved-changes prompt still runs.
      void router.navigate(-1);
    } else {
      void router.navigate('/', { replace: true });
    }
  });
}
