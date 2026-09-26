import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [react()],
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
    environment: 'jsdom',
    globals: true,
    setupFiles: [],
  },
});
