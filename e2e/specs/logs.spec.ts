import { applyDemoViewport, constrainedLayoutViewports, demoViewports, expectWorkspaceUsable } from "../support/layout";
import { test } from "../support/test";

test("logs workspace exposes empty library and idle replay surfaces", async ({ app }) => {
  await test.step("Connect a demo vehicle and open Logs", async () => {
    await app.openAndConnectDemo("quadcopter");
    await app.navigateTo("logs");
  });

  await test.step("Verify the log library is empty and replay/recording surfaces are idle", async () => {
    await app.logs.expectEmptyAndIdle();
  });
});

for (const viewport of constrainedLayoutViewports) {
  test(`logs layout stays usable on ${viewport}`, async ({ app, page }) => {
    await test.step(`Open Logs at the ${viewport} viewport`, async () => {
      await applyDemoViewport(page, viewport);
      await app.openAndConnectDemo("quadcopter");
      await app.navigateTo("logs");
      await app.shell.expectTier(demoViewports[viewport].expectedTier);
      await app.logs.expectEmptyAndIdle();
    });

    await test.step("Verify logs panels fit and remain reachable", async () => {
      await expectWorkspaceUsable(page, `${viewport} logs`);
      await app.logs.expectPrimarySurfacesReachable(`${viewport} logs`);
    });
  });
}
