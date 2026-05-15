import type { Page } from "@playwright/test";

import { firmwareWorkspaceTestIds } from "../src/components/firmware/firmware-workspace-test-ids";
import { missionWorkspaceTestIds } from "../src/components/mission/mission-workspace-test-ids";
import { setupWorkspaceTestIds } from "../src/components/setup/setup-workspace-test-ids";
import {
  closeVehiclePanelDrawer,
  expect,
  mockTerrainNoData,
  openVehiclePanelDrawer,
  test,
  type MockPlatformFixture,
} from "./fixtures/mock-platform";
import {
  collectLayoutFitViolations,
  formatLayoutFitViolations,
  type LayoutFitViolation,
} from "./helpers/layout-fit";
import {
  connectSetupSession,
  createFullExpertSetupParamStore,
  createSetupCalibrationDomain,
  createSetupConfigurationFactsDomain,
  createSetupStatusTextDomain,
  createSetupSupportDomain,
  createSetupTelemetryDomain,
  primeSetupMetadata,
  setupConnectedVehicleState,
} from "./helpers/setup-workspace";

const layoutViewports = [
  { name: "phone-small", width: 360, height: 740 },
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "small-desktop", width: 1024, height: 768 },
  { name: "radiomaster", width: 1280, height: 720 },
  { name: "desktop", width: 1440, height: 900 },
  { name: "wide", width: 1920, height: 1080 },
] as const;

type WorkspaceTarget = {
  key: "overview" | "telemetry" | "hud" | "mission" | "logs" | "firmware" | "setup" | "settings";
  label: string;
  rootTestId?: string;
};

const workspaces = [
  { key: "overview", label: "Overview", rootTestId: "app-shell-operator-workspace" },
  { key: "telemetry", label: "Telemetry" },
  { key: "hud", label: "HUD" },
  { key: "mission", label: "Mission", rootTestId: missionWorkspaceTestIds.root },
  { key: "logs", label: "Logs", rootTestId: "logs-workspace-root" },
  { key: "firmware", label: "Firmware", rootTestId: firmwareWorkspaceTestIds.root },
  { key: "setup", label: "Setup", rootTestId: setupWorkspaceTestIds.root },
  { key: "settings", label: "App settings" },
] as const satisfies readonly WorkspaceTarget[];

const maxReportedViolations = 120;

function findingKey(violation: LayoutFitViolation): string {
  return [
    violation.kind,
    violation.selector,
    violation.containerSelector ?? "",
    violation.text,
    JSON.stringify(violation.metrics),
  ].join("|");
}

function appendUniqueFindings(
  findings: LayoutFitViolation[],
  seen: Set<string>,
  nextFindings: readonly LayoutFitViolation[],
) {
  for (const finding of nextFindings) {
    const key = findingKey(finding);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    findings.push(finding);
  }
}

async function describePointerHitTarget(
  page: Page,
  button: ReturnType<Page["getByRole"]>,
): Promise<{ targetContainsTop: boolean; topSelector: string; topText: string; x: number; y: number }> {
  const box = await button.boundingBox();
  const x = box ? box.x + box.width / 2 : 0;
  const y = box ? box.y + box.height / 2 : 0;

  return button.evaluate((element, point) => {
    const top = document.elementFromPoint(point.x, point.y);

    function quoteAttribute(value: string): string {
      return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
    }

    function selectorFor(target: Element | null): string {
      if (!target) {
        return "none";
      }

      const testId = target.getAttribute("data-testid");
      if (testId) {
        return `[data-testid="${quoteAttribute(testId)}"]`;
      }

      const ariaLabel = target.getAttribute("aria-label");
      const tagName = target.localName.toLowerCase();
      if (ariaLabel) {
        return `${tagName}[aria-label="${quoteAttribute(ariaLabel)}"]`;
      }

      return tagName;
    }

    const topText = top instanceof HTMLElement
      ? top.innerText.trim().replace(/\s+/g, " ").slice(0, 120)
      : top?.textContent?.trim().replace(/\s+/g, " ").slice(0, 120) ?? "";

    return {
      targetContainsTop: Boolean(top && (element === top || element.contains(top))),
      topSelector: selectorFor(top),
      topText,
      x: point.x,
      y: point.y,
    };
  }, { x, y });
}

