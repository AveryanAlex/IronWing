import { applyDemoViewport, constrainedLayoutViewports, demoViewports, expectWorkspaceUsable } from "../support/layout";
import { test } from "../support/test";

test("HUD workspace renders live flight instruments", async ({ app }) => {
  await test.step("Connect a quadcopter demo session and open HUD", async () => {
    await app.openAndConnectDemo("quadcopter");
    await app.navigateTo("hud");
  });

  await test.step("Verify the HUD instrument panel renders mode, GPS, safety, and altitude instruments", async () => {
    await app.hud.expectLiveHud();
  });
});

for (const viewport of constrainedLayoutViewports) {
  test(`HUD layout stays usable on ${viewport}`, async ({ app, page }) => {
    await test.step(`Open live HUD at the ${viewport} viewport`, async () => {
      await applyDemoViewport(page, viewport);
      await app.openAndConnectDemo("quadcopter");
      await app.navigateTo("hud");
      await app.shell.expectTier(demoViewports[viewport].expectedTier);
      await app.hud.expectLiveHud();
    });

    await test.step("Verify HUD instruments fit and remain reachable", async () => {
      await expectWorkspaceUsable(page, `${viewport} HUD`);
      await app.hud.expectPrimarySurfacesReachable(`${viewport} HUD`);
    });
  });
}
