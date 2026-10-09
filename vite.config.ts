import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Served from https://<user>.github.io/line-learner/ on GitHub Pages, so all
// asset/app URLs need that repo name as a base path. Locally (`npm run dev`)
// Vite still serves from "/" regardless of this setting's effect on dev vs
// build; this only affects the production build output.
const base = '/line-learner/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
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
});
