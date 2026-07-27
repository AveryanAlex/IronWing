import { test } from "../support/test";

test("telemetry workspace renders live demo metrics", async ({ app }) => {
  await test.step("Connect an airplane demo session and open Telemetry", async () => {
    await app.openAndConnectDemo("airplane");
    await app.navigateTo("telemetry");
  });

  await test.step("Verify live metrics and the 3D attitude visualization", async () => {
    await app.telemetry.expectLiveMetrics();
    await app.telemetry.expectAttitudeVisualization();
  });
});
