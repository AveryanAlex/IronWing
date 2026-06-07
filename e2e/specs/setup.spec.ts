import { applyDemoViewport, constrainedLayoutViewports, demoViewports, expectWorkspaceUsable } from "../support/layout";
import { test } from "../support/test";
import { safeParameterEditCandidates, setupSections } from "../support/data/setup";

test("setup workspace opens every section and persists a safe parameter edit", async ({ app }) => {
  test.slow();

  await test.step("Connect a QuadPlane demo session and download vehicle parameters", async () => {
    await app.openAndConnectDemo("quadplane");
    await app.navigateTo("setup");
    await app.setup.ensureParametersDownloaded();
  });

  await test.step("Open every setup section from the setup navigation", async () => {
    await app.setup.expectSectionsOpen(setupSections);
  });

  let guidedEdit: Awaited<ReturnType<typeof app.setup.stageRtlReturnAltitudeEdit>>;
  await test.step("Stage a guided RTL altitude edit from the RTL / Return setup section", async () => {
    guidedEdit = await app.setup.stageRtlReturnAltitudeEdit();
    await app.setup.expectReviewContains([guidedEdit.name]);
  });

  let edit: Awaited<ReturnType<typeof app.setup.stageFirstAvailableSafeParameterEdit>>;
  await test.step("Stage one safe numeric parameter edit through Full Parameters", async () => {
    edit = await app.setup.stageFirstAvailableSafeParameterEdit(safeParameterEditCandidates.filter((candidate) => candidate !== guidedEdit.name));
    await app.setup.expectReviewContains([guidedEdit.name, edit.name]);
  });

  await test.step("Apply staged parameters to the demo vehicle", async () => {
    await app.setup.applyStagedParameters([guidedEdit.name, edit.name]);
  });

  await test.step("Reload parameters from the vehicle and verify the edit persisted", async () => {
    await app.setup.reloadParametersFromVehicle();
    await app.setup.expectParameterValue(guidedEdit.name, guidedEdit.next);
    await app.setup.expectParameterValue(edit.name, edit.next);
  });
});

for (const viewport of constrainedLayoutViewports) {
  test(`setup layout keeps primary actions reachable on ${viewport}`, async ({ app, page }) => {
    await test.step(`Open Setup with downloaded demo parameters at the ${viewport} viewport`, async () => {
      await applyDemoViewport(page, viewport);
      await app.openAndConnectDemo("quadplane");
      await app.navigateTo("setup");
      await app.shell.expectTier(demoViewports[viewport].expectedTier);
      await app.setup.ensureParametersDownloaded();
    });

    await test.step("Verify setup overview controls fit and remain reachable", async () => {
      await expectWorkspaceUsable(page, `${viewport} setup`);
      await app.setup.expectPrimaryActionsReachable(`${viewport} setup`);
    });
  });
}
