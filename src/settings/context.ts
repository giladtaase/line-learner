import { createContext, useContext } from 'react';
import type { AppSettings } from '../types';

export interface SettingsContextValue {
  settings: AppSettings;
  /** Applies a partial change, persists it, and switches the UI language if it changed. */
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
}

export const SettingsContext = createContext<SettingsContextValue | null>(null);

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (!value) throw new Error('useSettings must be used inside <SettingsProvider>');
  return value;
}
