import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [
    tanstackRouter({
      target: 'react',
      routesDirectory: './src/routes',
      generatedRouteTree: './src/routeTree.gen.ts',
      autoCodeSplitting: true,
      quoteStyle: 'single',
    }),
    tailwindcss(),
    react(),
  ],
  // The run page's game player needs rs-world and the world feeds: run viewer/serve.ts beside the
  // dev server (see its header). Without it the player shows the run's end screenshot.
  server: {
    proxy: {
      '/world/': process.env.VIEWER ?? 'http://127.0.0.1:7576',
      '/feed/': { target: process.env.VIEWER ?? 'http://127.0.0.1:7576', ws: true },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    conditions: ['import', 'module', 'browser', 'default'],
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1200,
    commonjsOptions: {
      transformMixedEsModules: true, // Handle packages with mixed ESM/CommonJS
    },
  },
});
