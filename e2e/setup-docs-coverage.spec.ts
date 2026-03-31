import { test, expect } from "./fixtures/mock-platform";
import type { Page } from "@playwright/test";
import type {
  MockGuidedStateValue,
  MockLiveVehicleState,
  MockParamProgressState,
  MockParamStoreState,
} from "../src/platform/mock/backend";

const ARDUCOPTER_METADATA_XML = `<?xml version="1.0" encoding="UTF-8"?>
<paramfile>
  <parameters>
    <param name="ArduCopter:FRAME_CLASS" humanName="Frame Class" documentation="Multicopter frame class" />
    <param name="ArduCopter:BATT_MONITOR" humanName="Battery Monitor" documentation="Battery monitor type" />
    <param name="ArduCopter:ARMING_CHECK" humanName="Arming Check" documentation="Pre-arm validation mask" />
    <param name="ArduCopter:SERIAL1_PROTOCOL" humanName="Serial 1 Protocol" documentation="Protocol on SERIAL1" />
    <param name="ArduCopter:SERIAL1_BAUD" humanName="Serial 1 Baud" documentation="Baud rate on SERIAL1" />
    <param name="ArduCopter:SERVO1_FUNCTION" humanName="Servo 1 Function" documentation="Servo output function" />
    <param name="ArduCopter:FLTMODE1" humanName="Flight Mode 1" documentation="Mode for slot 1" />
    <param name="ArduCopter:FLTMODE_CH" humanName="Flight Mode Channel" documentation="RC channel used for mode selection" />
    <param name="ArduCopter:SIMPLE" humanName="Simple Mode" documentation="Simple mode bitmask" />
    <param name="ArduCopter:FS_THR_ENABLE" humanName="Throttle Failsafe" documentation="Throttle failsafe action" />
  </parameters>
</paramfile>`;

const connectedVehicleState: MockLiveVehicleState = {
  armed: false,
  custom_mode: 5,
  mode_name: "LOITER",
  system_status: "STANDBY",
  vehicle_type: "quadrotor",
  autopilot: "ardupilot",
  system_id: 1,
  component_id: 1,
  heartbeat_received: true,
};

