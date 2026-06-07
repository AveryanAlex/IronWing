import { test } from "../support/test";

test("web bundle boots and connects to the MAVKit demo vehicle", async ({ app }) => {
  await test.step("Boot the web bundle and connect the quadcopter demo vehicle", async () => {
    await app.openAndConnectDemo("quadcopter");
  });

  await test.step("Verify the shell reaches a live overview state", async () => {
    await app.overview.expectLive();
  });
});
