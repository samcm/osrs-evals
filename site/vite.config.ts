import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';

export default defineConfig({
  base: '/',
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // The run page's game player needs rs-world and the world feeds: run viewer/serve.ts beside the
  // dev server (see its header). Without it the player shows the run's end screenshot.
  server: {
    proxy: {
      '/world/': process.env.VIEWER ?? 'http://127.0.0.1:7576',
      '/feed/': { target: process.env.VIEWER ?? 'http://127.0.0.1:7576', ws: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 1200,
  },
});
