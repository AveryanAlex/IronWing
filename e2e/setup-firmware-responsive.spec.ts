import type { Page } from "@playwright/test";

import { firmwareWorkspaceTestIds } from "../src/components/firmware/firmware-workspace-test-ids";
import { setupWorkspaceTestIds } from "../src/components/setup/setup-workspace-test-ids";
import {
  applyShellViewport,
  closeVehiclePanelDrawer,
  expect,
  expectShellChrome,
  openVehiclePanelDrawer,
  test,
  type MockPlatformFixture,
  type ShellViewportPresetName,
} from "./fixtures/mock-platform";
import { openFirmwareWorkspace } from "./helpers/firmware-workspace";
import {
  connectSetupSession,
  createFullExpertSetupParamStore,
  createSetupCalibrationDomain,
  createSetupConfigurationFactsDomain,
  createSetupStatusTextDomain,
  createSetupSupportDomain,
  createSetupTelemetryDomain,
  openConnectedSetupWorkspace,
  openSetupSectionDrawer,
  primeSetupMetadata,
  setupConnectedVehicleState,
} from "./helpers/setup-workspace";

type TierPreset = Extract<ShellViewportPresetName, "desktop" | "radiomaster" | "phone">;

const tierPresets: readonly TierPreset[] = ["desktop", "radiomaster", "phone"];

const expectedFirmwareLayoutMode: Record<TierPreset, string> = {
  desktop: "desktop-wide",
  radiomaster: "browse-radiomaster",
  phone: "browse-phone",
};

test.describe("assembled runtime cross-tier proof", () => {
  test.beforeEach(async ({ page }) => {
    await primeSetupMetadata(page);
  });

  for (const preset of tierPresets) {
    test(`${preset} tier journey`, async ({ page, mockPlatform }) => {
      await runAssembledJourney(page, mockPlatform, preset);
    });
  }
});

