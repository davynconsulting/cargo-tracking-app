import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Three installable apps from one codebase. Each has its own page, manifest and
// service-worker scope, so a driver installs only the field app and a client only the portal.
// Pure business rules (container check digits, milestone labels) come from the API's domain folder.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@domain': resolve(__dirname, '../api/src/domain') } },
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        client: resolve(__dirname, 'client/index.html'),
        field: resolve(__dirname, 'field/index.html'),
        staff: resolve(__dirname, 'staff/index.html'),
      },
    },
  },
  server: {
    port: 5173,
    proxy: { '/api': { target: process.env.API_URL ?? 'http://localhost:3000', rewrite: (p) => p.replace(/^\/api/, '') } },
  },
  preview: {
    port: 4173,
    proxy: { '/api': { target: process.env.API_URL ?? 'http://localhost:3000', rewrite: (p) => p.replace(/^\/api/, '') } },
  },
  test: { environment: 'jsdom', globals: true, include: ['src/**/*.test.{ts,tsx}'] },
});
