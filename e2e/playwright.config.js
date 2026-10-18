// @ts-check
const { defineConfig, devices } = require('@playwright/test');

// E2E_BASE_URL runs the suite against an already-deployed site instead of a local server.
const remoteBaseURL = process.env.E2E_BASE_URL;

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: remoteBaseURL || 'http://localhost:8090',
    locale: 'zh-CN', // default UI language; i18n.spec.js covers English
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /mobile\.spec\.js/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      testMatch: /mobile\.spec\.js/,
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: remoteBaseURL ? undefined : {
    command: 'cd .. && PORT=8090 go run cmd/server/main.go',
    url: 'http://localhost:8090',
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
