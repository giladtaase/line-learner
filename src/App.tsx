import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

function navClass({ isActive }: { isActive: boolean }) {
  return isActive ? 'font-semibold underline' : 'opacity-80 hover:opacity-100';
}

/** Layout shared by every page: header with navigation, then the current route. */
function App() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-brand-900 text-white px-4 py-3 flex items-center justify-between shadow">
        <h1 className="text-lg font-semibold">{t('app.title')}</h1>
        <nav className="flex gap-4 text-sm">
          <NavLink to="/" end className={navClass}>
            {t('nav.scripts')}
          </NavLink>
          <NavLink to="/settings" className={navClass}>
            {t('nav.settings')}
          </NavLink>
        </nav>
      </header>
      <main className="flex-1 max-w-3xl w-full mx-auto p-4">
        <Outlet />
      </main>
    </div>
  );
}

export default App;
