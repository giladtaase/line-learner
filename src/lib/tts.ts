import type { Language } from '../types';

function pickVoice(language: Language): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  const prefix = language === 'he' ? 'he' : 'en';
  return (
    voices.find((v) => v.lang.toLowerCase().startsWith(prefix)) ??
    voices.find((v) => v.default) ??
    voices[0]
  );
}

export function speak(text: string, language: Language, rate = 1): Promise<void> {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      resolve();
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language === 'he' ? 'he-IL' : 'en-US';
    utterance.rate = rate;
    const voice = pickVoice(language);
    if (voice) utterance.voice = voice;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
}

export function stopSpeaking(): void {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

export function ensureVoicesLoaded(): Promise<void> {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
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
