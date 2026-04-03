import { test, expect } from "./fixtures/mock-platform";
import type { Page } from "@playwright/test";
import type {
  MockGuidedStateValue,
  MockLiveVehicleState,
  MockParamProgressState,
  MockParamStoreState,
} from "../../src/platform/mock/backend";

const ARDUCOPTER_METADATA_XML = `<?xml version="1.0" encoding="UTF-8"?>
<paramfile>
  <parameters>
    <param name="ArduCopter:FRAME_CLASS" humanName="Frame Class" documentation="Multicopter frame class" />
    <param name="ArduCopter:FRAME_TYPE" humanName="Frame Type" documentation="Multicopter frame type" />
    <param name="ArduCopter:MOT_PWM_TYPE" humanName="Motor PWM Type" documentation="ESC protocol" />
    <param name="ArduCopter:MOT_PWM_MIN" humanName="Motor PWM Min" documentation="Minimum PWM" />
    <param name="ArduCopter:MOT_PWM_MAX" humanName="Motor PWM Max" documentation="Maximum PWM" />
    <param name="ArduCopter:MOT_SPIN_ARM" humanName="Motor Spin Armed" documentation="Spin armed threshold" />
    <param name="ArduCopter:MOT_SPIN_MIN" humanName="Motor Spin Min" documentation="Minimum in-flight spin" />
    <param name="ArduCopter:MOT_SPIN_MAX" humanName="Motor Spin Max" documentation="Maximum throttle fraction" />
  </parameters>
</paramfile>`;

const ARDUPLANE_METADATA_XML = `<?xml version="1.0" encoding="UTF-8"?>
<paramfile>
  <parameters>
    <param name="ArduPlane:Q_ENABLE" humanName="QuadPlane Enable" documentation="Enable QuadPlane support" />
    <param name="ArduPlane:Q_FRAME_CLASS" humanName="QuadPlane Frame Class" documentation="VTOL frame class" />
    <param name="ArduPlane:Q_FRAME_TYPE" humanName="QuadPlane Frame Type" documentation="VTOL frame type" />
    <param name="ArduPlane:Q_M_PWM_TYPE" humanName="VTOL PWM Type" documentation="VTOL ESC protocol" />
    <param name="ArduPlane:Q_M_PWM_MIN" humanName="VTOL PWM Min" documentation="Minimum VTOL PWM" />
    <param name="ArduPlane:Q_M_PWM_MAX" humanName="VTOL PWM Max" documentation="Maximum VTOL PWM" />
    <param name="ArduPlane:Q_M_SPIN_ARM" humanName="VTOL Spin Armed" documentation="VTOL spin armed threshold" />
    <param name="ArduPlane:Q_M_SPIN_MIN" humanName="VTOL Spin Min" documentation="VTOL minimum in-flight spin" />
    <param name="ArduPlane:Q_M_SPIN_MAX" humanName="VTOL Spin Max" documentation="VTOL maximum throttle fraction" />
  </parameters>
</paramfile>`;

const quadrotorVehicleState: MockLiveVehicleState = {
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

const fixedWingVehicleState: MockLiveVehicleState = {
  armed: false,
  custom_mode: 5,
  mode_name: "FBWA",
  system_status: "STANDBY",
  vehicle_type: "fixed_wing",
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
    paramProgress?: MockParamProgressState;
    guidedState: MockGuidedStateValue;
  }) => Promise<boolean>;
  emitParamStore: (paramStore: MockParamStoreState) => Promise<void>;
  emitParamProgress: (paramProgress: MockParamProgressState) => Promise<void>;
  getInvocations: () => Promise<Array<{ cmd: string; args: Record<string, unknown> | undefined }>>;
  getLiveEnvelope: () => Promise<{
    session_id: string;
    source_kind: "live" | "playback";
    seek_epoch: number;
    reset_revision: number;
  } | null>;
};

function paramEntry(
  name: string,
  value: number,
  index: number,
  param_type: MockParamStoreState["params"][string]["param_type"] = "real32",
) {
  return { name, value, param_type, index };
}

