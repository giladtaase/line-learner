import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { getSettings, saveSettings } from '../lib/db';
import { applyDocumentDirection } from '../i18n';
import type { AppSettings } from '../types';
import { SettingsContext } from './context';

/**
 * Loads settings once (running first-run defaults and migrations) and shares
 * them with every page. Children render only after settings are loaded, so
 * consumers never handle a missing value.
 */
export default function SettingsProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  // Latest value for updates fired in quick succession (e.g. dragging a
  // slider), so each one builds on the previous rather than a stale render.
  const latest = useRef<AppSettings | null>(null);

  useEffect(() => {
    let active = true;
    getSettings().then((loaded) => {
      if (!active) return;
      latest.current = loaded;
      setSettings(loaded);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!settings) return;
    if (i18n.language !== settings.uiLanguage) i18n.changeLanguage(settings.uiLanguage);
    applyDocumentDirection(settings.uiLanguage);
  }, [settings, i18n]);

  const updateSettings = useCallback(async (patch: Partial<AppSettings>) => {
    if (!latest.current) return;
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setSettings(next);
    await saveSettings(next);
  }, []);

  const value = useMemo(
    () => (settings ? { settings, updateSettings } : null),
    [settings, updateSettings]
  );

  if (!value) return null;
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}
