import { expect, type Locator, type Page } from "@playwright/test";
import type {
  MockCommandBehavior,
  MockGuidedStateValue,
  MockLiveVehicleState,
  MockMissionState,
} from "../../src/platform/mock/backend";
import {
  DEFAULT_TERRARIUM_TILE_PNG,
  TERRARIUM_TILE_CONTENT_TYPE,
} from "../fixtures/terrain-tile";
import { MISSION_EDITOR_FIXTURE } from "../fixtures/mission-editor-fixture";

export type MissionViewportPresetName = "desktop" | "radiomaster" | "phone";

type MissionViewportPreset = {
  width: number;
  height: number;
  isMobile: boolean;
};

type MissionFlowMockPlatform = {
  reset: () => Promise<void>;
  setCommandBehavior: (cmd: string, behavior: MockCommandBehavior) => Promise<void>;
  resolveDeferredConnectLink: (params: {
    vehicleState: MockLiveVehicleState;
    missionState?: MockMissionState;
    guidedState: MockGuidedStateValue;
  }) => Promise<boolean>;
  getLiveEnvelope: () => Promise<unknown>;
};

type MissionPathFeature = {
  properties?: {
    kind?: string;
  };
};

type MissionPathDebugState = {
  missionPathGeoJson: {
    type: string;
    features: MissionPathFeature[];
  };
  missionPathFeatureKinds: Record<string, number>;
  missionPathUpdateCount: number;
} | null;

type SurveyDebugState = {
  polygonGeoJson: {
    type: string;
    features: Array<{ geometry?: { type?: string } }>;
  };
  transectsGeoJson: {
    type: string;
    features: Array<{ properties?: { kind?: string } }>;
  };
  coverageGeoJson: {
    type: string;
    features: Array<{ properties?: { crosshatch?: boolean; laneSpacing_m?: number } }>;
  };
  surveyUpdateCount: number;
} | null;

const MOCK_MAP_STYLE = {
  version: 8,
  name: "IronWing Mission E2E",
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {},
  layers: [
    {
      id: "background",
      type: "background",
      paint: {
        "background-color": "#0f172a",
      },
    },
  ],
} as const;

const CONNECTED_VEHICLE_STATE: MockLiveVehicleState = {
  armed: false,
  custom_mode: 3,
  mode_name: "AUTO",
  system_status: "ACTIVE",
  vehicle_type: "copter",
  autopilot: "ardupilot",
  system_id: 1,
  component_id: 1,
  heartbeat_received: true,
};

const CONNECTED_GUIDED_STATE: MockGuidedStateValue = {
  status: "blocked",
  session: null,
  entered_at_unix_msec: null,
  blocking_reason: "vehicle_disarmed",
  termination: null,
  last_command: null,
  actions: {
    start: { allowed: false, blocking_reason: "vehicle_disarmed" },
    update: { allowed: false, blocking_reason: "vehicle_disarmed" },
    stop: { allowed: false, blocking_reason: "live_session_required" },
  },
};

const CONNECTED_MISSION_STATE: MockMissionState = {
  plan: MISSION_EDITOR_FIXTURE.missionDownload.plan,
  current_index: 2,
  sync: "current",
  active_op: null,
};

const MISSION_VIEWPORT_PRESETS: Record<MissionViewportPresetName, MissionViewportPreset> = {
  desktop: { width: 1440, height: 900, isMobile: false },
  radiomaster: { width: 1280, height: 720, isMobile: false },
  phone: { width: 390, height: 844, isMobile: true },
};

function resolveMissionViewportPreset(name: MissionViewportPresetName): MissionViewportPreset {
  const preset = MISSION_VIEWPORT_PRESETS[name];
  if (!preset) {
    throw new Error(`Unsupported mission viewport preset: ${name}`);
  }
  return preset;
}

export async function applyMissionViewport(
  page: Page,
  presetName: MissionViewportPresetName,
): Promise<MissionViewportPreset> {
  const preset = resolveMissionViewportPreset(presetName);
  await page.setViewportSize({ width: preset.width, height: preset.height });

  await expect.poll(() => page.viewportSize()?.width ?? 0).toBe(preset.width);
  await expect.poll(() => page.viewportSize()?.height ?? 0).toBe(preset.height);

  return preset;
}

