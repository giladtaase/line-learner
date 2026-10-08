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
  leniencyThreshold: 0.55
};

// The original default leniency threshold shipped with the app (before it
// was lowered to be more forgiving). Used only to detect users who still
// have the old, stricter default saved and auto-migrate them to the new,
// more lenient default below, without touching anyone who has deliberately
// moved the slider to some other value.
const LEGACY_DEFAULT_LENIENCY = 0.72;

export async function getSettings(): Promise<AppSettings> {
  const existing = await db.settings.get('settings');
  if (!existing) {
    await db.settings.put(DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  }
  if (existing.leniencyThreshold === LEGACY_DEFAULT_LENIENCY) {
    const migrated = { ...existing, leniencyThreshold: DEFAULT_SETTINGS.leniencyThreshold };
    await db.settings.put(migrated);
    return migrated;
  }
  return existing;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await db.settings.put(settings);
}

export async function recordAttempt(attempt: LineAttempt): Promise<void> {
  await db.attempts.put(attempt);
}
