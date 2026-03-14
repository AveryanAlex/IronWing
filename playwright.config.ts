import { defineConfig, devices } from "@playwright/test";

const PLAYWRIGHT_PORT = 4173;
const PLAYWRIGHT_HOST = "127.0.0.1";
const PLAYWRIGHT_BASE_URL = `http://${PLAYWRIGHT_HOST}:${PLAYWRIGHT_PORT}`;
const PNPM_COMMAND = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",

  webServer: {
    command: `${PNPM_COMMAND} run frontend:build && ${PNPM_COMMAND} exec vite preview --host ${PLAYWRIGHT_HOST} --port ${PLAYWRIGHT_PORT}`,
    url: PLAYWRIGHT_BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      IRONWING_PLATFORM: "mock",
    },
  },

  use: {
    baseURL: process.env.E2E_BASE_URL ?? PLAYWRIGHT_BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
