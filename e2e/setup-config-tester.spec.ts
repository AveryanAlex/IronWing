import { test, expect } from "./fixtures/mock-platform";

const ARDUCOPTER_METADATA_XML = `<?xml version="1.0" encoding="UTF-8"?>
<paramfile>
  <parameters>
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
    <param name="ArduCopter:SERVO1_FUNCTION" humanName="Servo 1 Function" documentation="Primary surface on servo 1">
      <values>
        <value code="4">Aileron Left</value>
        <value code="19">Elevator</value>
        <value code="79">Aileron Right</value>
      </values>
    </param>
    <param name="ArduCopter:SERVO2_FUNCTION" humanName="Servo 2 Function" documentation="Primary surface on servo 2">
      <values>
        <value code="4">Aileron Left</value>
        <value code="19">Elevator</value>
        <value code="79">Aileron Right</value>
      </values>
    </param>
  </parameters>
</paramfile>`;

const setupParamStore = {
  expected_count: 12,
  params: {
    RC_PROTOCOLS: { name: "RC_PROTOCOLS", value: 1, param_type: "uint16", index: 0 },
    RCMAP_ROLL: { name: "RCMAP_ROLL", value: 1, param_type: "uint8", index: 1 },
    RCMAP_PITCH: { name: "RCMAP_PITCH", value: 2, param_type: "uint8", index: 2 },
    RCMAP_THROTTLE: { name: "RCMAP_THROTTLE", value: 3, param_type: "uint8", index: 3 },
    RCMAP_YAW: { name: "RCMAP_YAW", value: 4, param_type: "uint8", index: 4 },
    RSSI_TYPE: { name: "RSSI_TYPE", value: 3, param_type: "uint8", index: 5 },
    RSSI_CHANNEL: { name: "RSSI_CHANNEL", value: 8, param_type: "uint8", index: 6 },
    SERVO1_FUNCTION: { name: "SERVO1_FUNCTION", value: 4, param_type: "int16", index: 7 },
    SERVO1_MIN: { name: "SERVO1_MIN", value: 1000, param_type: "int16", index: 8 },
    SERVO1_MAX: { name: "SERVO1_MAX", value: 2000, param_type: "int16", index: 9 },
    SERVO1_TRIM: { name: "SERVO1_TRIM", value: 1500, param_type: "int16", index: 10 },
    SERVO2_FUNCTION: { name: "SERVO2_FUNCTION", value: 79, param_type: "int16", index: 11 },
  },
} as const;

const connectedVehicleState = {
  armed: false,
  custom_mode: 5,
  mode_name: "LOITER",
  system_status: "STANDBY",
  vehicle_type: "quadrotor",
  autopilot: "ardupilot",
  system_id: 1,
  component_id: 1,
  heartbeat_received: true,
} as const;

const blockedGuidedState = {
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
} as const;

function streamTelemetry(radio: { rc_channels?: number[]; rc_rssi?: number; servo_outputs?: number[] }) {
  return {
    available: true,
    complete: true,
    provenance: "stream",
    value: { radio },
  };
}

test("setup unlocks from cached metadata, shows live RC/servo state, and records servo actuation without synthetic readback", async ({
  page,
  mockPlatform,
}) => {
  const metadataRequests: string[] = [];

  await page.route("**/Parameters/**/apm.pdef.xml", async (route) => {
    metadataRequests.push(route.request().url());
    await route.abort();
  });

  await page.addInitScript(({ xml, ts }) => {
    window.localStorage.setItem("param_meta_ArduCopter", xml);
    window.localStorage.setItem("param_meta_ArduCopter_ts", String(ts));
  }, {
    xml: ARDUCOPTER_METADATA_XML,
    ts: Date.now(),
  });

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

  const sectionNav = page.locator("main nav").last();
  const rcReceiverButton = sectionNav.getByRole("button", { name: /RC \/ Receiver/ });
  const servoOutputsButton = sectionNav.getByRole("button", { name: /Servo Outputs/ });

  await expect(rcReceiverButton).toBeDisabled();
  await expect(servoOutputsButton).toBeDisabled();
  await expect(page.getByText("Parameters are read from your flight controller")).toBeVisible();

  await mockPlatform.emitParamStore(setupParamStore);
  await mockPlatform.emitParamProgress("completed");

  await expect(rcReceiverButton).toBeEnabled();
  await expect(servoOutputsButton).toBeEnabled();
  await expect(page.getByText("Loading parameter descriptions")).toHaveCount(0);
  await expect(page.getByText("Could not load parameter descriptions")).toHaveCount(0);

  await rcReceiverButton.click();
  await expect(page.getByText("Waiting for live RC channel data.")).toBeVisible();

  const liveEnvelope = await mockPlatform.getLiveEnvelope();
  expect(liveEnvelope).not.toBeNull();

  await mockPlatform.emit("telemetry://state", {
    envelope: liveEnvelope,
    value: streamTelemetry({
      rc_channels: [1100, 1500, 1900],
      rc_rssi: 84,
    }),
  });

  await expect(page.getByText("3 live")).toBeVisible();
  await expect(page.getByText("RSSI 84%")).toBeVisible();
  await expect(page.getByText("1100", { exact: true })).toBeVisible();
  await expect(page.getByText("1900", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Roll mapped to channel 1")).toBeVisible();
  await expect(page.getByLabel("Pitch mapped to channel 2")).toBeVisible();
  await expect(page.getByLabel("Throttle mapped to channel 3")).toBeVisible();
  await expect(page.getByLabel("Yaw mapped to channel 4")).toHaveCount(0);

  await servoOutputsButton.click();
  await expect(page.getByRole("button", { name: "Aileron Left SERVO1" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Aileron Right SERVO2" })).toBeVisible();
  await expect(page.getByText("Waiting for live servo output telemetry before readback can confirm the command.")).toBeVisible();

  await mockPlatform.emit("telemetry://state", {
    envelope: liveEnvelope,
    value: streamTelemetry({
      rc_channels: [1100, 1500, 1900],
      rc_rssi: 84,
      servo_outputs: [1550],
    }),
  });

  await expect(page.getByText("1550 µs", { exact: true })).toBeVisible();
  await expect(page.getByText("Readback comes from telemetry.servo_outputs[0] when the vehicle publishes it.")).toBeVisible();

  const pwmInput = page.getByLabel("Raw PWM input for SERVO1");
  await pwmInput.fill("2500");
  await expect(pwmInput).toHaveValue("2000");

  await page.getByRole("button", { name: "Send PWM" }).click();

  await expect.poll(() => mockPlatform.getInvocations()).toContainEqual(
    expect.objectContaining({
      cmd: "set_servo",
      args: { instance: 1, pwmUs: 2000 },
    }),
  );

  await expect(page.getByText("Last command 2000 µs. Live readback is 1550 µs.")).toBeVisible();
  await expect(page.getByText("1550 µs", { exact: true })).toBeVisible();

  await mockPlatform.emit("telemetry://state", {
    envelope: liveEnvelope,
    value: streamTelemetry({
      rc_channels: [1100, 1500, 1900],
      rc_rssi: 84,
      servo_outputs: [2000],
    }),
  });

  await expect(page.getByText("Last command 2000 µs. Live readback is 2000 µs.")).toBeVisible();
  expect(metadataRequests).toEqual([]);
});
