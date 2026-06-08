import { test } from "../support/test";

test("HUD workspace renders live flight instruments", async ({ app }) => {
  await test.step("Disable SVS before opening HUD", async () => {
    await app.open("/");
    await app.navigateTo("settings");
    await app.settings.disableSyntheticVisionPreference();
  });

  await test.step("Connect a quadcopter demo session and open HUD", async () => {
    await app.navigateTo("overview");
    await app.connectDemo("quadcopter");
    await app.navigateTo("hud");
  });

  await test.step("Verify the HUD instrument panel renders mode, GPS, safety, and altitude instruments", async () => {
    await app.hud.expectLiveHud();
  });
});
