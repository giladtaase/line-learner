import { describe, it, expect, vi, beforeEach } from 'vitest';
import { speak, stopSpeaking } from './tts';

vi.mock('../platform/native', () => ({ isNativeApp: () => true }));

// Android's engine, driven by the test: each speak() waits to be finished.
const engine = vi.hoisted(() => ({
  pending: [] as { resolve: () => void; reject: (e: unknown) => void }[],
  speak: vi.fn(),
  stop: vi.fn(() => Promise.resolve())
}));
vi.mock('@capacitor-community/text-to-speech', () => ({
  TextToSpeech: { speak: engine.speak, stop: engine.stop }
}));

beforeEach(() => {
  engine.pending.length = 0;
  engine.speak.mockReset();
  engine.speak.mockImplementation(
    () => new Promise<void>((resolve, reject) => engine.pending.push({ resolve, reject }))
  );
  engine.stop.mockClear();
});

async function flush() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe('speak in the Android app', () => {
  it('speaks with the Android engine and resolves when the line ends', async () => {
    const done = vi.fn();
    void speak('Hello', 'he', 1.2).then(done);
    await vi.waitFor(() => expect(engine.speak).toHaveBeenCalledWith({ text: 'Hello', lang: 'he-IL', rate: 1.2 }));
    expect(done).not.toHaveBeenCalled();
    engine.pending[0].resolve();
    await vi.waitFor(() => expect(done).toHaveBeenCalled());
  });

  it('resolves an interrupted line when speech is stopped', async () => {
    const line = speak('Hello', 'en');
    await vi.waitFor(() => expect(engine.pending).toHaveLength(1));
    stopSpeaking();
    await expect(line).resolves.toBeUndefined();
    await vi.waitFor(() => expect(engine.stop).toHaveBeenCalled());
  });

  it('does not start a line when speech was stopped while it was loading', async () => {
    const line = speak('Hello', 'en');
    stopSpeaking();
    await line;
    await flush();
    expect(engine.speak).not.toHaveBeenCalled();
  });

  it('retries while the engine is still starting up', async () => {
    vi.useFakeTimers();
    try {
      const line = speak('Hello', 'en');
      await vi.waitFor(() => expect(engine.pending).toHaveLength(1));
      engine.pending[0].reject({ code: 'UNAVAILABLE' });
      await vi.advanceTimersByTimeAsync(300);
      expect(engine.speak).toHaveBeenCalledTimes(2);
      engine.pending[1].resolve();
      await expect(line).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('skips a line the engine cannot speak', async () => {
    const line = speak('Hello', 'he');
    await vi.waitFor(() => expect(engine.pending).toHaveLength(1));
    engine.pending[0].reject(new Error('This language is not supported.'));
    await expect(line).resolves.toBeUndefined();
    expect(engine.speak).toHaveBeenCalledTimes(1);
  });
});
