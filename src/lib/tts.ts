import { registerPlugin } from '@capacitor/core';
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

/**
 * The app's own Android text-to-speech plugin
 * (android/app/src/main/java/com/line_learner/app/TtsPlugin.java), used in
 * the app instead of the WebView's unreliable speechSynthesis. It picks an
 * installed engine that can speak the language (Samsung's default engine has
 * no Hebrew, Google's does). speak() resolves when the line ends or is
 * interrupted; it rejects when no engine can speak the language.
 */
export interface NativeTtsPlugin {
  speak(options: { text: string; lang: string; rate: number }): Promise<void>;
  stop(): Promise<void>;
}

const LineLearnerTts = registerPlugin<NativeTtsPlugin>('LineLearnerTts');

export function speak(text: string, language: Language, rate = 1): Promise<void> {
  if (isNativeApp()) {
    // Like the web version, a line that can't be spoken (e.g. no voice for
    // the language) is skipped rather than stopping playback.
    return LineLearnerTts.speak({ text, lang: bcp47(language), rate }).catch(() => {});
  }
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
    LineLearnerTts.stop().catch(() => {});
    return;
  }
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

export function ensureVoicesLoaded(): Promise<void> {
  return new Promise((resolve) => {
    // The Android plugin starts its engines when it first speaks.
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
