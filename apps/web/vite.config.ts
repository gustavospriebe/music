import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  envDir: repoRoot,
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id))
            return 'react-vendor';
          if (id.includes('node_modules/@tanstack/')) return 'query-vendor';
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5175,
    host: true,
    proxy: {
      '/api': {
        target: process.env.API_URL ?? 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    environmentOptions: { jsdom: { url: 'http://localhost:3001/' } },
    setupFiles: './src/test/setup.ts',
    globals: true,
    exclude: ['e2e/**', '**/node_modules/**', '**/dist/**'],
  },
});