function copterParamStore(): MockParamStoreState {
  return {
    expected_count: 8,
    params: {
      FRAME_CLASS: paramEntry("FRAME_CLASS", 1, 0, "uint8"),
      FRAME_TYPE: paramEntry("FRAME_TYPE", 1, 1, "uint8"),
      MOT_PWM_TYPE: paramEntry("MOT_PWM_TYPE", 1, 2, "uint8"),
      MOT_PWM_MIN: paramEntry("MOT_PWM_MIN", 1000, 3),
      MOT_PWM_MAX: paramEntry("MOT_PWM_MAX", 2000, 4),
      MOT_SPIN_ARM: paramEntry("MOT_SPIN_ARM", 0.1, 5),
      MOT_SPIN_MIN: paramEntry("MOT_SPIN_MIN", 0.15, 6),
      MOT_SPIN_MAX: paramEntry("MOT_SPIN_MAX", 0.95, 7),
    },
  };
}

function quadPlaneParamStore(): MockParamStoreState {
  return {
    expected_count: 9,
    params: {
      Q_ENABLE: paramEntry("Q_ENABLE", 1, 0, "uint8"),
      Q_FRAME_CLASS: paramEntry("Q_FRAME_CLASS", 1, 1, "uint8"),
      Q_FRAME_TYPE: paramEntry("Q_FRAME_TYPE", 1, 2, "uint8"),
      Q_M_PWM_TYPE: paramEntry("Q_M_PWM_TYPE", 1, 3, "uint8"),
      Q_M_PWM_MIN: paramEntry("Q_M_PWM_MIN", 1000, 4),
      Q_M_PWM_MAX: paramEntry("Q_M_PWM_MAX", 2000, 5),
      Q_M_SPIN_ARM: paramEntry("Q_M_SPIN_ARM", 0.1, 6),
      Q_M_SPIN_MIN: paramEntry("Q_M_SPIN_MIN", 0.15, 7),
      Q_M_SPIN_MAX: paramEntry("Q_M_SPIN_MAX", 0.95, 8),
    },
  };
}

function trackConsoleErrors(page: Page) {
  const consoleErrors: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(`console.${message.type()}: ${message.text()}`);
    }
  });

  page.on("pageerror", (error) => {
    consoleErrors.push(`pageerror: ${error.message}`);
  });

  return consoleErrors;
}

async function seedMetadata(page: Page, cacheKey: string, xml: string) {
  await page.addInitScript(({ key, payload, ts }) => {
    window.localStorage.setItem(key, payload);
    window.localStorage.setItem(`${key}_ts`, String(ts));
  }, {
    key: cacheKey,
    payload: xml,
    ts: Date.now(),
  });
}

async function connectVehicleAndOpenSetup(
  page: Page,
  mockPlatform: MockPlatformController,
  vehicleState: MockLiveVehicleState,
) {
  await page.goto("/");
  await expect(page).toHaveTitle(/IronWing/);
  await expect(page.locator('[data-testid="connection-status-text"]')).toContainText("Idle");
  await mockPlatform.reset();
  await mockPlatform.setCommandBehavior("connect_link", { type: "defer" });

  await page.locator('[data-testid="connection-transport-select"]').selectOption("tcp");
  await page.locator('[data-testid="connection-tcp-address"]').fill("127.0.0.1:5760");
  await page.locator('[data-testid="connection-connect-btn"]').click();

  await expect.poll(() => mockPlatform.getLiveEnvelope()).not.toBeNull();

  await mockPlatform.resolveDeferredConnectLink({
    vehicleState,
    guidedState: blockedGuidedState,
  });

  await expect(page.locator('[data-testid="connection-status-text"]')).toContainText("Connected");
  await page.getByRole("button", { name: "Setup" }).click();
}

async function openMotorsAndEsc(
  page: Page,
  mockPlatform: MockPlatformController,
  paramStore: MockParamStoreState,
) {
  const sectionNav = page.locator("main nav").last();
  const motorsButton = sectionNav.getByRole("button", { name: /Motors & ESC/ });

  await expect(motorsButton).toBeDisabled();
  await expect(page.getByText("Parameters are read from your flight controller")).toBeVisible();

  await mockPlatform.emitParamStore(paramStore);
  await mockPlatform.emitParamProgress("completed");

  await expect(motorsButton).toBeEnabled();
  await expect(page.getByText("Loading parameter descriptions")).toHaveCount(0);
  await expect(page.getByText("Could not load parameter descriptions")).toHaveCount(0);

  await motorsButton.click();
  await expect(page.getByRole("heading", { name: "Motor Test" })).toBeVisible();
}

