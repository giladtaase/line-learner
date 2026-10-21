import { registerPlugin } from '@capacitor/core';
import { isNativeApp } from '../platform/native';
import type { AppSettings, Language } from '../types';
import { AppError } from './errors';

/**
 * Provider-agnostic speech-to-text controller used to grade recorded lines.
 * Three implementations:
 *  - WhisperController: records audio with MediaRecorder, then sends the
 *    clip to OpenAI's Whisper API on stop().
 *  - WebSpeechController: uses the browser's built-in SpeechRecognition
 *    (free, Chrome/Safari only) for live transcription.
 *  - NativeSpeechController: the free option in the Android app, whose
 *    WebView has no SpeechRecognition. Uses Android's recognizer instead.
 */
export interface TranscriptionController {
  start(): Promise<void>;
  /** Stops capture and resolves with the final transcript text. */
  stop(): Promise<string>;
  /** Aborts capture without producing a transcript. */
  cancel(): void;
}

export class TranscriptionError extends AppError {}

/** Opens the microphone, turning permission and device failures into
 *  user-facing errors. */
async function getMicrophone(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    const name = err instanceof DOMException ? err.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      throw new TranscriptionError('micBlocked', 'Microphone access was blocked.');
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      throw new TranscriptionError('noMicrophone', 'No microphone was found.');
    }
    throw err;
  }
}

function pickRecorderMimeType(): string | undefined {
  const candidates = ['audio/webm', 'audio/mp4', 'audio/ogg'];
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return undefined;
}

class WhisperController implements TranscriptionController {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;

  constructor(
    private apiKey: string,
    private language: Language
  ) {}

  async start(): Promise<void> {
    if (!this.apiKey) {
      throw new TranscriptionError('missingApiKey', 'Missing OpenAI API key. Add one in Settings.');
    }
    this.stream = await getMicrophone();
    const mimeType = pickRecorderMimeType();
    this.mediaRecorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    this.chunks = [];
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.mediaRecorder.start();
  }

  stop(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new TranscriptionError('recordingNotStarted', 'Recording was not started.'));
        return;
      }
      this.mediaRecorder.onstop = async () => {
        this.stream?.getTracks().forEach((t) => t.stop());
        try {
          const blob = new Blob(this.chunks, { type: this.mediaRecorder?.mimeType || 'audio/webm' });
          const text = await this.transcribe(blob);
          resolve(text);
        } catch (err) {
          reject(err);
        }
      };
      this.mediaRecorder.stop();
    });
  }

  cancel(): void {
    // Calling stop() on an already-stopped recorder throws, e.g. when
    // cancelling while a stopped clip is being transcribed.
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.onstop = null;
      this.mediaRecorder.stop();
    }
    this.stream?.getTracks().forEach((t) => t.stop());
  }

  private async transcribe(blob: Blob): Promise<string> {
    const form = new FormData();
    const ext = blob.type.includes('mp4') ? 'mp4' : blob.type.includes('ogg') ? 'ogg' : 'webm';
    form.append('file', blob, `line.${ext}`);
    form.append('model', 'whisper-1');
    form.append('language', this.language === 'he' ? 'he' : 'en');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new TranscriptionError(
        'whisperApi',
        `Whisper API error (${response.status}): ${errText}`,
        { status: response.status, detail: errText }
      );
    }
    const data = (await response.json()) as { text: string };
    return data.text ?? '';
  }
}

// Minimal shape of the non-standard Web Speech API, which TypeScript's DOM
// lib doesn't fully type across browsers.
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: (() => void) | null;
  onresult: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
}

export type SpeechResultList = ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;

/**
 * Builds the transcript from a SpeechRecognition result list. In continuous
 * mode the list holds every result of the session so far (not just new ones),
 * so the transcript must be rebuilt from scratch on each event. Appending
 * would repeat earlier phrases.
 */
export function transcriptFromResults(results: SpeechResultList): {
  final: string;
  interim: string;
} {
  const finals: string[] = [];
  const interims: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    (result.isFinal ? finals : interims).push(result[0].transcript.trim());
  }
  return { final: finals.join(' ').trim(), interim: interims.join(' ').trim() };
}

/** Maps a SpeechRecognition error code to a user-facing error, or null for
 *  codes that just mean "nothing was heard" or "we aborted it ourselves". */
function speechErrorFor(code: string): TranscriptionError | null {
  switch (code) {
    case 'no-speech':
    case 'aborted':
      return null;
    case 'not-allowed':
    case 'service-not-allowed':
      return new TranscriptionError('micBlocked', 'Microphone access was blocked.');
    case 'audio-capture':
      return new TranscriptionError('noMicrophone', 'No microphone was found.');
    case 'network':
      return new TranscriptionError(
        'speechNetwork',
        'Speech recognition needs an internet connection.'
      );
    case 'language-not-supported':
      return new TranscriptionError(
        'speechLanguageUnsupported',
        "This browser can't recognize speech in the script's language. Try Whisper in Settings."
      );
    default:
      return new TranscriptionError('speechError', `Speech recognition error: ${code}`, { code });
  }
}

