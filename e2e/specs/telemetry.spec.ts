import { applyDemoViewport, constrainedLayoutViewports, demoViewports, expectWorkspaceUsable } from "../support/layout";
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

for (const viewport of constrainedLayoutViewports) {
  test(`telemetry layout stays usable on ${viewport}`, async ({ app, page }) => {
    await test.step(`Open live Telemetry at the ${viewport} viewport`, async () => {
      await applyDemoViewport(page, viewport);
      await app.openAndConnectDemo("airplane");
      await app.navigateTo("telemetry");
      await app.shell.expectTier(demoViewports[viewport].expectedTier);
      await app.telemetry.expectLiveMetrics();
    });

    await test.step("Verify telemetry metrics fit and remain reachable", async () => {
      await expectWorkspaceUsable(page, `${viewport} telemetry`);
      await app.telemetry.expectPrimarySurfacesReachable(`${viewport} telemetry`);
    });
  });
}
