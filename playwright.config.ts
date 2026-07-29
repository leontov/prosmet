import { defineConfig, devices } from "@playwright/test";

const externalBaseURL = process.env.PROSMET_BASE_URL?.trim();
const e2ePort = Number(process.env.PROSMET_E2E_PORT || 13110);
const baseURL = externalBaseURL || `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 75_000,
  expect: { timeout: 20_000 },
  retries: 0,
  workers: process.env.CI ? 1 : undefined,
  maxFailures: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  webServer: externalBaseURL
    ? undefined
    : {
        command: `npx next start -H 127.0.0.1 -p ${e2ePort}`,
        url: `${baseURL}/api/health`,
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
        env: {
          ...process.env,
          PORT: String(e2ePort)
        }
      },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 960 } }
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"], browserName: "chromium" }
    }
  ]
});
