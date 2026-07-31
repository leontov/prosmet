import { defineConfig, devices, type PlaywrightTestConfig } from "@playwright/test";

const external = process.env.PROSMET_BASE_URL;
const port = 4173;

const config: PlaywrightTestConfig = {
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: external || `http://127.0.0.1:${port}`,
    browserName: "chromium",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        browserName: "chromium",
        viewport: { width: 1440, height: 900 }
      }
    },
    {
      name: "mobile-chromium",
      use: {
        ...devices["iPhone 14"],
        browserName: "chromium",
        viewport: { width: 390, height: 844 }
      }
    }
  ],
  ...(external ? {} : {
    webServer: {
      command: `PORT=${port} node e2e/harness.mjs`,
      url: `http://127.0.0.1:${port}/api/health`,
      reuseExistingServer: false,
      timeout: 45_000
    }
  })
};

export default defineConfig(config);
