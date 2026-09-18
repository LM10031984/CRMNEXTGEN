import { defineConfig } from '@playwright/test';
import { assertTestTarget } from '../../packages/db/scripts/assert-test-target';
const baseURL = 'http://127.0.0.1:3018';
assertTestTarget({ databaseUrl: process.env.DATABASE_URL, baseUrl: baseURL });
export default defineConfig({
  testDir: './scripts',
  testMatch: 'planning.e2e.ts',
  workers: 1,
  retries: 0,
  timeout: 90_000,
  reporter: [['list']],
  webServer: {
    command: 'pnpm exec next dev --hostname 127.0.0.1 --port 3018',
    url: `${baseURL}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      QUALIOF_E2E: '1',
      DATABASE_URL: process.env.DATABASE_URL!,
      DIRECT_URL: process.env.DATABASE_URL!,
      AUTH_SECRET: 'planning-test-0123456789abcdef0123456789abcdef',
      STORAGE_PROVIDER: 'minio',
      SMTP_HOST: '',
      GOOGLE_OAUTH_REFRESH_TOKEN: '',
    },
  },
  use: { baseURL, viewport: { width: 1720, height: 1080 }, trace: 'retain-on-failure' },
});
