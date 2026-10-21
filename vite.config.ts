import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Served from the root of https://line-learner.com (GitHub Pages with a
// custom domain, see public/CNAME), and from the root of the Android app.
const base = '/';

export default defineConfig(({ mode }) => ({
  base,
  plugins: [
    react(),
    VitePWA({
      // `--mode native` builds the Android app, which ships its files inside
      // the APK. A service worker there would only risk serving a stale build.
      disable: mode === 'native',
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Line Learner',
        short_name: 'LineLearner',
        description: 'Practice and memorize your lines for plays, in English and Hebrew.',
        theme_color: '#1e293b',
        background_color: '#1e293b',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ]
}));
