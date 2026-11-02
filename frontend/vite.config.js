import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Reachable from a phone on the same Wi-Fi, for testing at a real table.
    host: true,
    proxy: { '/api': 'http://localhost:3001' },
  },
});
