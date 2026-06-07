import { allLayoutViewports, applyDemoViewport, demoViewports, expectWorkspaceUsable, type DemoViewportName } from "../support/layout";
import { test } from "../support/test";

test("overview workspace shows live demo vehicle state", async ({ app }) => {
  await test.step("Connect an airplane demo session", async () => {
    await app.openAndConnectDemo("airplane");
  });

  await test.step("Verify the overview map, readiness, and summary metrics are live", async () => {
    await app.overview.expectLive();
  });
});

for (const viewport of allLayoutViewports) {
  test(`overview layout fits ${viewport}`, async ({ app, page }) => {
    await test.step(`Open a connected overview at the ${viewport} viewport`, async () => {
      await applyDemoViewport(page, viewport);
      await app.openAndConnectDemo("quadcopter");
      await app.shell.expectTier(demoViewports[viewport].expectedTier);
      await app.overview.expectLive();
    });

    await test.step("Assert the shell surface stays within the viewport without horizontal overflow", async () => {
      await expectWorkspaceUsable(page, `${viewport} overview`);
      await app.overview.expectPrimarySurfacesReachable(`${viewport} overview`);
    });
  });
}