export async function bootstrapMissionEditor(
  page: Page,
  mockPlatform: MissionFlowMockPlatform,
  presetName: MissionViewportPresetName = "desktop",
): Promise<MissionViewportPreset> {
  const preset = await applyMissionViewport(page, presetName);
  const vehicleSidebar = page.locator("aside").filter({
    has: page.getByRole("heading", { name: "Connection" }),
  });

  await installMissionMapMocks(page);
  await seedMissionPlanningSettings(page);
  await page.goto("/");
  await expect(page).toHaveTitle(/IronWing/);

  await expect.poll(() => page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }))).toEqual({
    width: preset.width,
    height: preset.height,
  });

  await mockPlatform.reset();
  await mockPlatform.setCommandBehavior("connect_link", { type: "defer" });
  await mockPlatform.setCommandBehavior("mission_download", {
    type: "resolve",
    result: MISSION_EDITOR_FIXTURE.missionDownload,
  });

  await page.getByRole("button", { name: "Mission" }).click();
  await expect(page.locator("[data-mission-workspace]")).toBeVisible();

  if (preset.isMobile) {
    await page.getByRole("button", { name: "Vehicle panel" }).click();
    await expect(vehicleSidebar).toBeVisible();
  }

  const transportSelect = page.locator('[data-testid="connection-transport-select"]');
  const tcpAddress = page.locator('[data-testid="connection-tcp-address"]');
  const connectButton = page.locator('[data-testid="connection-connect-btn"]');

  await transportSelect.scrollIntoViewIfNeeded();
  await transportSelect.selectOption("tcp");
  await tcpAddress.scrollIntoViewIfNeeded();
  await tcpAddress.fill("127.0.0.1:5760");
  await connectButton.scrollIntoViewIfNeeded();
  await connectButton.click();

  await expect.poll(() => mockPlatform.getLiveEnvelope()).not.toBeNull();
  await mockPlatform.resolveDeferredConnectLink({
    vehicleState: CONNECTED_VEHICLE_STATE,
    missionState: CONNECTED_MISSION_STATE,
    guidedState: CONNECTED_GUIDED_STATE,
  });

  await expect(page.locator('[data-testid="connection-status-text"]')).toContainText("Connected");

  if (preset.isMobile) {
    await vehicleSidebar.getByRole("button").first().click();
    await expect(vehicleSidebar).toHaveClass(/-translate-x-full/);
  }

  await page.getByRole("button", { name: "Read" }).click();

  await expect(page.locator("[data-mission-waypoint-card]")).toHaveCount(
    MISSION_EDITOR_FIXTURE.missionDownload.plan.items.length,
  );
  await waitForTerrainReady(page);
  await expect(page.locator('[data-testid="mission-stats-state"]')).toContainText("Finite estimate");

  return preset;
}

export async function bootstrapDesktopMissionEditor(
  page: Page,
  mockPlatform: MissionFlowMockPlatform,
): Promise<void> {
  await bootstrapMissionEditor(page, mockPlatform, "desktop");
}

export async function installMissionMapMocks(page: Page): Promise<void> {
  await page.route(/https:\/\/tiles\.openfreemap\.org\/styles\/bright.*/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_MAP_STYLE),
    });
  });

  await page.route(/https:\/\/s3\.amazonaws\.com\/elevation-tiles-prod\/terrarium\/.+\.png/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: TERRARIUM_TILE_CONTENT_TYPE,
      body: DEFAULT_TERRARIUM_TILE_PNG,
    });
  });
}

export async function seedMissionPlanningSettings(page: Page): Promise<void> {
  await page.addInitScript(
    ({ storageKey, settings }) => {
      window.localStorage.setItem(storageKey, JSON.stringify(settings));
    },
    {
      storageKey: "mpng_settings",
      settings: {
        cruiseSpeedMps: MISSION_EDITOR_FIXTURE.planningSpeeds.cruiseSpeedMps,
        hoverSpeedMps: MISSION_EDITOR_FIXTURE.planningSpeeds.hoverSpeedMps,
        terrainSafetyMarginM: 10,
        telemetryRateHz: 5,
        svsEnabled: true,
        messageRates: {},
      },
    },
  );
}

export function missionCard(page: Page, seq: number): Locator {
  return page.locator(`[data-mission-waypoint-card][data-seq="${seq}"]`);
}

