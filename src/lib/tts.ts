import { isNativeApp } from '../platform/native';
import type { Language } from '../types';

function bcp47(language: Language): string {
  return language === 'he' ? 'he-IL' : 'en-US';
}

function pickVoice(language: Language): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  const prefix = language === 'he' ? 'he' : 'en';
  return (
    voices.find((v) => v.lang.toLowerCase().startsWith(prefix)) ??
    voices.find((v) => v.default) ??
    voices[0]
  );
}

// In the Android app, lines are spoken by Android's text-to-speech engine:
// the WebView's speechSynthesis is unreliable and often has no voices.
// The plugin never settles a speak() that stop() interrupted, so the pending
// one is resolved here instead, as speechSynthesis does on the web.
let resolveNativeSpeech: (() => void) | null = null;
// Bumped by stopSpeaking(), so a line still loading the plugin when playback
// is paused doesn't start speaking afterwards.
let nativeStopCount = 0;

// Android's engine starts asynchronously and rejects speak() with
// UNAVAILABLE until it's ready, e.g. on the first line after app start.
const NATIVE_START_RETRIES = 10;
const NATIVE_START_RETRY_MS = 300;

async function speakNative(text: string, language: Language, rate: number): Promise<void> {
  const stopCount = nativeStopCount;
  const { TextToSpeech } = await import('@capacitor-community/text-to-speech');
  if (stopCount !== nativeStopCount) return;
  // The new line interrupts the previous one natively; just settle its promise.
  settleNativeSpeech();
  await new Promise<void>((resolve) => {
    const done = () => {
      if (resolveNativeSpeech === done) resolveNativeSpeech = null;
      resolve();
    };
    resolveNativeSpeech = done;
    const attempt = (retriesLeft: number) => {
      TextToSpeech.speak({ text, lang: bcp47(language), rate }).then(done, (err: unknown) => {
        const unavailable = (err as { code?: string } | null)?.code === 'UNAVAILABLE';
        if (unavailable && retriesLeft > 0 && resolveNativeSpeech === done) {
          setTimeout(() => attempt(retriesLeft - 1), NATIVE_START_RETRY_MS);
        } else {
          // Like the web version, a line that can't be spoken (e.g. no voice
          // for the language) is skipped rather than stopping playback.
          done();
        }
      });
    };
    attempt(NATIVE_START_RETRIES);
  });
}

/** Resolves the line being spoken, if any. Returns whether there was one. */
function settleNativeSpeech(): boolean {
  const resolve = resolveNativeSpeech;
  if (!resolve) return false;
  resolveNativeSpeech = null;
  resolve();
  return true;
}

function stopNativeSpeech(): void {
  nativeStopCount++;
  if (!settleNativeSpeech()) return;
  import('@capacitor-community/text-to-speech')
    .then(({ TextToSpeech }) => TextToSpeech.stop())
    .catch(() => {});
}

export function speak(text: string, language: Language, rate = 1): Promise<void> {
  if (isNativeApp()) return speakNative(text, language, rate);
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      resolve();
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = bcp47(language);
    utterance.rate = rate;
    const voice = pickVoice(language);
    if (voice) utterance.voice = voice;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
}

export function stopSpeaking(): void {
  if (isNativeApp()) {
    stopNativeSpeech();
    return;
  }
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

export function ensureVoicesLoaded(): Promise<void> {
  return new Promise((resolve) => {
    // The Android engine has no voice list to wait for (see speakNative).
    if (isNativeApp() || !('speechSynthesis' in window)) {
      resolve();
      return;
    }
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      resolve();
      return;
    }
    window.speechSynthesis.onvoiceschanged = () => resolve();
    // Fallback in case the event never fires on some browsers.
    setTimeout(resolve, 1000);
  });
}
