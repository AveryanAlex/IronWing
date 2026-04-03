import { test, expect } from "./fixtures/mock-platform";
import type { Page } from "@playwright/test";
import type {
  MockGuidedStateValue,
  MockLiveVehicleState,
  MockParamProgressState,
  MockParamStoreState,
} from "../../src/platform/mock/backend";

const ARDUPLANE_METADATA_XML = `<?xml version="1.0" encoding="UTF-8"?>
<paramfile>
  <parameters>
    <param name="ArduPlane:Q_ENABLE" humanName="QuadPlane Enable" documentation="Enable QuadPlane support">
      <values>
        <value code="0">Disabled</value>
        <value code="1">Enabled (QuadPlane)</value>
      </values>
    </param>
    <param name="ArduPlane:Q_FRAME_CLASS" humanName="QuadPlane Frame Class" documentation="VTOL frame class">
      <values>
        <value code="1">Quad</value>
        <value code="10">Tilt-Rotor</value>
      </values>
    </param>
    <param name="ArduPlane:Q_FRAME_TYPE" humanName="QuadPlane Frame Type" documentation="VTOL frame type">
      <values>
        <value code="0">Tilt Rotor</value>
        <value code="1">X</value>
      </values>
    </param>
    <param name="ArduPlane:AHRS_ORIENTATION" humanName="Board Orientation" documentation="Board orientation">
      <values>
        <value code="0">None</value>
      </values>
    </param>
    <param name="ArduPlane:SERVO1_FUNCTION" humanName="Servo 1 Function" documentation="Servo 1 function">
      <values>
        <value code="75">Tilt Front Left</value>
      </values>
    </param>
    <param name="ArduPlane:SERVO2_FUNCTION" humanName="Servo 2 Function" documentation="Servo 2 function">
      <values>
        <value code="33">Motor1</value>
      </values>
    </param>
    <param name="ArduPlane:SERVO3_FUNCTION" humanName="Servo 3 Function" documentation="Servo 3 function">
      <values>
        <value code="4">Aileron</value>
      </values>
    </param>
  </parameters>
</paramfile>`;

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

function paramEntry(
  name: string,
  value: number,
  index: number,
  param_type: MockParamStoreState["params"][string]["param_type"] = "int16",
) {
  return { name, value, param_type, index };
}

function plainPlaneParamStore(): MockParamStoreState {
  return {
    expected_count: 15,
    params: {
      Q_ENABLE: paramEntry("Q_ENABLE", 0, 0, "uint8"),
      AHRS_ORIENTATION: paramEntry("AHRS_ORIENTATION", 0, 1, "uint8"),
      THR_MAX: paramEntry("THR_MAX", 100, 2),
      THR_MIN: paramEntry("THR_MIN", 0, 3),
      THR_SLEWRATE: paramEntry("THR_SLEWRATE", 20, 4),
      RLL2SRV_P: paramEntry("RLL2SRV_P", 0.4, 5, "real32"),
      PTCH2SRV_P: paramEntry("PTCH2SRV_P", 0.5, 6, "real32"),
      YAW2SRV_DAMP: paramEntry("YAW2SRV_DAMP", 0.2, 7, "real32"),
      ARSPD_FBW_MIN: paramEntry("ARSPD_FBW_MIN", 12, 8, "real32"),
      ARSPD_FBW_MAX: paramEntry("ARSPD_FBW_MAX", 22, 9, "real32"),
      TRIM_THROTTLE: paramEntry("TRIM_THROTTLE", 45, 10, "real32"),
      TRIM_ARSPD_CM: paramEntry("TRIM_ARSPD_CM", 1500, 11),
      SERVO1_FUNCTION: paramEntry("SERVO1_FUNCTION", 75, 12),
      SERVO2_FUNCTION: paramEntry("SERVO2_FUNCTION", 33, 13),
      SERVO3_FUNCTION: paramEntry("SERVO3_FUNCTION", 4, 14),
    },
  };
}

function partialQuadPlaneParamStore(): MockParamStoreState {
  return {
    expected_count: 17,
    params: {
      ...plainPlaneParamStore().params,
      Q_ENABLE: paramEntry("Q_ENABLE", 1, 0, "uint8"),
      Q_FRAME_CLASS: paramEntry("Q_FRAME_CLASS", 10, 15, "uint8"),
      Q_TILT_ENABLE: paramEntry("Q_TILT_ENABLE", 1, 16, "uint8"),
    },
  };
}

