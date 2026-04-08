import { describe, expect, it } from "vitest";

import type { ParamMetadataMap } from "../../param-metadata";
import type { ParamStore } from "../../params";
import type { SensorHealthDomain } from "../../sensor-health";
import type { StatusTextDomain } from "../../statustext";
import type { SupportDomain } from "../../support";
import {
  ARMING_REQUIRE_OPTIONS,
  PREARM_PATTERNS,
  buildArmingRecoveryReasons,
  classifyPrearmMessage,
  derivePrearmModel,
} from "./prearm-model";

function createParamStore(entries: Record<string, number>): ParamStore {
  const params: ParamStore["params"] = {};
  let index = 0;

  for (const [name, value] of Object.entries(entries)) {
    params[name] = {
      name,
      value,
      param_type: Number.isInteger(value) ? "uint8" : "real32",
      index: index++,
    };
  }

  return {
    expected_count: index,
    params,
  };
}

function createSupport(canRequestPrearmChecks: boolean): SupportDomain {
  return {
    available: true,
    complete: true,
    provenance: "stream",
    value: {
      can_request_prearm_checks: canRequestPrearmChecks,
      can_calibrate_accel: true,
      can_calibrate_compass: true,
      can_calibrate_radio: true,
    },
  };
}

function createSensorHealth(overrides: Partial<NonNullable<SensorHealthDomain["value"]>> = {}): SensorHealthDomain {
  return {
    available: true,
    complete: true,
    provenance: "stream",
    value: {
      gyro: "healthy",
      accel: "healthy",
      mag: "healthy",
      baro: "healthy",
      gps: "healthy",
      airspeed: "not_present",
      rc_receiver: "healthy",
      battery: "healthy",
      terrain: "not_present",
      geofence: "not_present",
      ...overrides,
    },
  };
}

function createStatusText(entries: unknown): StatusTextDomain {
  return {
    available: true,
    complete: true,
    provenance: "stream",
    value: {
      entries: entries as any,
    },
  };
}

describe("prearm-model", () => {
  it("exports the explicit arming-require options", () => {
    expect(ARMING_REQUIRE_OPTIONS).toEqual([
      { value: 0, label: "Disabled (no arming required)" },
      { value: 1, label: "Throttle-Yaw-Right (rudder arm)" },
      { value: 2, label: "Arm Switch (RC switch)" },
    ]);
  });

  it("keeps the full archived pre-arm pattern set", () => {
    expect(PREARM_PATTERNS).toHaveLength(10);
    expect(PREARM_PATTERNS.map((entry) => entry.category)).toContain("GPS");
    expect(PREARM_PATTERNS.map((entry) => entry.category)).toContain("EKF");
    expect(PREARM_PATTERNS.map((entry) => entry.category)).toContain("Compass");
    expect(PREARM_PATTERNS.map((entry) => entry.category)).toContain("Battery");
  });

  it("classifies pre-arm blocker text into guidance categories", () => {
    expect(classifyPrearmMessage("PreArm: GPS not healthy", "100")).toMatchObject({
      category: "GPS",
      id: "GPS-100",
    });
    expect(classifyPrearmMessage("PreArm: AHRS not healthy", "200")).toMatchObject({
      category: "EKF",
    });
    expect(classifyPrearmMessage("PreArm: something unknown", "300")).toMatchObject({
      category: "Other",
    });
  });

  it("builds arming metadata recovery copy when checklist metadata is missing", () => {
    const metadata: ParamMetadataMap = new Map([
      [
        "ARMING_REQUIRE",
        {
          humanName: "Arming method",
          description: "",
          values: [{ code: 1, label: "Rudder" }],
        },
      ],
    ]);

    const reasons = buildArmingRecoveryReasons({
      paramStore: createParamStore({ ARMING_CHECK: 1, ARMING_REQUIRE: 1 }),
      metadata,
    });

    expect(reasons.join(" ")).toContain("ARMING_CHECK metadata is missing or malformed");
  });

  it("derives a ready pre-arm model when the link is live and health is good", () => {
    const model = derivePrearmModel({
      scopeKey: "scope-1",
      liveConnected: true,
      armed: false,
      support: createSupport(true),
      sensorHealth: createSensorHealth(),
      statusText: createStatusText([]),
    });

    expect(model.state).toBe("ready");
    expect(model.canAttemptArm).toBe(true);
    expect(model.blockers).toHaveLength(0);
  });

  it("prefers classified status-text blockers when the vehicle reports them", () => {
    const model = derivePrearmModel({
      scopeKey: "scope-1",
      liveConnected: true,
      armed: false,
      support: createSupport(true),
      sensorHealth: createSensorHealth({ gps: "unhealthy" }),
      statusText: createStatusText([
        { sequence: 1, text: "PreArm: GPS not healthy", severity: "warning" },
        { sequence: 2, text: "Compass not calibrated", severity: "warning" },
      ]),
    });

    expect(model.state).toBe("blocked");
    expect(model.blockers.map((blocker) => blocker.category)).toEqual(["GPS", "Compass"]);
    expect(model.canAttemptArm).toBe(false);
    expect(model.snapshot?.scopeKey).toBe("scope-1");
  });

  it("retains the last same-scope blockers as stale when the status feed goes incomplete", () => {
    const previous = derivePrearmModel({
      scopeKey: "scope-1",
      liveConnected: true,
      armed: false,
      support: createSupport(true),
      sensorHealth: createSensorHealth({ gps: "unhealthy" }),
      statusText: createStatusText([
        { sequence: 1, text: "PreArm: GPS not healthy", severity: "warning" },
      ]),
    });

    const stale = derivePrearmModel({
      scopeKey: "scope-1",
      liveConnected: false,
      armed: false,
      support: createSupport(true),
      sensorHealth: {
        ...createSensorHealth(),
        complete: false,
      },
      statusText: {
        ...createStatusText([]),
        complete: false,
      },
      previousSnapshot: previous.snapshot,
    });

    expect(stale.state).toBe("stale");
    expect(stale.blockers[0]).toMatchObject({ category: "GPS", stale: true });
    expect(stale.detailText).toContain("same-scope blockers");
  });

  it("requires an explicit re-check when malformed status entries are dropped", () => {
    const model = derivePrearmModel({
      scopeKey: "scope-1",
      liveConnected: true,
      armed: false,
      support: createSupport(true),
      sensorHealth: createSensorHealth(),
      statusText: createStatusText([null, { sequence: 1, text: "", severity: "warning" }]),
    });

    expect(model.state).toBe("needs_recheck");
    expect(model.malformedEntriesDropped).toBe(true);
    expect(model.canAttemptArm).toBe(false);
  });

  it("keeps readiness unknown when explicit pre-arm checks are unsupported", () => {
    const model = derivePrearmModel({
      scopeKey: "scope-1",
      liveConnected: true,
      armed: false,
      support: createSupport(false),
      sensorHealth: createSensorHealth(),
      statusText: createStatusText([]),
    });

    expect(model.state).toBe("unknown");
    expect(model.requestChecksBlockedReason).toContain("does not currently support");
    expect(model.canAttemptArm).toBe(false);
  });
});