async function runAssembledJourney(
  page: Page,
  mockPlatform: MockPlatformFixture,
  preset: TierPreset,
): Promise<void> {
  await applyShellViewport(page, preset);
  await page.goto("/");
  await mockPlatform.reset();
  await mockPlatform.waitForRuntimeSurface();

  await expectShellChrome(page, preset);

  // Phone tier hides the connection surface inside the vehicle-panel
  // drawer; it must be opened before `connectSetupSession` can click the
  // connect button. Desktop/radiomaster keep the panel docked inline.
  if (preset === "phone") {
    await openVehiclePanelDrawer(page);
  }

  // The same full-expert seed runs at every tier so the runtime state is
  // invariant — only the viewport is different. This keeps the journey
  // faithful to "the same assembled system" across presets.
  await connectSetupSession(page, mockPlatform, {
    vehicleState: setupConnectedVehicleState,
    paramStore: createFullExpertSetupParamStore(),
    telemetry: createSetupTelemetryDomain({
      rc_channels: [1100, 1500, 1900, 1300, 1450],
      rc_rssi: 84,
    }),
    support: createSetupSupportDomain({
      can_calibrate_accel: true,
      can_calibrate_compass: true,
      can_calibrate_radio: true,
      can_request_prearm_checks: true,
    }),
    configurationFacts: createSetupConfigurationFactsDomain({
      frame: { configured: true },
      gps: { configured: true },
      battery_monitor: { configured: true },
      motors_esc: { configured: true },
    }),
    calibration: createSetupCalibrationDomain({
      accel: { lifecycle: "complete", progress: null, report: null },
      compass: { lifecycle: "complete", progress: null, report: null },
      radio: { lifecycle: "complete", progress: null, report: null },
    }),
    statusText: createSetupStatusTextDomain([]),
  });

  // Close the vehicle-panel drawer on phone so the app shell header tabs
  // (Setup, Firmware, ...) are reachable without a stale overlay blocking
  // pointer events.
  if (preset === "phone") {
    await closeVehiclePanelDrawer(page);
  }

  await openConnectedSetupWorkspace(page);

  // Reach the beginner wizard through the tier-appropriate nav surface.
  // Phone hides the inline rail behind a drawer toggle introduced in
  // S06-T01; desktop/radiomaster keep the rail inline.
  await selectSetupSectionForTier(page, "beginner_wizard", preset);
  await expect(page.getByTestId(setupWorkspaceTestIds.beginnerWizardSection)).toBeVisible();

  // Wizard auto-start (S06-T02) drives the shell into its active phase on
  // first entry without any manual start click. The step frame only renders
  // while the wizard store is in `active`.
  await expect(page.getByTestId(setupWorkspaceTestIds.wizardStepFrame)).toBeVisible();

  // Navigate back to overview. On phone this means re-opening the drawer;
  // on desktop/radiomaster the inline rail is already visible.
  await selectSetupSectionForTier(page, "overview", preset);
  await expect(page.getByTestId(setupWorkspaceTestIds.overviewSection)).toBeVisible();

  // The wizard pauses into `paused_detour` on nav-away, which maps to the
  // `in_progress` section status. The status badge lives inside the nav, so
  // the phone tier needs the drawer re-opened to read it.
  if (preset === "phone") {
    await openSetupSectionDrawer(page);
  }
  await expect(
    page.getByTestId(`${setupWorkspaceTestIds.sectionStatusPrefix}-beginner_wizard`),
  ).toContainText(/in progress/i);
  if (preset === "phone") {
    await page
      .getByTestId(setupWorkspaceTestIds.sectionDrawerClose)
      .click();
    await expect(page.getByTestId(setupWorkspaceTestIds.sectionDrawer)).toHaveCount(0);
  }

  // Cross-workspace navigation: the firmware tab lives in the app shell
  // header, which stays reachable at every tier.
  await openFirmwareWorkspace(page);

  // T03 audit recommendation: pin the firmware layout mode to the active
  // tier so regressions that silently re-enable flashing on constrained
  // shells fail loudly here.
  await expect(page.getByTestId(firmwareWorkspaceTestIds.layoutMode)).toContainText(
    expectedFirmwareLayoutMode[preset],
  );

  // Catalog browsing stays visible at every tier. The search input is
  // rendered while no target has been confirmed, which is the state on
  // first entry to the workspace.
  await expect(page.getByTestId(firmwareWorkspaceTestIds.manualTargetSearch)).toBeVisible();

  // Flashing boundary: only the desktop-wide layout keeps the start button
  // enabled-capable; constrained tiers surface explicit blocked copy and
  // disable the action regardless of target selection.
  if (preset === "desktop") {
    await expect(page.getByTestId(firmwareWorkspaceTestIds.blockedCopy)).toHaveCount(0);
    await expect(page.getByTestId(firmwareWorkspaceTestIds.startSerial)).toBeVisible();
  } else {
    await expect(page.getByTestId(firmwareWorkspaceTestIds.blockedCopy)).toBeVisible();
    await expect(page.getByTestId(firmwareWorkspaceTestIds.blockedReason)).toContainText(
      preset === "radiomaster" ? /constrained/i : /phone/i,
    );
    await expect(page.getByTestId(firmwareWorkspaceTestIds.startSerial)).toBeDisabled();
  }

  // Install ↔ recovery mode switch must keep working at every tier — the
  // mode buttons toggle view state even when flashing itself is blocked.
  await page.getByTestId(firmwareWorkspaceTestIds.modeRecovery).click();
  await expect(page.getByTestId(firmwareWorkspaceTestIds.modeRecovery)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByTestId(firmwareWorkspaceTestIds.recoveryPanel)).toBeVisible();

  await page.getByTestId(firmwareWorkspaceTestIds.modeInstall).click();
  await expect(page.getByTestId(firmwareWorkspaceTestIds.modeInstall)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByTestId(firmwareWorkspaceTestIds.serialPanel)).toBeVisible();
}

async function selectSetupSectionForTier(
  page: Page,
  sectionId: string,
  preset: TierPreset,
): Promise<void> {
  if (preset === "phone") {
    await openSetupSectionDrawer(page);
    await page
      .getByTestId(`${setupWorkspaceTestIds.navPrefix}-${sectionId}`)
      .click();
    // The drawer auto-closes on section select (see `selectSectionFromDrawer`
    // in SetupWorkspace.svelte), so asserting it is gone prevents a stale
    // overlay from hiding subsequent interactions.
    await expect(page.getByTestId(setupWorkspaceTestIds.sectionDrawer)).toHaveCount(0);
    return;
  }

  await page
    .getByTestId(`${setupWorkspaceTestIds.navPrefix}-${sectionId}`)
    .click();
}