function refreshedTiltRotorParamStore(): MockParamStoreState {
  return {
    expected_count: 31,
    params: {
      ...plainPlaneParamStore().params,
      Q_ENABLE: paramEntry("Q_ENABLE", 1, 0, "uint8"),
      Q_FRAME_CLASS: paramEntry("Q_FRAME_CLASS", 10, 15, "uint8"),
      Q_FRAME_TYPE: paramEntry("Q_FRAME_TYPE", 0, 16, "uint8"),
      Q_TILT_ENABLE: paramEntry("Q_TILT_ENABLE", 1, 17, "uint8"),
      Q_M_PWM_TYPE: paramEntry("Q_M_PWM_TYPE", 1, 18, "uint8"),
      Q_M_PWM_MIN: paramEntry("Q_M_PWM_MIN", 1000, 19),
      Q_M_PWM_MAX: paramEntry("Q_M_PWM_MAX", 2000, 20),
      Q_M_SPIN_ARM: paramEntry("Q_M_SPIN_ARM", 0.1, 21, "real32"),
      Q_M_SPIN_MIN: paramEntry("Q_M_SPIN_MIN", 0.15, 22, "real32"),
      Q_M_SPIN_MAX: paramEntry("Q_M_SPIN_MAX", 0.95, 23, "real32"),
      Q_M_THST_EXPO: paramEntry("Q_M_THST_EXPO", 0.58, 24, "real32"),
      Q_M_THST_HOVER: paramEntry("Q_M_THST_HOVER", 0.22, 25, "real32"),
      Q_M_BAT_VOLT_MAX: paramEntry("Q_M_BAT_VOLT_MAX", 25.2, 26, "real32"),
      Q_M_BAT_VOLT_MIN: paramEntry("Q_M_BAT_VOLT_MIN", 19.2, 27, "real32"),
      Q_A_RAT_RLL_P: paramEntry("Q_A_RAT_RLL_P", 0.12, 28, "real32"),
      Q_A_RAT_PIT_P: paramEntry("Q_A_RAT_PIT_P", 0.13, 29, "real32"),
      Q_A_RAT_YAW_P: paramEntry("Q_A_RAT_YAW_P", 0.14, 30, "real32"),
    },
  };
}

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
  getLiveEnvelope: () => Promise<{
    session_id: string;
    source_kind: "live" | "playback";
    seek_epoch: number;
    reset_revision: number;
  } | null>;
};

async function seedArduPlaneMetadata(page: Page) {
  await page.addInitScript(({ xml, ts }) => {
    window.localStorage.setItem("param_meta_ArduPlane", xml);
    window.localStorage.setItem("param_meta_ArduPlane_ts", String(ts));
  }, {
    xml: ARDUPLANE_METADATA_XML,
    ts: Date.now(),
  });
}

async function connectFixedWingAndOpenSetup(
  page: Page,
  mockPlatform: MockPlatformController,
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
    vehicleState: fixedWingVehicleState,
    guidedState: blockedGuidedState,
  });

  await expect(page.locator('[data-testid="connection-status-text"]')).toContainText("Connected");
  await page.getByRole("button", { name: "Setup" }).click();
}

