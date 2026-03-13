import { defineConfig, devices } from "@playwright/test";
import { resolveE2ERuntime } from "./src/lib/e2e-runtime";

const e2eRuntime = resolveE2ERuntime(process.env as Record<string, string | undefined>);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: e2eRuntime.baseUrl,
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
