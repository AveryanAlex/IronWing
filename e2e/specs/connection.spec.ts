import { test } from "../support/test";

test("connection panel connects, disconnects, and reconnects demo vehicles", async ({ app }) => {
  await test.step("Open the app and verify the idle connection controls", async () => {
    await app.open();
    await app.connection.expectIdle();
    await app.connection.expectDemoTransportHelp();
    await app.connection.expectDiagnosticsHydrated();
  });

  await test.step("Connect to a QuadCopter demo vehicle", async () => {
    await app.connectDemo("quadcopter");
    await app.connection.expectLiveTelemetry();
  });

  await test.step("Disconnect and verify the connection form returns to idle", async () => {
    await app.connection.disconnectIfConnected();
    await app.connection.expectIdle();
  });

  await test.step("Reconnect with a different demo preset", async () => {
    await app.connectDemo("airplane");
    await app.connection.expectLiveTelemetry();
  });
});

test("connection drawer remains usable on phone", async ({ app }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "The vehicle drawer is phone-only shell chrome");

  await test.step("Open the app", async () => {
    await app.open();
  });

  await test.step("Open and close the vehicle drawer through the shell control", async () => {
    await app.connection.expectPhoneDrawerOpensAndCloses();
  });
});
