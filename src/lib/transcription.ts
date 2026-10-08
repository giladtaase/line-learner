import type { AppSettings, Language } from '../types';

/**
 * Provider-agnostic speech-to-text controller used to grade recorded lines.
 * Two implementations:
 *  - WhisperController: records audio with MediaRecorder, then sends the
 *    clip to OpenAI's Whisper API on stop().
 *  - WebSpeechController: uses the browser's built-in SpeechRecognition
 *    (free, Chrome/Safari only) for live transcription.
 */
export interface TranscriptionController {
  start(): Promise<void>;
  /** Stops capture and resolves with the final transcript text. */
  stop(): Promise<string>;
  /** Aborts capture without producing a transcript. */
  cancel(): void;
}

export class TranscriptionError extends Error {}

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
      throw new TranscriptionError('Missing OpenAI API key. Add one in Settings.');
    }
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
        reject(new TranscriptionError('Recording was not started.'));
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
    this.mediaRecorder?.stop();
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
      throw new TranscriptionError(`Whisper API error (${response.status}): ${errText}`);
    }
    const data = (await response.json()) as { text: string };
    return data.text ?? '';
  }
}

// Minimal shape of the non-standard Web Speech API, which TypeScript's DOM
// lib doesn't fully type across browsers.
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | undefined {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function isWebSpeechSupported(): boolean {
  return !!getSpeechRecognitionCtor();
}

class WebSpeechController implements TranscriptionController {
  private recognition: SpeechRecognitionLike | null = null;
  private finalTranscript = '';

  constructor(private language: Language) {}

  async start(): Promise<void> {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      throw new TranscriptionError(
        'Speech recognition is not supported in this browser. Try Chrome or Safari, or switch to Whisper in Settings.'
      );
    }
    this.finalTranscript = '';
    this.recognition = new Ctor();
    this.recognition.lang = this.language === 'he' ? 'he-IL' : 'en-US';
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.onresult = (event: unknown) => {
      const e = event as { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> };
      let interim = '';
      for (let i = 0; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) {
          this.finalTranscript += result[0].transcript + ' ';
        } else {
          interim += result[0].transcript;
        }
      }
      void interim; // Interim results aren't surfaced yet; only the final transcript is used for grading.
    };
    this.recognition.start();
  }

  stop(): Promise<string> {
    return new Promise((resolve) => {
      if (!this.recognition) {
        resolve('');
        return;
      }
      this.recognition.onend = () => resolve(this.finalTranscript.trim());
      this.recognition.stop();
    });
  }

  cancel(): void {
    this.recognition?.abort();
  }
}

export function createTranscriptionController(
  settings: AppSettings,
  language: Language
): TranscriptionController {
  if (settings.transcriptionProvider === 'webspeech') {
    return new WebSpeechController(language);
  }
  return new WhisperController(settings.openAiApiKey ?? '', language);
}
