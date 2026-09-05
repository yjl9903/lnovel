import { config } from 'dotenv';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

config({
  path: [
    fileURLToPath(new URL('./.env', import.meta.url)),
    fileURLToPath(new URL('../../.env', import.meta.url))
  ],
  quiet: true
});

export default defineConfig({
  plugins: [
    tanstackStart({
      prerender: { enabled: false },
      importProtection: { behavior: 'error', client: { specifiers: ['@lnovel/server', /^node:/] } }
    }),
    react(),
    tailwindcss()
  ],
  ssr: { external: ['@lnovel/server'] },
  optimizeDeps: { exclude: ['@lnovel/server', '@hono/node-server'] },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } }
});
