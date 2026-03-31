import { expect, type Page } from "@playwright/test";
import type {
  MockGuidedStateValue,
  MockLiveVehicleState,
  MockParamProgressState,
  MockParamStoreState,
} from "../../src/platform/mock/backend";
import type { SensorHealth } from "../../src/sensor-health";
import type { SupportState } from "../../src/support";

export type MockPlatformController = {
  reset: () => Promise<void>;
  setCommandBehavior: (cmd: string, behavior: { type: "defer" }) => Promise<void>;
  resolveDeferredConnectLink: (params: {
    vehicleState: MockLiveVehicleState;
    paramStore?: MockParamStoreState;
    paramProgress?: MockParamProgressState;
    guidedState: MockGuidedStateValue;
  }) => Promise<boolean>;
  emit: (event: string, payload: unknown) => Promise<void>;
  emitParamStore: (paramStore: MockParamStoreState) => Promise<void>;
  emitParamProgress: (paramProgress: MockParamProgressState) => Promise<void>;
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

export const ARDUCOPTER_METADATA_XML = `<?xml version="1.0" encoding="UTF-8"?>
<paramfile>
  <parameters>
    <param name="ArduCopter:FRAME_CLASS" humanName="Frame Class" documentation="Multicopter frame class">
      <values>
        <value code="1">Quad</value>
        <value code="2">Hexa</value>
      </values>
    </param>
    <param name="ArduCopter:FRAME_TYPE" humanName="Frame Type" documentation="Multicopter frame type">
      <values>
        <value code="1">X</value>
        <value code="0">Plus</value>
      </values>
    </param>
    <param name="ArduCopter:AHRS_ORIENTATION" humanName="Board Orientation" documentation="Flight controller orientation">
      <values>
        <value code="0">None</value>
        <value code="2">Yaw 90</value>
      </values>
    </param>
    <param name="ArduCopter:BATT_MONITOR" humanName="Battery Monitor" documentation="Battery monitor type">
      <values>
        <value code="0">Disabled</value>
        <value code="4">Analog Voltage and Current</value>
      </values>
    </param>
    <param name="ArduCopter:ARMING_CHECK" humanName="Arming Check" documentation="Pre-arm validation mask">
      <bitmask>
        <bit code="0">Barometer</bit>
        <bit code="1">Compass</bit>
        <bit code="2">GPS</bit>
        <bit code="3">INS</bit>
        <bit code="4">Parameters</bit>
      </bitmask>
    </param>
    <param name="ArduCopter:ARMING_REQUIRE" humanName="Arming Method" documentation="Method used to arm the vehicle">
      <values>
        <value code="0">Disabled</value>
        <value code="1">Throttle-Yaw-Right</value>
        <value code="2">Arm Switch</value>
      </values>
    </param>
    <param name="ArduCopter:FS_THR_ENABLE" humanName="Throttle Failsafe" documentation="Throttle failsafe action">
      <values>
        <value code="0">Disabled</value>
        <value code="1">Enabled</value>
        <value code="4">SmartRTL or RTL</value>
      </values>
    </param>
    <param name="ArduCopter:RC_PROTOCOLS" humanName="RC Protocols" documentation="Detected RC input protocols">
      <bitmask>
        <bit code="0">PPM</bit>
        <bit code="3">SBUS</bit>
        <bit code="6">CRSF</bit>
      </bitmask>
    </param>
    <param name="ArduCopter:RCMAP_ROLL" humanName="Roll" documentation="Primary roll channel" />
    <param name="ArduCopter:RCMAP_PITCH" humanName="Pitch" documentation="Primary pitch channel" />
    <param name="ArduCopter:RCMAP_THROTTLE" humanName="Throttle" documentation="Primary throttle channel" />
    <param name="ArduCopter:RCMAP_YAW" humanName="Yaw" documentation="Primary yaw channel" />
    <param name="ArduCopter:RSSI_TYPE" humanName="RSSI Type" documentation="Receiver RSSI source">
      <values>
        <value code="0">Disabled</value>
        <value code="2">RCChannel</value>
        <value code="3">ReceiverProtocol</value>
      </values>
    </param>
    <param name="ArduCopter:RSSI_CHANNEL" humanName="RSSI Channel" documentation="Channel carrying RSSI">
      <field name="Units">channel</field>
    </param>
    <param name="ArduCopter:INS_ACCOFFS_X" humanName="Accel X Offset" documentation="Accelerometer X offset">
      <field name="Units">m/s²</field>
    </param>
    <param name="ArduCopter:INS_ACCOFFS_Y" humanName="Accel Y Offset" documentation="Accelerometer Y offset">
      <field name="Units">m/s²</field>
    </param>
    <param name="ArduCopter:INS_ACCOFFS_Z" humanName="Accel Z Offset" documentation="Accelerometer Z offset">
      <field name="Units">m/s²</field>
    </param>
    <param name="ArduCopter:COMPASS_DEV_ID" humanName="Compass Device" documentation="Primary compass device id" />
    <param name="ArduCopter:COMPASS_OFS_X" humanName="Compass X Offset" documentation="Compass X offset">
      <field name="Units">mG</field>
    </param>
    <param name="ArduCopter:COMPASS_OFS_Y" humanName="Compass Y Offset" documentation="Compass Y offset">
      <field name="Units">mG</field>
    </param>
    <param name="ArduCopter:COMPASS_OFS_Z" humanName="Compass Z Offset" documentation="Compass Z offset">
      <field name="Units">mG</field>
    </param>
    <param name="ArduCopter:RC1_MIN" humanName="CH1 Min" documentation="Channel 1 minimum PWM">
      <field name="Units">µs</field>
    </param>
    <param name="ArduCopter:RC1_MAX" humanName="CH1 Max" documentation="Channel 1 maximum PWM">
      <field name="Units">µs</field>
    </param>
    <param name="ArduCopter:RC1_TRIM" humanName="CH1 Trim" documentation="Channel 1 trim PWM">
      <field name="Units">µs</field>
    </param>
    <param name="ArduCopter:SERVO1_FUNCTION" humanName="Servo 1 Function" documentation="Primary surface on servo 1">
      <values>
        <value code="4">Aileron Left</value>
        <value code="19">Elevator</value>
        <value code="79">Aileron Right</value>
      </values>
    </param>
    <param name="ArduCopter:SERVO1_MIN" humanName="Servo 1 Min" documentation="Servo 1 minimum PWM">
      <field name="Units">µs</field>
    </param>
    <param name="ArduCopter:SERVO1_MAX" humanName="Servo 1 Max" documentation="Servo 1 maximum PWM">
      <field name="Units">µs</field>
    </param>
    <param name="ArduCopter:SERVO1_TRIM" humanName="Servo 1 Trim" documentation="Servo 1 trim PWM">
      <field name="Units">µs</field>
    </param>
    <param name="ArduCopter:SERVO1_REVERSED" humanName="Servo 1 Reversed" documentation="Reverse servo 1 direction">
      <values>
        <value code="0">Normal</value>
        <value code="1">Reversed</value>
      </values>
    </param>
    <param name="ArduCopter:SERVO2_FUNCTION" humanName="Servo 2 Function" documentation="Primary surface on servo 2">
      <values>
        <value code="4">Aileron Left</value>
        <value code="19">Elevator</value>
        <value code="79">Aileron Right</value>
      </values>
    </param>
    <param name="ArduCopter:SERVO2_MIN" humanName="Servo 2 Min" documentation="Servo 2 minimum PWM">
      <field name="Units">µs</field>
    </param>
    <param name="ArduCopter:SERVO2_MAX" humanName="Servo 2 Max" documentation="Servo 2 maximum PWM">
      <field name="Units">µs</field>
    </param>
    <param name="ArduCopter:SERVO2_TRIM" humanName="Servo 2 Trim" documentation="Servo 2 trim PWM">
      <field name="Units">µs</field>
    </param>
    <param name="ArduCopter:SERVO2_REVERSED" humanName="Servo 2 Reversed" documentation="Reverse servo 2 direction">
      <values>
        <value code="0">Normal</value>
        <value code="1">Reversed</value>
      </values>
    </param>
    <param name="ArduCopter:SERVO3_FUNCTION" humanName="Servo 3 Function" documentation="Primary surface on servo 3">
      <values>
        <value code="4">Aileron Left</value>
        <value code="19">Elevator</value>
        <value code="70">Throttle</value>
      </values>
    </param>
    <param name="ArduCopter:SERVO3_MIN" humanName="Servo 3 Min" documentation="Servo 3 minimum PWM">
      <field name="Units">µs</field>
    </param>
    <param name="ArduCopter:SERVO3_MAX" humanName="Servo 3 Max" documentation="Servo 3 maximum PWM">
      <field name="Units">µs</field>
    </param>
    <param name="ArduCopter:SERVO3_TRIM" humanName="Servo 3 Trim" documentation="Servo 3 trim PWM">
      <field name="Units">µs</field>
    </param>
    <param name="ArduCopter:SERVO3_REVERSED" humanName="Servo 3 Reversed" documentation="Reverse servo 3 direction">
      <values>
        <value code="0">Normal</value>
        <value code="1">Reversed</value>
      </values>
    </param>
    <param name="ArduCopter:MOT_PWM_TYPE" humanName="ESC Protocol" documentation="Motor ESC protocol">
      <values>
        <value code="0">Normal</value>
        <value code="1">OneShot</value>
        <value code="4">DShot150</value>
      </values>
    </param>
    <param name="ArduCopter:MOT_PWM_MIN" humanName="Motor PWM Min" documentation="Minimum PWM">
      <field name="Units">PWM</field>
    </param>
    <param name="ArduCopter:MOT_PWM_MAX" humanName="Motor PWM Max" documentation="Maximum PWM">
      <field name="Units">PWM</field>
    </param>
    <param name="ArduCopter:MOT_SPIN_ARM" humanName="Motor Spin Armed" documentation="Spin armed threshold" />
    <param name="ArduCopter:MOT_SPIN_MIN" humanName="Motor Spin Min" documentation="Minimum in-flight spin" />
    <param name="ArduCopter:MOT_SPIN_MAX" humanName="Motor Spin Max" documentation="Maximum throttle fraction" />
  </parameters>
</paramfile>`;

export const STANDARD_SETUP_PARAM_STORE: MockParamStoreState = {
  expected_count: 45,
  params: {
    FRAME_CLASS: paramEntry("FRAME_CLASS", 1, 0, "uint8"),
    FRAME_TYPE: paramEntry("FRAME_TYPE", 1, 1, "uint8"),
    AHRS_ORIENTATION: paramEntry("AHRS_ORIENTATION", 0, 2, "uint8"),
    BATT_MONITOR: paramEntry("BATT_MONITOR", 4, 3, "uint8"),
    ARMING_CHECK: paramEntry("ARMING_CHECK", 1, 4, "uint16"),
    ARMING_REQUIRE: paramEntry("ARMING_REQUIRE", 1, 5, "uint8"),
    FS_THR_ENABLE: paramEntry("FS_THR_ENABLE", 1, 6, "uint8"),
    RC_PROTOCOLS: paramEntry("RC_PROTOCOLS", 1, 7, "uint16"),
    RCMAP_ROLL: paramEntry("RCMAP_ROLL", 1, 8, "uint8"),
    RCMAP_PITCH: paramEntry("RCMAP_PITCH", 2, 9, "uint8"),
    RCMAP_THROTTLE: paramEntry("RCMAP_THROTTLE", 3, 10, "uint8"),
    RCMAP_YAW: paramEntry("RCMAP_YAW", 4, 11, "uint8"),
    RSSI_TYPE: paramEntry("RSSI_TYPE", 3, 12, "uint8"),
    RSSI_CHANNEL: paramEntry("RSSI_CHANNEL", 8, 13, "uint8"),
    INS_ACCOFFS_X: paramEntry("INS_ACCOFFS_X", 0, 14),
    INS_ACCOFFS_Y: paramEntry("INS_ACCOFFS_Y", 0, 15),
    INS_ACCOFFS_Z: paramEntry("INS_ACCOFFS_Z", 0, 16),
    COMPASS_DEV_ID: paramEntry("COMPASS_DEV_ID", 12345, 17, "uint32"),
    COMPASS_OFS_X: paramEntry("COMPASS_OFS_X", 0, 18),
    COMPASS_OFS_Y: paramEntry("COMPASS_OFS_Y", 0, 19),
    COMPASS_OFS_Z: paramEntry("COMPASS_OFS_Z", 0, 20),
    RC1_MIN: paramEntry("RC1_MIN", 1000, 21),
    RC1_MAX: paramEntry("RC1_MAX", 2000, 22),
    RC1_TRIM: paramEntry("RC1_TRIM", 1500, 23),
    SERVO1_FUNCTION: paramEntry("SERVO1_FUNCTION", 4, 24, "int16"),
    SERVO1_MIN: paramEntry("SERVO1_MIN", 1000, 25, "int16"),
    SERVO1_MAX: paramEntry("SERVO1_MAX", 2000, 26, "int16"),
    SERVO1_TRIM: paramEntry("SERVO1_TRIM", 1500, 27, "int16"),
    SERVO1_REVERSED: paramEntry("SERVO1_REVERSED", 0, 28, "uint8"),
    SERVO2_FUNCTION: paramEntry("SERVO2_FUNCTION", 79, 29, "int16"),
    SERVO2_MIN: paramEntry("SERVO2_MIN", 1000, 30, "int16"),
    SERVO2_MAX: paramEntry("SERVO2_MAX", 2000, 31, "int16"),
    SERVO2_TRIM: paramEntry("SERVO2_TRIM", 1500, 32, "int16"),
    SERVO2_REVERSED: paramEntry("SERVO2_REVERSED", 0, 33, "uint8"),
    SERVO3_FUNCTION: paramEntry("SERVO3_FUNCTION", 19, 34, "int16"),
    SERVO3_MIN: paramEntry("SERVO3_MIN", 1000, 35, "int16"),
    SERVO3_MAX: paramEntry("SERVO3_MAX", 2000, 36, "int16"),
    SERVO3_TRIM: paramEntry("SERVO3_TRIM", 1500, 37, "int16"),
    SERVO3_REVERSED: paramEntry("SERVO3_REVERSED", 0, 38, "uint8"),
    MOT_PWM_TYPE: paramEntry("MOT_PWM_TYPE", 1, 39, "uint8"),
    MOT_PWM_MIN: paramEntry("MOT_PWM_MIN", 1000, 40),
    MOT_PWM_MAX: paramEntry("MOT_PWM_MAX", 2000, 41),
    MOT_SPIN_ARM: paramEntry("MOT_SPIN_ARM", 0.1, 42),
    MOT_SPIN_MIN: paramEntry("MOT_SPIN_MIN", 0.15, 43),
    MOT_SPIN_MAX: paramEntry("MOT_SPIN_MAX", 0.95, 44),
  },
};

const SECTION_MARKERS: Record<string, string> = {
  Overview: "Quick Actions",
  "Frame & Orientation": "Board Orientation",
  Calibration: "Sensor Calibration",
  "RC / Receiver": "Live RC Channels",
  "Motors & ESC": "Motor Test",
  "Servo Outputs": "Servo Tester",
  Arming: "Vehicle Control",
};

function streamValue<T>(value: T) {
  return {
    available: true,
    complete: true,
    provenance: "stream" as const,
    value,
  };
}

let statusSequence = 0;

async function openAppTab(page: Page, label: "Setup" | "Firmware") {
  await page.getByRole("button", { name: label, exact: true }).last().click();
}

async function openMobileVehiclePanelIfNeeded(page: Page) {
  const vehiclePanelButton = page.getByRole("button", { name: "Vehicle panel" });
  if (await vehiclePanelButton.isVisible()) {
    await vehiclePanelButton.click();
    await expect(page.getByText("Connection", { exact: true })).toBeVisible();
  }
}

async function closeMobileVehiclePanelIfNeeded(page: Page) {
  const vehiclePanelButton = page.getByRole("button", { name: "Vehicle panel" });
  if (await vehiclePanelButton.isVisible()) {
    const viewport = page.viewportSize();
    if (viewport) {
      await page.mouse.click(viewport.width - 10, 100);
    }
  }
}

async function emitScopedDomain<T>(
  mockPlatform: MockPlatformController,
  event: string,
  value: T,
) {
  const envelope = await mockPlatform.getLiveEnvelope();
  expect(envelope).not.toBeNull();

  await mockPlatform.emit(event, {
    envelope,
    value: streamValue(value),
  });
}

export async function seedCopterMetadata(page: Page) {
  await page.addInitScript(({ xml, ts }) => {
    window.localStorage.setItem("param_meta_ArduCopter", xml);
    window.localStorage.setItem("param_meta_ArduCopter_ts", String(ts));
  }, {
    xml: ARDUCOPTER_METADATA_XML,
    ts: Date.now(),
  });
}

export function standardVehicleState(): MockLiveVehicleState {
  return {
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
}

export function blockedGuidedState(): MockGuidedStateValue {
  return {
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
}

export async function connectAndOpenSetup(
  page: Page,
  mockPlatform: MockPlatformController,
) {
  await page.goto("/");
  await expect(page).toHaveTitle(/IronWing/);
  await openMobileVehiclePanelIfNeeded(page);
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
    vehicleState: standardVehicleState(),
    guidedState: blockedGuidedState(),
  });

  await expect(page.locator('[data-testid="connection-status-text"]')).toContainText("Connected");
  await closeMobileVehiclePanelIfNeeded(page);
  await openAppTab(page, "Setup");

  await mockPlatform.emitParamStore(STANDARD_SETUP_PARAM_STORE);
  await mockPlatform.emitParamProgress("completed");

  await expect(page.getByText("Loading parameter descriptions")).toHaveCount(0);
  await expect(page.getByText("Could not load parameter descriptions")).toHaveCount(0);
  await expect(page.getByText("Quick Actions")).toBeVisible();
}

export async function navigateSection(page: Page, label: string) {
  const mobileMenuButton = page.locator("button:has(svg.lucide-menu)");
  if (await mobileMenuButton.isVisible()) {
    await mobileMenuButton.click();
    const drawerButton = page.locator("aside").getByRole("button", { name: label, exact: true });
    await expect(drawerButton).toBeVisible();
    await drawerButton.click();
  } else {
    const desktopButton = page.locator("main nav").last().getByRole("button", { name: label, exact: true });
    await desktopButton.click();
  }

  const marker = SECTION_MARKERS[label] ?? label;
  await expect(page.getByText(marker, { exact: true }).first()).toBeVisible();
}

export async function emitSensorHealth(
  mockPlatform: MockPlatformController,
  health: SensorHealth,
) {
  await emitScopedDomain(mockPlatform, "sensor_health://state", health);
}

export async function emitSupportState(
  mockPlatform: MockPlatformController,
  support: SupportState,
) {
  await emitScopedDomain(mockPlatform, "support://state", support);
}

export async function emitStatusText(
  mockPlatform: MockPlatformController,
  text: string,
  severity: string = "notice",
) {
  statusSequence += 1;
  await emitScopedDomain(mockPlatform, "status_text://state", {
    entries: [
      {
        sequence: statusSequence,
        text,
        severity,
        timestamp_usec: statusSequence * 1000,
      },
    ],
  });
}

export async function openFirmware(page: Page) {
  await openAppTab(page, "Firmware");
}

export async function openSetup(page: Page) {
  await openAppTab(page, "Setup");
}
