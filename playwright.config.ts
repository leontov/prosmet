import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 20_000 },
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  webServer: {
    command: "npm run start",
    url: "http://127.0.0.1:3100/api/health",
    timeout: 120_000,
    reuseExistingServer: !process.env.CI
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 960 } }
    },
    {
      name: "mobile",
      use: { ...devices["iPhone 14"] }
    }
  ]
});
