import { Capacitor } from '@capacitor/core';

/** True inside the Android app (Capacitor), false on the web and mobile web.
 *  Services that the Android WebView lacks (speech recognition, reliable
 *  speech synthesis, file sharing) switch to native plugins when it's true. */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}
