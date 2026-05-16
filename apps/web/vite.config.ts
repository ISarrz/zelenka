import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Forward API calls to the api container in dev. In prod Caddy handles
      // both /api/* (-> api) and / (-> web) on the same host.
      '/api': {
        target: process.env.VITE_API_BASE || 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
});
