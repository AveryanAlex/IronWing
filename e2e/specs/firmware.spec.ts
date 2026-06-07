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
