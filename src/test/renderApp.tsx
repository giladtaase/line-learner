import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import '../i18n';
import SettingsProvider from '../settings/SettingsProvider';
import { routes } from '../routes';

/** Renders the whole app (layout, settings, real routes) at `path`. */
export function renderApp(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const view = render(
    <SettingsProvider>
      <RouterProvider router={router} />
    </SettingsProvider>
  );
  return { ...view, router };
}
