import { applyDemoViewport, constrainedLayoutViewports, demoViewports, expectWorkspaceUsable } from "../support/layout";
import { test } from "../support/test";
import { mixedDemoMissionPlan } from "../support/data/mission";

test("mission workspace authors, uploads, and reads back a mixed mission", async ({ app }) => {
  test.slow();

  await test.step("Connect a demo copter and open the mission workspace", async () => {
    await app.openAndConnectDemo("quadcopter");
    await app.navigateTo("mission");
    await app.mission.expectOpen();
  });

  await test.step(`Start from an empty draft for ${mixedDemoMissionPlan.name}`, async () => {
    await app.mission.clearDraft();
    await app.mission.expectDraftEmpty();
  });

  await test.step("Author waypoint, spline, timed loiter, and landing items with distinct coordinates and fields", async () => {
    await app.mission.authorItems(mixedDemoMissionPlan.items);
    await app.mission.expectDraftItemCount(mixedDemoMissionPlan.items.length);
  });

  await test.step("Upload the authored mission, clear local state, then read the vehicle mission back", async () => {
    await app.mission.uploadToVehicle();
    await app.mission.clearDraft();
    await app.mission.expectDraftEmpty();
    await app.mission.readFromVehicle(mixedDemoMissionPlan.items.length);
  });

  await test.step("Verify the downloaded mission matches the authored command types and key values", async () => {
    await app.mission.expectItems(mixedDemoMissionPlan.items);
  });
});

test("mission workspace supports undo, redo, survey, fence, and rally planning tools", async ({ app }) => {
  await test.step("Connect a demo copter and open the mission workspace", async () => {
    await app.openAndConnectDemo("quadcopter");
    await app.navigateTo("mission");
    await app.mission.expectOpen();
  });

  await test.step("Add a waypoint, undo it, redo it, then clear the draft", async () => {
    await app.mission.expectUndoRedoForWaypointAuthoring();
  });

  await test.step("Create draft content with survey, fence, and rally planning tools", async () => {
    await app.mission.expectSurveyFenceAndRallyToolsCreateDraftContent();
  });
});

for (const viewport of constrainedLayoutViewports) {
  test(`mission layout keeps primary actions reachable on ${viewport}`, async ({ app, page }) => {
    await test.step(`Open Mission with a connected demo copter at the ${viewport} viewport`, async () => {
      await applyDemoViewport(page, viewport);
      await app.openAndConnectDemo("quadcopter");
      await app.navigateTo("mission");
      await app.shell.expectTier(demoViewports[viewport].expectedTier);
      await app.mission.expectOpen();
    });

    await test.step("Verify the mission toolbar and planning surfaces fit and remain reachable", async () => {
      await expectWorkspaceUsable(page, `${viewport} mission`);
      await app.mission.expectPrimaryActionsReachable(`${viewport} mission`);
    });
  });
}
