import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    fs: {
      deny: ['**/data/**', '**/server.js'],
    },
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
});
