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
  transcriptionProvider: 'webspeech',
  ttsRate: 1,
  leniencyThreshold: 0.55
};

// The original default leniency threshold shipped with the app (before it
// was lowered to be more forgiving). Used only to detect users who still
// have the old, stricter default saved and auto-migrate them to the new,
// more lenient default below, without touching anyone who has deliberately
// moved the slider to some other value.
const LEGACY_DEFAULT_LENIENCY = 0.72;

// The original default transcription provider shipped with the app (before
// it was switched to the free browser engine as the default). Used the same
// way as above: only auto-migrates users still on the old default, leaving
// anyone who deliberately chose Whisper untouched.
const LEGACY_DEFAULT_PROVIDER: AppSettings['transcriptionProvider'] = 'whisper';

export async function getSettings(): Promise<AppSettings> {
  const existing = await db.settings.get('settings');
  if (!existing) {
    await db.settings.put(DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  }
  let migrated = existing;
  let changed = false;
  if (migrated.leniencyThreshold === LEGACY_DEFAULT_LENIENCY) {
    migrated = { ...migrated, leniencyThreshold: DEFAULT_SETTINGS.leniencyThreshold };
    changed = true;
  }
  if (migrated.transcriptionProvider === LEGACY_DEFAULT_PROVIDER && !migrated.openAiApiKey) {
    // Only auto-switch away from Whisper if no API key was ever entered —
    // someone who already set one up clearly chose Whisper deliberately.
    migrated = { ...migrated, transcriptionProvider: DEFAULT_SETTINGS.transcriptionProvider };
    changed = true;
  }
  if (changed) {
    await db.settings.put(migrated);
  }
  return migrated;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await db.settings.put(settings);
}

export async function recordAttempt(attempt: LineAttempt): Promise<void> {
  await db.attempts.put(attempt);
}