async function enableMotorTest(page: Page) {
  await page.getByRole("switch").click();
  await page.getByRole("button", { name: "Props Removed" }).click();
  await expect(page.getByRole("switch")).toHaveAttribute("aria-checked", "true");
}

test("setup proves copter motor direction verification records motor_test and stores a correct result", async ({
  page,
  mockPlatform,
}) => {
  const consoleErrors = trackConsoleErrors(page);
  const metadataRequests: string[] = [];

  await page.route("**/Parameters/**/apm.pdef.xml", async (route) => {
    metadataRequests.push(route.request().url());
    await route.abort();
  });

  await seedMetadata(page, "param_meta_ArduCopter", ARDUCOPTER_METADATA_XML);
  await connectVehicleAndOpenSetup(page, mockPlatform, quadrotorVehicleState);

  await expect.poll(() => page.evaluate(() => ({
    cache: window.localStorage.getItem("param_meta_ArduCopter"),
    ts: window.localStorage.getItem("param_meta_ArduCopter_ts"),
  }))).toMatchObject({
    cache: ARDUCOPTER_METADATA_XML,
    ts: expect.any(String),
  });

  await openMotorsAndEsc(page, mockPlatform, copterParamStore());

  await expect(page.getByText("CW ↻")).toHaveCount(2);
  await expect(page.getByText("CCW ↺")).toHaveCount(2);
  await expect(page.locator('[aria-label="Test motor 1"]')).toBeVisible();
  await expect(page.locator('[aria-label="Test motor 4"]')).toBeVisible();
  expect(await page.getByRole("button", { name: /Test motor/i }).allTextContents()).toEqual([
    "Test motor 1",
    "Test motor 4",
    "Test motor 2",
    "Test motor 3",
  ]);

  await enableMotorTest(page);
  await page.getByRole("button", { name: "Test motor 1" }).click();

  await expect.poll(() => mockPlatform.getInvocations()).toContainEqual(
    expect.objectContaining({
      cmd: "motor_test",
      args: { motorInstance: 1, throttlePct: 3, durationS: 2 },
    }),
  );

  await expect(page.getByText("Observed direction")).toBeVisible();
  await expect(page.getByRole("button", { name: "Correct" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reversed" })).toBeVisible();

  await page.getByRole("button", { name: "Correct" }).click();
  await expect(page.getByText("1/4 verified")).toBeVisible();
  await expect(page.getByText("correct", { exact: true })).toBeVisible();

  expect(metadataRequests).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("setup proves QuadPlane motor direction verification reaches the VTOL motor test surface", async ({
  page,
  mockPlatform,
}) => {
  const consoleErrors = trackConsoleErrors(page);
  const metadataRequests: string[] = [];

  await page.route("**/Parameters/**/apm.pdef.xml", async (route) => {
    metadataRequests.push(route.request().url());
    await route.abort();
  });

  await seedMetadata(page, "param_meta_ArduPlane", ARDUPLANE_METADATA_XML);
  await connectVehicleAndOpenSetup(page, mockPlatform, fixedWingVehicleState);

  await expect.poll(() => page.evaluate(() => ({
    cache: window.localStorage.getItem("param_meta_ArduPlane"),
    ts: window.localStorage.getItem("param_meta_ArduPlane_ts"),
  }))).toMatchObject({
    cache: ARDUPLANE_METADATA_XML,
    ts: expect.any(String),
  });

  await openMotorsAndEsc(page, mockPlatform, quadPlaneParamStore());

  await expect(page.getByRole("heading", { name: "ESC Protocol" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "VTOL Motor Layout" })).toBeVisible();
  await expect(page.getByText("CW ↻")).toHaveCount(2);
  await expect(page.getByText("CCW ↺")).toHaveCount(2);
  expect(await page.getByRole("button", { name: /Test motor/i }).allTextContents()).toEqual([
    "Test motor 1",
    "Test motor 4",
    "Test motor 2",
    "Test motor 3",
  ]);

  await enableMotorTest(page);
  await page.getByRole("button", { name: "Test motor 4" }).click();

  await expect.poll(() => mockPlatform.getInvocations()).toContainEqual(
    expect.objectContaining({
      cmd: "motor_test",
      args: { motorInstance: 4, throttlePct: 3, durationS: 2 },
    }),
  );

  await expect(page.getByText("Observed direction")).toBeVisible();
  await expect(page.getByRole("button", { name: "Correct" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reversed" })).toBeVisible();

  expect(metadataRequests).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
