import { test } from "../support/test";

test("setup OSD stages only real backend configuration and reports unavailable layout parameters", async ({ app }) => {
  test.slow();

  await test.step("Connect a QuadPlane demo session and download vehicle parameters", async () => {
    await app.openAndConnectDemo("quadplane");
    await app.navigateTo("setup");
    await app.setup.ensureParametersDownloaded();
  });

  await test.step("Show the disabled OSD backend and unavailable layout editor", async () => {
    await app.setup.expectDisabledOsdWithoutLayoutParameters();
  });

  await test.step("Stage the explicit analog backend transaction", async () => {
    await app.setup.stageAnalogOsdSetup();
  });

  await test.step("Keep a digital transaction disabled until its UART is selected", async () => {
    await app.setup.expectDigitalOsdRequiresUart();
  });
});
