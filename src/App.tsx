import { useEffect } from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { applyDocumentDirection } from './i18n';
import { getSettings } from './lib/db';
import ScriptsListPage from './components/ScriptsListPage';
import ScriptEditorPage from './components/ScriptEditorPage';
import PlayerPage from './components/PlayerPage';
import SettingsPage from './components/SettingsPage';

function App() {
  const { t, i18n } = useTranslation();

  useEffect(() => {
    applyDocumentDirection(i18n.language);
  }, [i18n.language]);

  useEffect(() => {
    // Apply the user's saved UI language preference on first load.
    getSettings().then((settings) => {
      if (settings.uiLanguage !== i18n.language) {
        i18n.changeLanguage(settings.uiLanguage);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-brand-900 text-white px-4 py-3 flex items-center justify-between shadow">
        <h1 className="text-lg font-semibold">{t('app.title')}</h1>
        <nav className="flex gap-4 text-sm">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              isActive ? 'font-semibold underline' : 'opacity-80 hover:opacity-100'
            }
          >
            {t('nav.scripts')}
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              isActive ? 'font-semibold underline' : 'opacity-80 hover:opacity-100'
            }
          >
            {t('nav.settings')}
          </NavLink>
        </nav>
      </header>
      <main className="flex-1 max-w-3xl w-full mx-auto p-4">
        <Routes>
          <Route path="/" element={<ScriptsListPage />} />
          <Route path="/scripts/:id/edit" element={<ScriptEditorPage />} />
          <Route path="/scripts/:id/play" element={<PlayerPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
