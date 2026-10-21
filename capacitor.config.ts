import type { CapacitorConfig } from '@capacitor/cli';

// The Android app runs the same web build as line-learner.com, built with
// `--mode native` (see vite.config.ts) and copied into android/ by `cap sync`.
const config: CapacitorConfig = {
  appId: 'com.line_learner.app',
  appName: 'Line Learner',
  webDir: 'dist',
  android: {
    // The page background (slate-50), shown while the page loads.
    backgroundColor: '#f8fafc'
  },
  plugins: {
    SystemBars: {
      // Light icons on both system bars, over the brand color the window
      // shows behind them (android/app/src/main/res/values/styles.xml).
      style: 'DARK'
    }
  }
};

export default config;
