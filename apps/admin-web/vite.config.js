/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig({
  base: '/',
  plugins: [react()],
  server: {
    port: 8082,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@torc/api': path.resolve(__dirname, '../../packages/api/src'),
      '@torc/ui': path.resolve(__dirname, '../../packages/ui/src'),
      '@torc/types': path.resolve(__dirname, '../../packages/types/src'),
      '@torc/utils': path.resolve(__dirname, '../../packages/utils/src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
  },
});
