import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:7999',
        changeOrigin: true
      }
    }
  },
  build: {
    sourcemap: true
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/setup_tests.ts'
  }
});
