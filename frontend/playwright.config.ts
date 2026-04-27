import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 1,
  workers: 1,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'e2e',
      dependencies: ['setup'],
      use: {
        storageState: 'e2e/.auth/state.json',
      },
    },
  ],
  webServer: [
    {
      command:
        'cd ../backend && DATABASE_URL=postgresql://postgres:postgres@localhost:5432/curaciones_test JWT_SECRET=test-secret-key NODE_ENV=test npm run start:dev',
      port: 3000,
      reuseExistingServer: true,
      timeout: 30000,
    },
    {
      command: 'VITE_API_URL=http://localhost:3000/api npm run dev',
      port: 5173,
      reuseExistingServer: true,
      timeout: 15000,
    },
  ],
});
