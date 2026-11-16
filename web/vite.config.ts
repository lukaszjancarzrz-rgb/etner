import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // @etner/shared ze źródeł (jak w serwerze), bez wcześniejszego builda shared
  resolve: { alias: { '@etner/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)) } },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      // właściciel 2026-11-16: bez przechowywania aplikacji w telefonie – każde otwarcie pobiera aktualną wersję (offline nie startuje);
      // service worker zostaje tylko dla powiadomień push (push-sw.js), stara pamięć podręczna jest kasowana
      includeAssets: [],
      includeManifestIcons: false,
      manifest: {
        name: 'ETNER',
        short_name: 'ETNER',
        description: 'Harmonogram, zlecenia i zakupy ETNER',
        lang: 'pl',
        id: '/',
        scope: '/',
        start_url: '/#harm',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#0a2240',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        globPatterns: [],
        navigateFallback: null,
        importScripts: ['push-sw.js'],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: {
    rollupOptions: {
      // zod 4 ma komentarze @__PURE__ w miejscach, których Rollup nie czyta; nieszkodliwe
      onwarn(w, warn) { if (w.code === 'INVALID_ANNOTATION' && w.id?.includes('/zod/')) return; warn(w); },
    },
  },
  server: { proxy: { '/api': 'http://localhost:3000', '/p/': 'http://localhost:3000' } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] }, // e2e (Playwright) osobno: pnpm test:e2e
});
