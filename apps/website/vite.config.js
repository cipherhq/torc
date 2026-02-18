import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 8083,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@torc/utils': path.resolve(__dirname, '../../packages/utils/src'),
    },
  },
});