const blockedGuidedState: MockGuidedStateValue = {
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

type MockPlatformController = {
  reset: () => Promise<void>;
  setCommandBehavior: (cmd: string, behavior: { type: "defer" }) => Promise<void>;
  resolveDeferredConnectLink: (params: {
    vehicleState: MockLiveVehicleState;
    paramStore?: MockParamStoreState;
    guidedState: MockGuidedStateValue;
  }) => Promise<boolean>;
  emitParamStore: (paramStore: MockParamStoreState) => Promise<void>;
  emitParamProgress: (paramProgress: MockParamProgressState) => Promise<void>;
  getLiveEnvelope: () => Promise<{
    session_id: string;
    source_kind: "live" | "playback";
    seek_epoch: number;
    reset_revision: number;
  } | null>;
};

const setupParamStore: MockParamStoreState = {
  expected_count: 8,
  params: {
    FRAME_CLASS: { name: "FRAME_CLASS", value: 1, param_type: "uint8", index: 0 },
    BATT_MONITOR: { name: "BATT_MONITOR", value: 4, param_type: "uint8", index: 1 },
    ARMING_CHECK: { name: "ARMING_CHECK", value: 1, param_type: "uint16", index: 2 },
    SERIAL1_PROTOCOL: { name: "SERIAL1_PROTOCOL", value: 2, param_type: "int8", index: 3 },
    SERIAL1_BAUD: { name: "SERIAL1_BAUD", value: 115, param_type: "int16", index: 4 },
    SERVO1_FUNCTION: { name: "SERVO1_FUNCTION", value: 33, param_type: "int16", index: 5 },
    FLTMODE1: { name: "FLTMODE1", value: 5, param_type: "uint8", index: 6 },
    FLTMODE_CH: { name: "FLTMODE_CH", value: 5, param_type: "uint8", index: 7 },
  },
};

const SECTION_MARKERS = {
  overview: { label: "Overview", marker: "Quick Actions" },
  serial_ports: { label: "Serial Ports", marker: "Serial Ports" },
  servo_outputs: { label: "Servo Outputs", marker: "Servo Outputs" },
  flight_modes: { label: "Flight Modes", marker: "Flight Modes" },
  full_parameters: { label: "Full Parameters", marker: "Full Parameters" },
  initial_params: { label: "Initial Parameters", marker: "Initial Parameters Calculator" },
  failsafe: { label: "Failsafe", marker: "Failsafe Configuration" },
} as const;

type SectionId = keyof typeof SECTION_MARKERS;

async function seedCopterMetadata(page: Page) {
  await page.addInitScript(({ xml, ts }) => {
    window.localStorage.setItem("param_meta_ArduCopter", xml);
    window.localStorage.setItem("param_meta_ArduCopter_ts", String(ts));
  }, {
    xml: ARDUCOPTER_METADATA_XML,
    ts: Date.now(),
  });
}

async function connectCopterAndOpenSetup(page: Page, mockPlatform: MockPlatformController) {
  await page.goto("/");
  await expect(page).toHaveTitle(/IronWing/);
  await expect(page.locator('[data-testid="connection-status-text"]')).toContainText("Idle");
  await mockPlatform.reset();
  await mockPlatform.setCommandBehavior("connect_link", { type: "defer" });

  await expect.poll(() => page.evaluate(() => ({
    cache: window.localStorage.getItem("param_meta_ArduCopter"),
    ts: window.localStorage.getItem("param_meta_ArduCopter_ts"),
  }))).toMatchObject({
    cache: ARDUCOPTER_METADATA_XML,
    ts: expect.any(String),
  });

  await page.locator('[data-testid="connection-transport-select"]').selectOption("tcp");
  await page.locator('[data-testid="connection-tcp-address"]').fill("127.0.0.1:5760");
  await page.locator('[data-testid="connection-connect-btn"]').click();

  await expect.poll(() => mockPlatform.getLiveEnvelope()).not.toBeNull();

  await mockPlatform.resolveDeferredConnectLink({
    vehicleState: connectedVehicleState,
    guidedState: blockedGuidedState,
  });

  await expect(page.locator('[data-testid="connection-status-text"]')).toContainText("Connected");
  await page.getByRole("button", { name: "Setup" }).click();
}

async function navigateAndAssertDocs(page: Page, sectionId: SectionId, sectionLabel: string) {
  const sectionNav = page.locator("main nav").last();
  const navButton = sectionNav.getByRole("button", { name: sectionLabel, exact: true });

  await expect(navButton).toBeEnabled();
  await navButton.click();

  const markerText = SECTION_MARKERS[sectionId].marker;
  await expect(page.getByRole("heading", { name: markerText, exact: true }).or(page.getByText(markerText, { exact: true })).first()).toBeVisible();

  const docsLinks = page.locator('main a[href*="ardupilot.org"]:visible');
  await expect
    .poll(() => docsLinks.count(), {
      message: `${sectionId} should expose at least one visible ArduPilot docs link`,
    })
    .toBeGreaterThan(0);
}

test("setup sections keep visible ArduPilot docs links across the guided setup flow", async ({
  page,
  mockPlatform,
}) => {
  const metadataRequests: string[] = [];

  await page.route("**/Parameters/**/apm.pdef.xml", async (route) => {
    metadataRequests.push(route.request().url());
    await route.abort();
  });

  await seedCopterMetadata(page);
  await connectCopterAndOpenSetup(page, mockPlatform);

  const sectionNav = page.locator("main nav").last();
  await expect(sectionNav.getByRole("button", { name: "Serial Ports", exact: true })).toBeDisabled();
  await expect(sectionNav.getByRole("button", { name: "Full Parameters", exact: true })).toBeDisabled();
  await expect(page.getByText("Parameters are read from your flight controller")).toBeVisible();

  await mockPlatform.emitParamStore(setupParamStore);
  await mockPlatform.emitParamProgress("completed");

  await expect(sectionNav.getByRole("button", { name: "Serial Ports", exact: true })).toBeEnabled();
  await expect(sectionNav.getByRole("button", { name: "Full Parameters", exact: true })).toBeEnabled();
  await expect(page.getByText("Loading parameter descriptions")).toHaveCount(0);
  await expect(page.getByText("Could not load parameter descriptions")).toHaveCount(0);

  for (const sectionId of [
    "overview",
    "serial_ports",
    "servo_outputs",
    "flight_modes",
    "full_parameters",
    "initial_params",
    "failsafe",
  ] as const) {
    await navigateAndAssertDocs(page, sectionId, SECTION_MARKERS[sectionId].label);
  }

  expect(metadataRequests).toEqual([]);
});
