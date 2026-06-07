import { applyDemoViewport, constrainedLayoutViewports, demoViewports, expectWorkspaceUsable } from "../support/layout";
import { test } from "../support/test";

test("settings workspace updates runtime and display preferences", async ({ app }) => {
  await test.step("Connect a demo vehicle and open App settings", async () => {
    await app.openAndConnectDemo("quadcopter");
    await app.navigateTo("settings");
  });

  await test.step("Verify runtime telemetry and local display settings are available", async () => {
    await app.settings.expectOpen();
  });

  await test.step("Change the live telemetry update rate from the Settings slider", async () => {
    await app.settings.changeTelemetryRateWithKeyboard();
  });

  await test.step("Toggle the local Synthetic Vision preference and verify it is persisted", async () => {
    await app.settings.toggleSyntheticVisionPreference();
  });
});

for (const viewport of constrainedLayoutViewports) {
  test(`settings layout keeps controls reachable on ${viewport}`, async ({ app, page }) => {
    await test.step(`Open Settings at the ${viewport} viewport`, async () => {
      await applyDemoViewport(page, viewport);
      await app.openAndConnectDemo("quadcopter");
      await app.navigateTo("settings");
      await app.shell.expectTier(demoViewports[viewport].expectedTier);
      await app.settings.expectOpen();
    });

    await test.step("Verify settings controls fit and remain reachable", async () => {
      await expectWorkspaceUsable(page, `${viewport} settings`);
      await app.settings.expectPrimaryControlsReachable(`${viewport} settings`);
    });
  });
}
