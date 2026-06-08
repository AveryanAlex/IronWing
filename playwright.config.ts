import { defineConfig, devices } from "@playwright/test";

import { allLayoutViewports, demoViewports } from "./e2e/support/viewports";

const PLAYWRIGHT_HOST = "127.0.0.1";
const PLAYWRIGHT_PORT = Number(process.env.E2E_PORT) || 4173;
const PLAYWRIGHT_BASE_URL = `http://${PLAYWRIGHT_HOST}:${PLAYWRIGHT_PORT}`;
const PNPM_COMMAND = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const PLAYWRIGHT_BUILD_PREFIX = process.env.IRONWING_E2E_SKIP_BUILD === "1" ? "" : `${PNPM_COMMAND} run build:web && `;
const PLAYWRIGHT_PREVIEW_COMMAND = [
  PNPM_COMMAND,
  "exec",
  "vite",
  "preview",
  "--host",
  PLAYWRIGHT_HOST,
  "--port",
  String(PLAYWRIGHT_PORT),
].join(" ");
const PLAYWRIGHT_WEB_SERVER_COMMAND = `${PLAYWRIGHT_BUILD_PREFIX}${PLAYWRIGHT_PREVIEW_COMMAND}`;

export default defineConfig({
  testDir: "./e2e/specs",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 1,
  reporter: process.env.CI ? "github" : "list",

  webServer: {
    command: PLAYWRIGHT_WEB_SERVER_COMMAND,
    url: PLAYWRIGHT_BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      IRONWING_PLATFORM: "web",
    },
  },

  use: {
    baseURL: process.env.E2E_BASE_URL ?? PLAYWRIGHT_BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: allLayoutViewports.map((name) => ({
    name,
    metadata: {
      expectedTier: demoViewports[name].expectedTier,
    },
    use: {
      ...devices["Desktop Chrome"],
      viewport: {
        width: demoViewports[name].width,
        height: demoViewports[name].height,
      },
    },
  })),
});
