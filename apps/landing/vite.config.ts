import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';

import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import analytics from 'unplugin-analytics/vite';

export default defineConfig({
  base: '/',
  plugins: [
    react(),
    tailwindcss(),
    analytics({
      analytics: {
        umami: {
          id: 'fd9582a9-0a42-45d4-9e50-e9d9b410a1dc',
          src: 'https://umami.onekuma.cn/script.js'
        }
      }
    })
  ],
  build: {
    outDir: '../server/public',
    emptyOutDir: true
  },
  server: {
    proxy: {
      '/bili': 'https://lnovel.animes.garden'
    }
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  }
});
