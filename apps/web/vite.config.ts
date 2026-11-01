import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // The API's default CORS_ORIGINS only allows this exact origin, so never fall back to another port.
    strictPort: true,
  },
});
