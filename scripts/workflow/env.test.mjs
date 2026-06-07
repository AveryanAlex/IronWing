import { describe, expect, it } from "vitest";
import { tauriFrontendEnv, webFrontendEnv } from "./env.mjs";

describe("analytics frontend environment", () => {
  it("maps shared Aptabase key and host only into the web frontend env", () => {
    const env = {
      IRONWING_APTABASE_KEY: "A-EU-shared",
      IRONWING_APTABASE_HOST: "https://analytics.example.test",
      IRONWING_APP_VERSION: "0.1.0-test",
    };

    expect(webFrontendEnv({}, env)).toMatchObject({
      VITE_IRONWING_APTABASE_KEY: "A-EU-shared",
      VITE_IRONWING_APTABASE_HOST: "https://analytics.example.test",
      VITE_IRONWING_APP_VERSION: "0.1.0-test",
    });
    expect(tauriFrontendEnv({}, env)).not.toHaveProperty("VITE_IRONWING_APTABASE_KEY");
    expect(tauriFrontendEnv({}, env)).not.toHaveProperty("VITE_IRONWING_APTABASE_HOST");
  });

  it("maps common analytics controls into native and web frontend envs", () => {
    const env = {
      IRONWING_APTABASE_DISABLED: "1",
      IRONWING_APP_VERSION: "0.1.0-test",
    };

    expect(tauriFrontendEnv({}, env)).toMatchObject({
      VITE_IRONWING_APTABASE_DISABLED: "1",
      VITE_IRONWING_APP_VERSION: "0.1.0-test",
    });
    expect(webFrontendEnv({}, env)).toMatchObject({
      VITE_IRONWING_APTABASE_DISABLED: "1",
      VITE_IRONWING_APP_VERSION: "0.1.0-test",
    });
  });
});

describe("ArduPilot endpoint frontend environment", () => {
  it("maps shared endpoint overrides into native and web frontend envs", () => {
    const env = {
      IRONWING_ARDUPILOT_AUTOTEST_BASE_URL: "https://proxy.example/autotest",
      IRONWING_ARDUPILOT_FIRMWARE_BASE_URL: "https://proxy.example/firmware",
    };

    expect(tauriFrontendEnv({}, env)).toMatchObject({
      VITE_IRONWING_ARDUPILOT_AUTOTEST_BASE_URL: "https://proxy.example/autotest",
      VITE_IRONWING_ARDUPILOT_FIRMWARE_BASE_URL: "https://proxy.example/firmware",
    });
    expect(webFrontendEnv({}, env)).toMatchObject({
      VITE_IRONWING_ARDUPILOT_AUTOTEST_BASE_URL: "https://proxy.example/autotest",
      VITE_IRONWING_ARDUPILOT_FIRMWARE_BASE_URL: "https://proxy.example/firmware",
    });
  });
});
