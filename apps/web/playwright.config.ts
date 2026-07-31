import { defineConfig, devices, type PlaywrightTestConfig } from "@playwright/test";

const external = process.env.PROSMET_BASE_URL;
const port = 4173;
const fixturePort = 4174;

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
    webServer: [
      {
        command: `FIXTURE_AGENT_PORT=${fixturePort} node e2e/fixture-agent.mjs`,
        url: `http://127.0.0.1:${fixturePort}/health`,
        reuseExistingServer: false,
        timeout: 30_000
      },
      {
        command: `rm -rf test-results/e2e-config && mkdir -p test-results/e2e-config && PORT=${port} PROSMET_RELEASE_SHA=e2e PROSMET_ADMIN_TOKEN=e2e-admin PROSMET_CONFIG_DIR=$PWD/test-results/e2e-config node server.mjs`,
        url: `http://127.0.0.1:${port}/api/health`,
        reuseExistingServer: false,
        timeout: 30_000
      }
    ]
  })
};

export default defineConfig(config);
