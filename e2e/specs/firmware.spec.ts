import { applyDemoViewport, constrainedLayoutViewports, demoViewports, expectWorkspaceUsable } from "../support/layout";
import { test } from "../support/test";

test("firmware workspace shows capability-limited install UI without hardware mocks", async ({ app }) => {
  await test.step("Connect a demo vehicle and open Firmware", async () => {
    await app.openAndConnectDemo("quadcopter");
    await app.navigateTo("firmware");
  });

  await test.step("Verify install controls are visible but safely blocked without hardware access", async () => {
    await app.firmware.expectInstallSurfaceSane();
    await app.firmware.expectCapabilityBannerIfLayoutBlocksActions();
  });

  await test.step("Switch to bootloader recovery and verify it is safely blocked without DFU hardware", async () => {
    await app.firmware.switchToRecoveryModeAndExpectBlocked();
  });
});

for (const viewport of constrainedLayoutViewports) {
  test(`firmware layout keeps install controls reachable on ${viewport}`, async ({ app, page }) => {
    await test.step(`Open Firmware at the ${viewport} viewport`, async () => {
      await applyDemoViewport(page, viewport);
      await app.openAndConnectDemo("quadcopter");
      await app.navigateTo("firmware");
      await app.shell.expectTier(demoViewports[viewport].expectedTier);
      await app.firmware.expectInstallSurfaceSane();
    });

    await test.step("Verify firmware controls fit and remain reachable", async () => {
      await expectWorkspaceUsable(page, `${viewport} firmware`);
      await app.firmware.expectPrimaryActionsReachable(`${viewport} firmware`);
    });
  });
}