// How long stop() waits for the browser's `end` event before giving up and
// returning what it has, so the UI can't hang on "Transcribing..." forever.
export const WEB_SPEECH_STOP_TIMEOUT_MS = 4000;

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | undefined {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

/** Whether the free built-in recognition (the 'webspeech' setting) can work
 *  here. In the Android app it's checked when recording starts instead. */
export function isWebSpeechSupported(): boolean {
  return isNativeApp() || !!getSpeechRecognitionCtor();
}

export class WebSpeechController implements TranscriptionController {
  private recognition: SpeechRecognitionLike | null = null;
  private finalText = '';
  private interimText = '';
  private error: TranscriptionError | null = null;
  // The browser can end recognition on its own (e.g. after a stretch of
  // silence, or on an error) before the user taps stop, so `end` may already
  // have fired by the time stop() is called.
  private ended = false;
  private onEnded: (() => void) | null = null;

  constructor(private language: Language) {}

  start(): Promise<void> {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      return Promise.reject(
        new TranscriptionError(
          'speechUnsupported',
          'Speech recognition is not supported in this browser. Try Chrome or Safari, or switch to Whisper in Settings.'
        )
      );
    }
    this.finalText = '';
    this.interimText = '';
    this.error = null;
    this.ended = false;
    this.onEnded = null;
    const recognition = new Ctor();
    this.recognition = recognition;
    recognition.lang = this.language === 'he' ? 'he-IL' : 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;

    // Resolves once the browser is actually listening, so a blocked
    // microphone is reported right away instead of only when stopping.
    return new Promise((resolve, reject) => {
      let started = false;
      recognition.onstart = () => {
        started = true;
        resolve();
      };
      recognition.onresult = (event: unknown) => {
        const { final, interim } = transcriptFromResults(
          (event as { results: SpeechResultList }).results
        );
        this.finalText = final;
        this.interimText = interim;
      };
      recognition.onerror = (event: unknown) => {
        const err = speechErrorFor((event as { error?: string }).error ?? 'unknown');
        if (!err) return;
        this.error = err;
        if (!started) reject(err);
      };
      recognition.onend = () => {
        this.ended = true;
        if (!started) {
          reject(
            this.error ??
              new TranscriptionError(
                'speechStoppedEarly',
                'Speech recognition stopped before it started.'
              )
          );
        }
        this.onEnded?.();
      };
      try {
        recognition.start();
      } catch (err) {
        reject(
          err instanceof Error
            ? err
            : new TranscriptionError('speechError', String(err), { code: String(err) })
        );
      }
    });
  }

  stop(): Promise<string> {
    const recognition = this.recognition;
    if (!recognition) return Promise.resolve('');
    return new Promise((resolve, reject) => {
      const settle = () => {
        this.onEnded = null;
        if (this.error) {
          reject(this.error);
        } else {
          // Normally the last phrase is finalized before `end`; if it wasn't
          // (timeout, or the browser ended early), keep the interim words too.
          resolve(`${this.finalText} ${this.interimText}`.trim());
        }
      };
      if (this.ended) {
        settle();
        return;
      }
      const timer = setTimeout(() => {
        recognition.abort();
        settle();
      }, WEB_SPEECH_STOP_TIMEOUT_MS);
      this.onEnded = () => {
        clearTimeout(timer);
        settle();
      };
      recognition.stop();
    });
  }

  cancel(): void {
    this.onEnded = null;
    this.recognition?.abort();
  }
}

/**
 * The app's own Android speech plugin
 * (android/app/src/main/java/com/line_learner/app/SpeechPlugin.java). It keeps
 * listening across pauses until stop(), which resolves with the transcript.
 * Rejections carry a `code`: unavailable, permission, network, language,
 * audio, cancelled, or error-N.
 */
export interface NativeSpeechPlugin {
  start(options: { language: string }): Promise<void>;
  stop(): Promise<{ transcript: string }>;
  cancel(): Promise<void>;
}

const LineLearnerSpeech = registerPlugin<NativeSpeechPlugin>('LineLearnerSpeech');

/** Maps a native plugin rejection to a user-facing error. */
function nativeSpeechErrorFor(err: unknown): TranscriptionError {
  const code = (err as { code?: string } | null)?.code ?? 'unknown';
  switch (code) {
    case 'unavailable':
      return new TranscriptionError(
        'speechUnavailableDevice',
        "Speech recognition isn't available on this device."
      );
    case 'permission':
      return new TranscriptionError('micBlocked', 'Microphone access was blocked.');
    case 'audio':
      return new TranscriptionError('noMicrophone', 'No microphone was found.');
    case 'network':
      return new TranscriptionError(
        'speechNetwork',
        'Speech recognition needs an internet connection.'
      );
    case 'language':
      return new TranscriptionError(
        'speechLanguageDevice',
        "This device can't recognize speech in the script's language."
      );
    default:
      return new TranscriptionError('speechError', `Speech recognition error: ${code}`, { code });
  }
}

export class NativeSpeechController implements TranscriptionController {
  constructor(
    private language: Language,
    private plugin: NativeSpeechPlugin = LineLearnerSpeech
  ) {}

  async start(): Promise<void> {
    try {
      await this.plugin.start({ language: this.language === 'he' ? 'he-IL' : 'en-US' });
    } catch (err) {
      throw nativeSpeechErrorFor(err);
    }
  }

  async stop(): Promise<string> {
    try {
      const { transcript } = await this.plugin.stop();
      return transcript;
    } catch (err) {
      throw nativeSpeechErrorFor(err);
    }
  }

  cancel(): void {
    this.plugin.cancel().catch(() => {});
  }
}

export function createTranscriptionController(
  settings: AppSettings,
  language: Language
): TranscriptionController {
  if (settings.transcriptionProvider === 'webspeech') {
    return isNativeApp() ? new NativeSpeechController(language) : new WebSpeechController(language);
  }
  return new WhisperController(settings.openAiApiKey ?? '', language);
}