export async function hoverHistoryButton(page: Page, testId: "mission-undo" | "mission-redo"): Promise<Locator> {
  const button = page.locator(`[data-testid="${testId}"]`);
  await button.hover();
  return button;
}

export async function expectHistoryTooltip(
  page: Page,
  testId: "mission-undo" | "mission-redo",
  text: string,
): Promise<void> {
  const button = await hoverHistoryButton(page, testId);
  await expect(button).toHaveAttribute("aria-label", text);
}

export async function openMissionMobileDrawer(page: Page): Promise<void> {
  const toggle = page.locator("[data-mission-mobile-panel-toggle]");
  const drawer = page.locator("[data-mission-mobile-drawer]");

  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(drawer).toHaveAttribute("data-state", "open");
}

export async function closeMissionMobileDrawer(page: Page): Promise<void> {
  const toggle = page.locator("[data-mission-mobile-panel-toggle]");
  const drawer = page.locator("[data-mission-mobile-drawer]");
  const closeButton = page.locator("[data-mission-mobile-drawer-close]");

  await expect(drawer).toHaveAttribute("data-state", "open");
  await closeButton.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(drawer).toHaveAttribute("data-state", "closed");
}

export async function expectMissionDrawerClosed(page: Page): Promise<void> {
  await expect(page.locator("[data-mission-mobile-panel-toggle]")).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("[data-mission-mobile-drawer]")).toHaveAttribute("data-state", "closed");
}

export async function expectMissionDrawerOpen(page: Page): Promise<void> {
  await expect(page.locator("[data-mission-mobile-panel-toggle]")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("[data-mission-mobile-drawer]")).toHaveAttribute("data-state", "open");
}

export async function expectMissionDesktopShellVisible(page: Page): Promise<void> {
  await expect(page.locator("[data-mission-side-panel]")).toBeVisible();
  await expect(page.locator("[data-mission-mobile-panel-toggle]")).toHaveCount(0);
}

export async function clickMapAtRatio(
  page: Page,
  xRatio: number,
  yRatio: number,
): Promise<void> {
  const box = await page.locator("[data-mission-map-region]").boundingBox();
  if (!box) {
    throw new Error("Mission map region is not visible.");
  }

  await page.mouse.click(box.x + box.width * xRatio, box.y + box.height * yRatio);
}

export async function drawPentagonOnMissionMap(page: Page): Promise<void> {
  const pentagonPoints: Array<[number, number]> = [
    [0.32, 0.24],
    [0.56, 0.18],
    [0.72, 0.34],
    [0.62, 0.60],
    [0.34, 0.64],
  ];

  for (const [xRatio, yRatio] of pentagonPoints) {
    await clickMapAtRatio(page, xRatio, yRatio);
  }
}

export async function waitForTerrainReady(page: Page): Promise<void> {
  await expect(page.locator('[data-mission-terrain-profile][data-status="ready"]')).toBeVisible();
}

export async function getMissionPathDebugState(page: Page): Promise<MissionPathDebugState> {
  return page.evaluate(() => {
    return (window as Window & { __IRONWING_MISSION_DEBUG__?: MissionPathDebugState }).__IRONWING_MISSION_DEBUG__ ?? null;
  });
}

export async function waitForMissionPathDebugState(page: Page): Promise<NonNullable<MissionPathDebugState>> {
  await expect.poll(async () => {
    const debugState = await getMissionPathDebugState(page);
    return debugState?.missionPathUpdateCount ?? 0;
  }).toBeGreaterThan(0);

  const debugState = await getMissionPathDebugState(page);
  if (!debugState) {
    throw new Error("Mission-path debug state was not published.");
  }

  return debugState;
}

export async function getSurveyDebugState(page: Page): Promise<SurveyDebugState> {
  return page.evaluate(() => {
    return (window as Window & { __IRONWING_SURVEY_DEBUG__?: SurveyDebugState }).__IRONWING_SURVEY_DEBUG__ ?? null;
  });
}

export async function waitForSurveyDebugState(page: Page): Promise<NonNullable<SurveyDebugState>> {
  await expect.poll(async () => {
    const debugState = await getSurveyDebugState(page);
    return debugState?.surveyUpdateCount ?? 0;
  }).toBeGreaterThan(0);

  const debugState = await getSurveyDebugState(page);
  if (!debugState) {
    throw new Error("Survey debug state was not published.");
  }

  return debugState;
}
