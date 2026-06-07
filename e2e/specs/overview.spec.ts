import { test } from "../support/test";

test("overview workspace shows live demo vehicle state", async ({ app }) => {
  await test.step("Connect an airplane demo session", async () => {
    await app.openAndConnectDemo("airplane");
  });

  await test.step("Verify the overview map, readiness, and summary metrics are live", async () => {
    await app.overview.expectLive();
  });
});
