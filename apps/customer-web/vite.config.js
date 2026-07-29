/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    port: 7002,
    host: true,
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
  esbuild: {
    drop: mode === 'production' ? ['console', 'debugger'] : [],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
  },
}));
