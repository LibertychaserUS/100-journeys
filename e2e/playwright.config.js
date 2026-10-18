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
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: remoteBaseURL ? undefined : {
    command: 'cd .. && PORT=8090 go run cmd/server/main.go',
    url: 'http://localhost:8090',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
