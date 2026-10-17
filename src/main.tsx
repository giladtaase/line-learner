import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import './i18n';
import './index.css';
import SettingsProvider from './settings/SettingsProvider';
import { routes } from './routes';

// A data router (rather than <BrowserRouter>) so pages can block navigation,
// e.g. the editor warning about unsaved changes.
const router = createBrowserRouter(routes, { basename: import.meta.env.BASE_URL });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SettingsProvider>
      <RouterProvider router={router} />
    </SettingsProvider>
  </StrictMode>
);
