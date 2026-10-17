import { describe, it, expect, beforeEach } from 'vitest';
import { db, DEFAULT_SETTINGS, getSettings, saveSettings, recordAttempt } from './db';
import type { AppSettings, LineAttempt } from '../types';

beforeEach(async () => {
  await db.settings.clear();
  await db.attempts.clear();
});

describe('getSettings', () => {
  it('creates and persists the defaults on first run', async () => {
    const settings = await getSettings();
    expect(settings).toEqual(DEFAULT_SETTINGS);
    expect(await db.settings.get('settings')).toEqual(DEFAULT_SETTINGS);
  });

  it('defaults to the free browser transcription engine', () => {
    expect(DEFAULT_SETTINGS.transcriptionProvider).toBe('webspeech');
  });

  it('returns saved settings unchanged when nothing needs migrating', async () => {
    const custom: AppSettings = {
      ...DEFAULT_SETTINGS,
      uiLanguage: 'he',
      ttsRate: 1.5,
      leniencyThreshold: 0.8
    };
    await saveSettings(custom);
    expect(await getSettings()).toEqual(custom);
  });

  it('migrates the old default leniency (0.72) to the new default', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, leniencyThreshold: 0.72 });
    const settings = await getSettings();
    expect(settings.leniencyThreshold).toBe(DEFAULT_SETTINGS.leniencyThreshold);
    expect((await db.settings.get('settings'))!.leniencyThreshold).toBe(
      DEFAULT_SETTINGS.leniencyThreshold
    );
  });

  it('keeps a leniency value the user chose', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, leniencyThreshold: 0.9 });
    expect((await getSettings()).leniencyThreshold).toBe(0.9);
  });

  it('switches users on the old Whisper default with no API key to Web Speech', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, transcriptionProvider: 'whisper' });
    expect((await getSettings()).transcriptionProvider).toBe('webspeech');
    expect((await db.settings.get('settings'))!.transcriptionProvider).toBe('webspeech');
  });

  it('switches Whisper users whose API key is an empty string', async () => {
    await saveSettings({ ...DEFAULT_SETTINGS, transcriptionProvider: 'whisper', openAiApiKey: '' });
    expect((await getSettings()).transcriptionProvider).toBe('webspeech');
  });

  it('keeps Whisper for users who entered an OpenAI API key', async () => {
    await saveSettings({
      ...DEFAULT_SETTINGS,
      transcriptionProvider: 'whisper',
      openAiApiKey: 'sk-test'
    });
    const settings = await getSettings();
    expect(settings.transcriptionProvider).toBe('whisper');
    expect(settings.openAiApiKey).toBe('sk-test');
  });

  it('applies both migrations together without touching other fields', async () => {
    await saveSettings({
      ...DEFAULT_SETTINGS,
      uiLanguage: 'he',
      transcriptionProvider: 'whisper',
      leniencyThreshold: 0.72
    });
    expect(await getSettings()).toEqual({ ...DEFAULT_SETTINGS, uiLanguage: 'he' });
  });
});

describe('recordAttempt', () => {
  it('stores an attempt that can be queried by script', async () => {
    const attempt: LineAttempt = {
      id: 'a1',
      scriptId: 's1',
      entryId: 'e1',
      timestamp: 1,
      mode: 'cue',
      transcript: 'hello',
      similarity: 0.9,
      passed: true
    };
    await recordAttempt(attempt);
    expect(await db.attempts.where('scriptId').equals('s1').toArray()).toEqual([attempt]);
  });
});
