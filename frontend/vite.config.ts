import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon-192.png', 'icon-512.png', 'share-target.js'],
      manifest: {
        name: 'Money Hater — Trip Logger',
        short_name: 'Money Hater',
        description:
          'Upload your photos; get your itinerary and what you spent, automatically.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f8fafc',
        theme_color: '#0f172a',
        categories: ['travel', 'finance', 'lifestyle'],
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Add photos', short_name: 'Upload', url: '/upload' },
          { name: 'Add expense', short_name: 'Expense', url: '/expenses' },
        ],
        // Installed, the app appears in the phone's share sheet, so photos can
        // be sent straight from the gallery instead of hunting for them in a
        // file picker. Files need POST + multipart, which means the service
        // worker has to answer it (see public/share-target.js).
        //
        // `accept` is what Android builds the app's intent filter from, and it
        // is spelled out rather than left as a bare `image/*`: Chrome's own
        // guidance is to give both concrete MIME types and file extensions
        // because platforms disagree about which they match on, and a gallery
        // sharing HEIC — every recent iPhone, and plenty of Android cameras —
        // frequently offers a type this app has to name to be offered back.
        share_target: {
          action: '/share-target',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            files: [
              {
                name: 'files',
                accept: [
                  'image/*',
                  'image/jpeg',
                  'image/png',
                  'image/webp',
                  'image/heic',
                  'image/heif',
                  'image/avif',
                  'image/gif',
                  '.jpg',
                  '.jpeg',
                  '.png',
                  '.webp',
                  '.heic',
                  '.heif',
                  '.avif',
                  '.gif',
                ],
              },
            ],
          },
        },
      },
      workbox: {
        importScripts: ['/share-target.js'],
        // The API is private and mutable — never let the SW answer for it.
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            // Thumbnails are immutable once analyzed, so the shell stays usable offline
            urlPattern: /\/api\/images\/\d+\/thumb$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'thumbnails',
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: /^https:\/\/tile\.openstreetmap\.org\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 14 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    host: true,
    proxy: {
      '/api': process.env.VITE_API_PROXY ?? 'http://localhost:8000',
    },
  },
});
