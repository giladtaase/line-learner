import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  WebSpeechController,
  transcriptFromResults,
  WEB_SPEECH_STOP_TIMEOUT_MS,
  type SpeechResultList
} from './transcription';

function results(...items: [string, boolean][]): SpeechResultList {
  return items.map(([transcript, isFinal]) => ({ 0: { transcript }, isFinal }));
}

/** Stand-in for the browser's SpeechRecognition, driven by the test. */
class FakeRecognition {
  static last: FakeRecognition;
  lang = '';
  continuous = false;
  interimResults = false;
  onstart: (() => void) | null = null;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  stopCalls = 0;
  /** Whether stop() fires `end` like a well-behaved browser. */
  endsOnStop = true;

  constructor() {
    FakeRecognition.last = this;
  }
  start() {}
  stop() {
    this.stopCalls++;
    if (this.endsOnStop) this.onend?.();
  }
  abort() {
    this.onend?.();
  }
  emitResults(list: SpeechResultList) {
    this.onresult?.({ results: list });
  }
}

const win = window as unknown as { SpeechRecognition?: unknown };

beforeEach(() => {
  win.SpeechRecognition = FakeRecognition;
});

afterEach(() => {
  delete win.SpeechRecognition;
  vi.useRealTimers();
});

async function startedController(): Promise<WebSpeechController> {
  const controller = new WebSpeechController('en');
  const started = controller.start();
  FakeRecognition.last.onstart?.();
  await started;
  return controller;
}

describe('transcriptFromResults', () => {
  it('joins final results without repeating earlier phrases', () => {
    expect(transcriptFromResults(results(['hello there', true], [' how are', false]))).toEqual({
      final: 'hello there',
      interim: 'how are'
    });
  });
});

describe('WebSpeechController', () => {
  it('does not duplicate phrases across successive result events', async () => {
    const controller = await startedController();
    const rec = FakeRecognition.last;
    // Continuous mode: each event carries the whole session's results so far.
    rec.emitResults(results(['to be', true]));
    rec.emitResults(results(['to be', true], ['or not', true]));
    rec.emitResults(results(['to be', true], ['or not', true], ['to be', true]));
    expect(await controller.stop()).toBe('to be or not to be');
  });

  it('resolves stop() even when the browser already ended recognition on its own', async () => {
    const controller = await startedController();
    const rec = FakeRecognition.last;
    rec.emitResults(results(['ay me', true]));
    rec.onend?.(); // e.g. Chrome ending after a pause in speech
    expect(await controller.stop()).toBe('ay me');
  });

  it('gives up waiting for `end` after a timeout and keeps interim words', async () => {
    vi.useFakeTimers();
    const controller = await startedController();
    const rec = FakeRecognition.last;
    rec.endsOnStop = false;
    rec.emitResults(results(['but soft', true], ['what light', false]));
    const stopped = controller.stop();
    await vi.advanceTimersByTimeAsync(WEB_SPEECH_STOP_TIMEOUT_MS);
    expect(await stopped).toBe('but soft what light');
  });

  it('rejects start() when microphone access is blocked', async () => {
    const controller = new WebSpeechController('en');
    const started = controller.start();
    FakeRecognition.last.onerror?.({ error: 'not-allowed' });
    FakeRecognition.last.onend?.();
    await expect(started).rejects.toThrow('Microphone access was blocked.');
  });

  it('treats "no speech heard" as an empty transcript, not an error', async () => {
    const controller = await startedController();
    FakeRecognition.last.onerror?.({ error: 'no-speech' });
    expect(await controller.stop()).toBe('');
  });

  it('rejects stop() with an error that happened mid-recording', async () => {
    const controller = await startedController();
    FakeRecognition.last.onerror?.({ error: 'network' });
    FakeRecognition.last.onend?.();
    await expect(controller.stop()).rejects.toThrow('internet connection');
  });

  it('uses the script language for recognition', async () => {
    const controller = new WebSpeechController('he');
    const started = controller.start();
    expect(FakeRecognition.last.lang).toBe('he-IL');
    FakeRecognition.last.onstart?.();
    await started;
    controller.cancel();
  });
});
