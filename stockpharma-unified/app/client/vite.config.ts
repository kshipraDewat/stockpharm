import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  envDir: path.resolve(__dirname, '..'),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: parseInt(process.env.CLIENT_PORT ?? '3000', 10),
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.API_PORT ?? '4000'}`,
        changeOrigin: true,
      },
    },
  },
});
