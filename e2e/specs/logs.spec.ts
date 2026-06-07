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
