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
