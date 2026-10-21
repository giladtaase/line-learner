import { describe, it, expect, vi, beforeEach } from 'vitest';
import { speak, stopSpeaking } from './tts';

vi.mock('../platform/native', () => ({ isNativeApp: () => true }));

// The app's Android TTS plugin, driven by the test.
const plugin = vi.hoisted(() => ({
  speak: vi.fn(),
  stop: vi.fn(() => Promise.resolve())
}));
vi.mock('@capacitor/core', () => ({ registerPlugin: () => plugin }));

beforeEach(() => {
  plugin.speak.mockReset();
  plugin.stop.mockClear();
});

describe('speak in the Android app', () => {
  it('speaks with the Android plugin in the script language', async () => {
    plugin.speak.mockResolvedValue(undefined);
    await speak('שלום', 'he', 1.2);
    expect(plugin.speak).toHaveBeenCalledWith({ text: 'שלום', lang: 'he-IL', rate: 1.2 });
  });

  it('skips a line no engine can speak instead of failing playback', async () => {
    plugin.speak.mockRejectedValue(Object.assign(new Error('no voice'), { code: 'language' }));
    await expect(speak('Hello', 'he')).resolves.toBeUndefined();
  });

  it('stops speaking through the plugin', () => {
    stopSpeaking();
    expect(plugin.stop).toHaveBeenCalled();
  });
});
