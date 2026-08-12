import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Same-origin in development so session cookies work without CORS games.
    proxy: {
      '/api': { target: 'http://localhost:3002', changeOrigin: true },
      '/health': { target: 'http://localhost:3002', changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: false },
  test: { environment: 'jsdom' },
});
