import Dexie, { type Table } from 'dexie';
import type { Script, AppSettings, LineAttempt } from '../types';

export class LineLearnerDB extends Dexie {
  scripts!: Table<Script, string>;
  settings!: Table<AppSettings, string>;
  attempts!: Table<LineAttempt, string>;

  constructor() {
    super('line-learner');
    this.version(1).stores({
      scripts: 'id, title, language, updatedAt',
      settings: 'id',
      attempts: 'id, scriptId, entryId, timestamp'
    });
  }
}

export const db = new LineLearnerDB();

export const DEFAULT_SETTINGS: AppSettings = {
  id: 'settings',
  uiLanguage: 'en',
  defaultOtherLinesMode: 'speak',
  defaultMyLineInputMode: 'speak',
  transcriptionProvider: 'whisper',
  ttsRate: 1,
  leniencyThreshold: 0.72
};

export async function getSettings(): Promise<AppSettings> {
  const existing = await db.settings.get('settings');
  if (existing) return existing;
  await db.settings.put(DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await db.settings.put(settings);
}
