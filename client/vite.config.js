import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Reachable from a phone on the same Wi-Fi, for testing at a real table.
    host: true,
    // In development, /api requests go to the Express server (server/, port 3000).
    proxy: { '/api': 'http://localhost:3000' },
  },
});