async function openWorkspace(page: Page, workspace: WorkspaceTarget, scope: string): Promise<LayoutFitViolation[]> {
  const findings: LayoutFitViolation[] = [];
  const workspaceButton = page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("button", { name: workspace.label, exact: true });

  await expect(
    workspaceButton,
    `${workspace.label} workspace tab is missing from the primary shell navigation.`,
  ).toBeVisible();
  try {
    await workspaceButton.click({ timeout: 3_000 });
  } catch (error) {
    const box = await workspaceButton.boundingBox();
    const hitTarget = await describePointerHitTarget(page, workspaceButton);

    if (!hitTarget.targetContainsTop) {
      findings.push({
        scope,
        kind: "element-obstructed",
        selector: `primary nav button ${JSON.stringify(workspace.label)}`,
        text: [
          `Primary nav tab could not receive a pointer click: ${String(error).split("\n")[0]}`,
          `hit=${hitTarget.topSelector}`,
          hitTarget.topText ? `hitText=${JSON.stringify(hitTarget.topText)}` : "",
        ].filter(Boolean).join("; "),
        metrics: {
          height: box?.height ?? 0,
          hitX: hitTarget.x,
          hitY: hitTarget.y,
          timeoutMs: 3_000,
          width: box?.width ?? 0,
          x: box?.x ?? 0,
          y: box?.y ?? 0,
        },
      });
    }

    await workspaceButton.evaluate((element) => (element as HTMLElement).click());
  }

  await expect(
    page.getByTestId("app-shell-active-workspace"),
    `${workspace.label} workspace did not become active before the layout-fit scan started.`,
  ).toContainText(workspace.key);

  if (workspace.rootTestId) {
    await expect(
      page.getByTestId(workspace.rootTestId),
      `${workspace.label} workspace root did not mount before the layout-fit scan started.`,
    ).toBeVisible();
  }

  return findings;
}

async function connectRepresentativeVehicle(page: Page, mockPlatform: MockPlatformFixture): Promise<void> {
  await connectSetupSession(page, mockPlatform, {
    vehicleState: setupConnectedVehicleState,
    paramStore: createFullExpertSetupParamStore({
      SIMPLE: 0b000001,
      SUPER_SIMPLE: 0b001000,
    }),
    telemetry: createSetupTelemetryDomain({
      rc_channels: [1100, 1500, 1900, 1300, 1450],
      rc_rssi: 84,
    }, {
      value: {
        flight: {
          altitude_m: -0,
          speed_mps: 0,
          climb_rate_mps: 0,
          throttle_pct: 0,
        },
        gps: {
          fix_type: "fix_3d",
          satellites: 14,
          hdop: 0.7,
        },
        navigation: {
          heading_deg: 182.1,
          latitude_deg: 47.397742,
          longitude_deg: 8.545594,
          target_bearing_deg: 180,
          wp_dist_m: 128,
        },
        attitude: {
          pitch_deg: 2.5,
          roll_deg: -4.1,
        },
        power: {
          battery_voltage_v: 16.1,
          battery_current_a: 0,
          battery_pct: 100,
          battery_voltage_cells: [4.02, 4.03, 4.02, 4.03],
        },
        terrain: {
          height_above_terrain_m: 30,
          terrain_height_m: 457,
        },
      },
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
}

async function collectFindingsForScope(page: Page, scope: string): Promise<LayoutFitViolation[]> {
  return collectLayoutFitViolations(page, scope, {
    maxViolations: 40,
  });
}

test.describe("layout fit guard", () => {
  for (const viewport of layoutViewports) {
    test(`${viewport.name} keeps connected shell and every workspace horizontally fitted`, async ({
      page,
      mockPlatform,
    }) => {
      const findings: LayoutFitViolation[] = [];
      const seenFindings = new Set<string>();
      const phoneTier = viewport.width < 768;

      await primeSetupMetadata(page);
      await mockTerrainNoData(page);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/");
      await mockPlatform.reset();
      await mockPlatform.waitForRuntimeSurface();

      if (phoneTier) {
        await openVehiclePanelDrawer(page);
      }

      await connectRepresentativeVehicle(page, mockPlatform);

      appendUniqueFindings(
        findings,
        seenFindings,
        await test.step("scan connected vehicle panel", () =>
          collectFindingsForScope(page, `${viewport.name} / connected vehicle panel`)),
      );

      if (phoneTier) {
        await closeVehiclePanelDrawer(page);
      }

      for (const workspace of workspaces) {
        await test.step(`scan ${workspace.label}`, async () => {
          const scope = `${viewport.name} / ${workspace.label}`;
          appendUniqueFindings(
            findings,
            seenFindings,
            await openWorkspace(page, workspace, scope),
          );
          appendUniqueFindings(
            findings,
            seenFindings,
            await collectFindingsForScope(page, scope),
          );
        });
      }

      const formattedFindings = formatLayoutFitViolations(findings);
      const reportedFindings = formattedFindings.length > maxReportedViolations
        ? [
          ...formattedFindings.slice(0, maxReportedViolations),
          `... ${formattedFindings.length - maxReportedViolations} more layout-fit violations omitted`,
        ]
        : formattedFindings;

      expect(reportedFindings).toEqual([]);
    });
  }
});
