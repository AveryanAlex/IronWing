import { test } from "../support/test";

test("telemetry workspace renders live demo metrics", async ({ app }) => {
  await test.step("Connect an airplane demo session and open Telemetry", async () => {
    await app.openAndConnectDemo("airplane");
    await app.navigateTo("telemetry");
  });

  await test.step("Verify flight, power, and GPS metrics are populated from live demo telemetry", async () => {
    await app.telemetry.expectLiveMetrics();
  });
});
