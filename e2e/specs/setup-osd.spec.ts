import { expect, test } from "../support/test";

test("setup OSD opens the layout builder and validates responsive controls", async ({ app }) => {
  test.slow();

  await test.step("Connect a QuadPlane demo session and download vehicle parameters", async () => {
    await app.setup.installOsdDemoParamFixture();
    await app.openAndConnectDemo("quadplane");
    await app.navigateTo("setup");
    await app.setup.ensureParametersDownloaded();
  });

  await test.step("Open Setup > OSD and validate the editor state", async () => {
    const state = await app.setup.expectOsdEditorState();
    expect(state.hasBuilder).toBe(true);
  });

  await test.step("Exercise OSD placement staging when real OSD items are available", async () => {
    const exercised = await app.setup.exerciseOsdPlacementIfAvailable();
    expect(exercised).toBe(true);
  });
});
