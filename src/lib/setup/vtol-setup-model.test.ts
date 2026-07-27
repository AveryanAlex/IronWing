import { describe, expect, it } from "vitest";

import type { ParamStore } from "../../params";
import { buildVtolSetupModel } from "./vtol-setup-model";

function createParamStore(entries: Record<string, number>): ParamStore {
  const params: ParamStore["params"] = {};
  let index = 0;
  for (const [name, value] of Object.entries(entries)) {
    params[name] = { name, value, param_type: "real32", index: index++ };
  }
  return { params, expected_count: index };
}

function model(
  entries: Record<string, number>,
  stagedEntries: Record<string, number> = {},
  vehicleType = "Fixed_Wing",
) {
  return buildVtolSetupModel({
    vehicleType,
    paramStore: createParamStore(entries),
    stagedEdits: Object.fromEntries(
      Object.entries(stagedEntries).map(([name, nextValue]) => [name, { nextValue }]),
    ),
  });
}

const readyEntries = {
  Q_ENABLE: 1,
  Q_FRAME_CLASS: 1,
  Q_FRAME_TYPE: 1,
  Q_M_PWM_MIN: 1000,
  Q_M_PWM_MAX: 2000,
  Q_M_SPIN_ARM: 0.1,
  Q_M_SPIN_MIN: 0.15,
  Q_M_THST_HOVER: 0.25,
  Q_A_RAT_RLL_P: 0.25,
  Q_A_RAT_PIT_P: 0.25,
  Q_WP_SPEED: 5,
  Q_RTL_MODE: 1,
  Q_RTL_ALT: 15,
  FLTMODE1: 17,
  ARSPD_TYPE: 2,
  ARSPD_USE: 1,
  AIRSPEED_MIN: 12,
  Q_ASSIST_SPEED: 9,
};

describe("buildVtolSetupModel", () => {
  it("keeps non-Plane vehicles explicitly not applicable", () => {
    const result = model({ FRAME_CLASS: 1, FRAME_TYPE: 1 }, {}, "quadrotor");

    expect(result.applicable).toBe(false);
    expect(result.stateText).toBe("Plane firmware required");
    expect(result.handoffs.every((handoff) => handoff.state === "not_applicable")).toBe(true);
  });

  it("models the enable, reboot, and refresh gate", () => {
    const result = model({ Q_ENABLE: 0 }, { Q_ENABLE: 1 });

    expect(result.stateText).toBe("VTOL enable pending");
    expect(result.profile.rebootRequiredBeforeTesting).toBe(true);
    expect(result.handoffs.every((handoff) => handoff.state === "blocked")).toBe(true);
    expect(result.notices.map((notice) => notice.id)).toContain("refresh-required");
  });

  it("reports a complete standard QuadPlane workflow and its handoffs", () => {
    const result = model(readyEntries);

    expect(result.stateText).toBe("QuadPlane ready");
    expect(result.profile.subtype).toBe("standard");
    expect(result.handoffs.map((handoff) => [handoff.id, handoff.state])).toEqual([
      ["powertrain", "available"],
      ["tuning", "available"],
      ["flight_modes", "available"],
      ["navigation", "available"],
      ["return", "available"],
    ]);
  });

  it("treats zero assist speed as unfinished and derives a contextual suggestion", () => {
    const result = model({ ...readyEntries, Q_ASSIST_SPEED: 0 });

    expect(result.assist.state).toBe("needs_decision");
    expect(result.assist.suggestedSpeedMps).toBe(9);
    expect(result.notices.map((notice) => notice.id)).toContain("assist-decision");
  });

  it("uses staged assist and sensor values when deriving warnings", () => {
    const result = model(
      { ...readyEntries, Q_ASSIST_SPEED: -1, ARSPD_TYPE: 0 },
      { Q_ASSIST_SPEED: 8 },
    );

    expect(result.assist.state).toBe("active");
    expect(result.assist.value).toBe(8);
    expect(result.assist.airspeedSensorConfigured).toBe(false);
    expect(result.notices.map((notice) => notice.id)).toContain("synthetic-airspeed");
  });

  it("flags conflicting tiltrotor and tailsitter subtypes", () => {
    const result = model({
      ...readyEntries,
      Q_TILT_ENABLE: 1,
      Q_TAILSIT_ENABLE: 1,
    });

    expect(result.profile.subtype).toBe("compound");
    expect(result.stateText).toBe("Conflicting VTOL subtype");
    expect(result.notices).toContainEqual(expect.objectContaining({ id: "compound-subtype", tone: "danger" }));
  });
});
