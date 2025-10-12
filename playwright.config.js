import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for E2E testing (Playwright 1.56+)
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests/e2e',

  // Output folder for test artifacts
  outputDir: './test-results',

  // Maximum time one test can run (30 seconds)
  timeout: 30 * 1000,

  // Run tests in parallel
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only
  forbidOnly: !!process.env.CI,

  // Retry on CI only (2025 best practice: retry once for flaky tests)
  retries: process.env.CI ? 2 : 0,

  // Workers: Use more workers locally, fewer on CI for stability
  workers: process.env.CI ? 2 : undefined,

  // Reporter configuration (enhanced for 2025)
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/results.json' }],
    process.env.CI ? ['github'] : ['list']
  ],

  // Global expect timeout
  expect: {
    // Maximum time expect() should wait for condition
    timeout: 5000,
    // Screenshot comparison settings
    toHaveScreenshot: {
      maxDiffPixels: 100
    }
  },

  // Shared settings for all tests
  use: {
    // Base URL for navigation
    baseURL: process.env.BASE_URL || 'http://localhost:3001',

    // Collect trace on failure (2025: always on first retry)
    trace: 'on-first-retry',

    // Screenshot strategy
    screenshot: 'only-on-failure',

    // Video retention strategy
    video: 'retain-on-failure',

    // Maximum time for each action (e.g., click, fill)
    actionTimeout: 10 * 1000,

    // Navigation timeout
    navigationTimeout: 30 * 1000,

    // Ignore HTTPS errors (useful for local dev)
    ignoreHTTPSErrors: true
  },

  // Configure projects for major browsers
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Use Chromium's latest stable channel
        channel: 'chrome'
      },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    // Mobile viewports for responsive testing
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },

    // Tablet viewport
    {
      name: 'Tablet',
      use: { ...devices['iPad Pro'] },
    }
  ],

  // Run local dev server before starting tests
  webServer: {
    command: 'node dev-server.js 3001',
    url: 'http://localhost:3001',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      PLAYWRIGHT: 'true'  // Prevent browser auto-open during E2E tests
    }
  }
});
