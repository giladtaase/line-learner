import { describe, it, expect, vi } from 'vitest';
import {
  NativeSpeechController,
  WebSpeechController,
  createTranscriptionController,
  type NativeSpeechPlugin
} from './transcription';
import { DEFAULT_SETTINGS } from './db';

const native = vi.hoisted(() => ({ value: false }));
vi.mock('../platform/native', () => ({ isNativeApp: () => native.value }));

function fakePlugin(overrides: Partial<NativeSpeechPlugin> = {}): NativeSpeechPlugin {
  return {
    start: vi.fn(() => Promise.resolve()),
    stop: vi.fn(() => Promise.resolve({ transcript: '' })),
    cancel: vi.fn(() => Promise.resolve()),
    ...overrides
  };
}

function rejectWith(code: string) {
  return () => Promise.reject(Object.assign(new Error(code), { code }));
}

describe('NativeSpeechController', () => {
  it('listens in the script language and returns the transcript', async () => {
    const plugin = fakePlugin({ stop: () => Promise.resolve({ transcript: 'shalom' }) });
    const controller = new NativeSpeechController('he', plugin);
    await controller.start();
    expect(plugin.start).toHaveBeenCalledWith({ language: 'he-IL' });
    await expect(controller.stop()).resolves.toBe('shalom');
  });

  it.each([
    ['permission', 'micBlocked'],
    ['unavailable', 'speechUnavailableDevice'],
    ['network', 'speechNetwork'],
    ['language', 'speechLanguageDevice'],
    ['audio', 'noMicrophone'],
    ['error-8', 'speechError']
  ])('maps the native "%s" error to %s', async (nativeCode, appCode) => {
    const controller = new NativeSpeechController('en', fakePlugin({ start: rejectWith(nativeCode) }));
    await expect(controller.start()).rejects.toMatchObject({ code: appCode });
  });

  it('reports an error from stop() when nothing could be transcribed', async () => {
    const controller = new NativeSpeechController('en', fakePlugin({ stop: rejectWith('network') }));
    await controller.start();
    await expect(controller.stop()).rejects.toMatchObject({ code: 'speechNetwork' });
  });

  it('ignores a failure while cancelling', () => {
    const plugin = fakePlugin({ cancel: rejectWith('cancelled') });
    expect(() => new NativeSpeechController('en', plugin).cancel()).not.toThrow();
  });
});

describe('createTranscriptionController', () => {
  it('uses Android speech recognition for the free engine in the app', () => {
    native.value = true;
    expect(createTranscriptionController(DEFAULT_SETTINGS, 'en')).toBeInstanceOf(NativeSpeechController);
    native.value = false;
    expect(createTranscriptionController(DEFAULT_SETTINGS, 'en')).toBeInstanceOf(WebSpeechController);
  });
});
