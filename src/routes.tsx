import type { RouteObject } from 'react-router-dom';
import App from './App';
import ScriptsListPage from './components/ScriptsListPage';
import ScriptEditorPage from './components/ScriptEditorPage';
import PlayerPage from './components/PlayerPage';
import SettingsPage from './components/SettingsPage';

/** The app's routes, shared by the browser router and by tests (memory router). */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <ScriptsListPage /> },
      { path: 'scripts/:id/edit', element: <ScriptEditorPage /> },
      { path: 'scripts/:id/play', element: <PlayerPage /> },
      { path: 'settings', element: <SettingsPage /> }
    ]
  }
];