test("fixed-wing setup proves the QuadPlane enable path before refresh and VTOL section ownership after refresh", async ({
  page,
  mockPlatform,
}) => {
  const metadataRequests: string[] = [];

  await page.route("**/Parameters/**/apm.pdef.xml", async (route) => {
    metadataRequests.push(route.request().url());
    await route.abort();
  });

  await seedArduPlaneMetadata(page);
  await connectFixedWingAndOpenSetup(page, mockPlatform);

  await expect.poll(() => page.evaluate(() => ({
    cache: window.localStorage.getItem("param_meta_ArduPlane"),
    ts: window.localStorage.getItem("param_meta_ArduPlane_ts"),
  }))).toMatchObject({
    cache: ARDUPLANE_METADATA_XML,
    ts: expect.any(String),
  });

  const sectionNav = page.locator("main nav").last();
  const frameButton = sectionNav.getByRole("button", { name: /Frame & Orientation/ });
  const motorsButton = sectionNav.getByRole("button", { name: /Motors & ESC/ });
  const servoButton = sectionNav.getByRole("button", { name: /Servo Outputs/ });
  const pidButton = sectionNav.getByRole("button", { name: /PID Tuning/ });

  await expect(frameButton).toBeDisabled();
  await expect(motorsButton).toBeDisabled();
  await expect(page.getByText("Parameters are read from your flight controller")).toBeVisible();

  await mockPlatform.emitParamStore(plainPlaneParamStore());
  await mockPlatform.emitParamProgress("completed");

  await expect(frameButton).toBeEnabled();
  await expect(motorsButton).toBeEnabled();
  await expect(page.getByText("Loading parameter descriptions")).toHaveCount(0);
  await expect(page.getByText("Could not load parameter descriptions")).toHaveCount(0);

  await frameButton.click();
  await expect(page.getByText("QuadPlane Configuration")).toBeVisible();
  await expect(page.locator('[data-setup-param="Q_ENABLE"]')).toBeVisible();
  await expect(page.locator('[data-setup-param="FRAME_CLASS"]')).toHaveCount(0);
  await expect(page.locator('[data-setup-param="FRAME_TYPE"]')).toHaveCount(0);
  await expect(
    page.getByText(/Plane firmware can expose a QuadPlane setup path here/i),
  ).toBeVisible();
  await expect(
    page.getByText(/fixed-wing aircraft do not use frame class or type configuration/i),
  ).toHaveCount(0);

  await motorsButton.click();
  await expect(page.getByRole("heading", { name: "Throttle Configuration" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "ESC Protocol" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Motor Test" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "VTOL Motor Layout" })).toHaveCount(0);

  await mockPlatform.emitParamStore(refreshedTiltRotorParamStore());
  await mockPlatform.emitParamProgress("completed");

  await frameButton.click();
  await expect(page.getByText("Tilt-Rotor QuadPlane Frame")).toBeVisible();
  await expect(page.locator('[data-setup-param="Q_FRAME_CLASS"]')).toBeVisible();
  await expect(page.locator('[data-setup-param="Q_FRAME_TYPE"]')).toBeVisible();
  await expect(page.locator('[data-setup-param="Q_ENABLE"]')).toHaveCount(0);
  await expect(page.getByText(/Tilt-rotor QuadPlane detected/i)).toBeVisible();
  await expect(page.getByText(/Custom tilt-rotor preview shown/i)).toBeVisible();

  await motorsButton.click();
  await expect(page.getByRole("heading", { name: "ESC Protocol" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Motor Test" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "VTOL Motor Layout" })).toBeVisible();
  await expect(page.locator('[data-setup-param="Q_M_PWM_TYPE"]')).toBeVisible();
  await expect(page.locator('[data-setup-param="THR_MAX"]')).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Throttle Configuration" })).toHaveCount(0);

  await servoButton.click();
  await expect(page.getByText(/Tilt-rotor servo guidance/i)).toBeVisible();
  await expect(page.getByText(/^VTOL Transition & Tilt Outputs$/i)).toBeVisible();
  await expect(page.getByText(/^Auto-assigned lift motors$/i)).toBeVisible();
  await expect(page.getByText(/^Other configured outputs$/i)).toBeVisible();
  await expect(page.getByText(/Fixed-wing servo setup/i)).toHaveCount(0);

  await pidButton.click();
  await expect(page.getByText(/VTOL Rate PIDs/i)).toBeVisible();
  await expect(page.getByText(/Lift Motor Response/i)).toBeVisible();
  await expect(page.locator('[data-setup-param="Q_A_RAT_RLL_P"]')).toBeVisible();
  await expect(page.locator('[data-setup-param="Q_M_THST_EXPO"]')).toBeVisible();
  await expect(page.getByText(/^Servo Tuning — Roll, pitch, and yaw control surface tuning$/i)).toHaveCount(0);
  await expect(page.getByText(/^Speed Configuration$/i)).toHaveCount(0);

  expect(metadataRequests).toEqual([]);
});

test("setup treats a missing ArduPlane metadata cache as a harness failure and stays locked", async ({
  page,
  mockPlatform,
}) => {
  const metadataRequests: string[] = [];

  await page.route("**/Parameters/**/apm.pdef.xml", async (route) => {
    metadataRequests.push(route.request().url());
    await route.abort();
  });

  await connectFixedWingAndOpenSetup(page, mockPlatform);

  const sectionNav = page.locator("main nav").last();
  const frameButton = sectionNav.getByRole("button", { name: /Frame & Orientation/ });

  await mockPlatform.emitParamStore(plainPlaneParamStore());
  await mockPlatform.emitParamProgress("completed");

  await expect(page.getByText("Could not load parameter descriptions")).toBeVisible();
  await expect(frameButton).toBeDisabled();
  expect(metadataRequests).toEqual([
    expect.stringContaining("/Parameters/ArduPlane/apm.pdef.xml"),
  ]);
});

test("partial QuadPlane refresh stays explicit instead of guessing the wrong VTOL frame UI", async ({
  page,
  mockPlatform,
}) => {
  await page.route("**/Parameters/**/apm.pdef.xml", async (route) => {
    await route.abort();
  });

  await seedArduPlaneMetadata(page);
  await connectFixedWingAndOpenSetup(page, mockPlatform);

  await mockPlatform.emitParamStore(partialQuadPlaneParamStore());
  await mockPlatform.emitParamProgress("completed");

  const sectionNav = page.locator("main nav").last();
  const frameButton = sectionNav.getByRole("button", { name: /Frame & Orientation/ });
  const pidButton = sectionNav.getByRole("button", { name: /PID Tuning/ });

  await frameButton.click();
  await expect(
    page.getByText(/QuadPlane parameters are only partially available right now/i),
  ).toBeVisible();
  await expect(page.locator('[data-setup-param="Q_FRAME_CLASS"]')).toHaveCount(0);
  await expect(page.locator('[data-setup-param="Q_FRAME_TYPE"]')).toHaveCount(0);

  await pidButton.click();
  await expect(
    page.getByText(/QuadPlane is enabled, but the VTOL tuning surface has not finished loading yet/i),
  ).toBeVisible();
  await expect(page.getByText(/VTOL Rate PIDs/i)).toHaveCount(0);
});
