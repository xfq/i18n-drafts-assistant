import { defineConfig } from '@playwright/test';

const PORT = 4123;
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ['list'],
    ['html', { open: 'never' }]
  ],
  use: {
    baseURL,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry'
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } }
  ],
  webServer: {
    command: 'npm run index -- --source-mode=local --source-repo-path=tests/fixtures/i18n-mini && npm start',
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      PORT: String(PORT),
      INDEX_PATH: '.data/e2e-index.json',
      QUERY_LOG_PATH: '.data/e2e-query-log.jsonl',
      SOURCE_MODE: 'local',
      SOURCE_REPO_PATH: 'tests/fixtures/i18n-mini',
      SOURCES: '',
      MODEL_PROVIDER: 'local',
      RATE_LIMIT_MAX: '10000'
    }
  }
});
