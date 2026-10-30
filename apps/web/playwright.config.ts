import { defineConfig, devices } from '@playwright/test';

const API_PORT = process.env.E2E_API_PORT ?? '3100';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://localhost:4174', trace: 'retain-on-failure' },
  // Phone size from AC-17: a 375 px wide screen with touch.
  projects: [{ name: 'phone', use: { ...devices['iPhone 13'], browserName: 'chromium', viewport: { width: 375, height: 812 } } }],
  webServer: [
    { command: 'bash e2e/start-api.sh', url: `http://localhost:${API_PORT}/health`, timeout: 120_000, reuseExistingServer: false, stdout: 'pipe' },
    {
      command: 'npx vite --port 4174 --strictPort',
      url: 'http://localhost:4174/client/',
      env: { API_URL: `http://localhost:${API_PORT}` },
      reuseExistingServer: false,
    },
  ],
});
