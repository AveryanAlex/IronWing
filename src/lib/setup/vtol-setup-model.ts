import type { ParamStore } from "../../params";
import { deriveVehicleProfile, type VehicleProfile } from "./vehicle-profile";

export type VtolAssistState = "unavailable" | "needs_decision" | "disabled" | "active" | "invalid";
export type VtolHandoffState = "available" | "needs_setup" | "blocked" | "not_applicable";

export type VtolSetupNotice = {
  id: string;
  tone: "info" | "warning" | "danger";
  text: string;
};

export type VtolSetupHandoff = {
  id: "powertrain" | "tuning" | "flight_modes" | "navigation" | "return";
  title: string;
  sectionId: "motors_esc" | "pid_tuning" | "flight_modes" | "navigation" | "rtl_return";
  state: VtolHandoffState;
  stateText: string;
  detailText: string;
};

export type VtolAssistModel = {
  state: VtolAssistState;
  stateText: string;
  detailText: string;
  value: number | null;
  minimumAirspeedMps: number | null;
  suggestedSpeedMps: number | null;
  airspeedSensorConfigured: boolean | null;
};

export type VtolSetupModel = {
  profile: VehicleProfile;
  applicable: boolean;
  stateText: string;
  detailText: string;
  assist: VtolAssistModel;
  handoffs: VtolSetupHandoff[];
  notices: VtolSetupNotice[];
};

type VtolSetupModelInput = {
  vehicleType: string | null;
  paramStore: ParamStore | null;
  stagedEdits: Record<string, { nextValue: number } | undefined>;
};

const VTOL_FLIGHT_MODE_VALUES = new Set([17, 18, 19, 20, 21, 23, 25]);

function stagedOrCurrentValue(input: VtolSetupModelInput, ...names: string[]): number | null {
  for (const name of names) {
    const stagedValue = input.stagedEdits[name]?.nextValue;
    if (typeof stagedValue === "number" && Number.isFinite(stagedValue)) {
      return stagedValue;
    }

    const currentValue = input.paramStore?.params[name]?.value;
    if (typeof currentValue === "number" && Number.isFinite(currentValue)) {
      return currentValue;
    }
  }

  return null;
}

function hasAnyParam(input: VtolSetupModelInput, ...names: string[]): boolean {
  return names.some((name) => input.paramStore?.params[name] !== undefined);
}

function hasAllParams(input: VtolSetupModelInput, names: readonly string[]): boolean {
  return names.every((name) => input.paramStore?.params[name] !== undefined);
}

function buildAssistModel(input: VtolSetupModelInput): VtolAssistModel {
  const value = stagedOrCurrentValue(input, "Q_ASSIST_SPEED");
  const minimumAirspeedMps = stagedOrCurrentValue(input, "AIRSPEED_MIN", "ARSPD_FBW_MIN");
  const airspeedType = stagedOrCurrentValue(input, "ARSPD_TYPE");
  const airspeedUse = stagedOrCurrentValue(input, "ARSPD_USE");
  const airspeedSensorConfigured = airspeedType === null
    ? null
    : airspeedType > 0 && (airspeedUse === null || airspeedUse > 0);
  const suggestedSpeedMps = minimumAirspeedMps !== null && minimumAirspeedMps > 3
    ? Number((minimumAirspeedMps - 3).toFixed(1))
    : null;

  if (value === null) {
    return {
      state: "unavailable",
      stateText: "Assist unavailable",
      detailText: "This firmware has not exposed Q_ASSIST_SPEED for the active parameter scope.",
      value,
      minimumAirspeedMps,
      suggestedSpeedMps,
      airspeedSensorConfigured,
    };
  }

  if (value === -1) {
    return {
      state: "disabled",
      stateText: "Deliberately disabled",
      detailText: "Fixed-wing QAssist is disabled; transition assistance remains available.",
      value,
      minimumAirspeedMps,
      suggestedSpeedMps,
      airspeedSensorConfigured,
    };
  }

  if (value === 0) {
    return {
      state: "needs_decision",
      stateText: "Decision required",
      detailText: "ArduPilot treats zero as unfinished setup and reports a pre-arm warning.",
      value,
      minimumAirspeedMps,
      suggestedSpeedMps,
      airspeedSensorConfigured,
    };
  }

  if (value > 0) {
    return {
      state: "active",
      stateText: `Automatic below ${value} m/s`,
      detailText: "Lift and stability assistance can activate below this fixed-wing airspeed threshold.",
      value,
      minimumAirspeedMps,
      suggestedSpeedMps,
      airspeedSensorConfigured,
    };
  }

  return {
    state: "invalid",
    stateText: "Invalid assist value",
    detailText: "Use -1 to disable assistance deliberately, or a positive airspeed threshold to enable it.",
    value,
    minimumAirspeedMps,
    suggestedSpeedMps,
    airspeedSensorConfigured,
  };
}

function hasConfiguredVtolFlightMode(input: VtolSetupModelInput): boolean {
  return Object.values(input.paramStore?.params ?? {}).some((param) =>
    /^FLTMODE\d+$/.test(param.name)
    && typeof param.value === "number"
    && VTOL_FLIGHT_MODE_VALUES.has(param.value),
  );
}

function buildHandoffs(input: VtolSetupModelInput, profile: VehicleProfile): VtolSetupHandoff[] {
  const blocked = profile.planeVtolState !== "vtol-ready";
  const powertrainAvailable = hasAllParams(input, [
    "Q_M_PWM_MIN",
    "Q_M_PWM_MAX",
    "Q_M_SPIN_ARM",
    "Q_M_SPIN_MIN",
    "Q_M_THST_HOVER",
  ]);
  const tuningAvailable = hasAllParams(input, ["Q_A_RAT_RLL_P", "Q_A_RAT_PIT_P"]);
  const navigationAvailable = hasAnyParam(input, "Q_WP_SPD", "Q_WP_SPEED");
  const returnAvailable = hasAllParams(input, ["Q_RTL_MODE", "Q_RTL_ALT"]);
  const flightModesConfigured = hasConfiguredVtolFlightMode(input);

  if (!profile.isPlane) {
    return [
      handoff("powertrain", "VTOL powertrain", "motors_esc", "not_applicable", "Not applicable", "VTOL lift-motor setup is available only on Plane firmware."),
      handoff("tuning", "VTOL tuning", "pid_tuning", "not_applicable", "Not applicable", "No QuadPlane controller family is active."),
      handoff("flight_modes", "VTOL flight modes", "flight_modes", "not_applicable", "Not applicable", "No QuadPlane flight-mode family is active."),
      handoff("navigation", "VTOL navigation", "navigation", "not_applicable", "Not applicable", "No VTOL waypoint controller is active."),
      handoff("return", "VTOL return", "rtl_return", "not_applicable", "Not applicable", "No VTOL return profile is active."),
    ];
  }

  return [
    handoff(
      "powertrain",
      "VTOL powertrain",
      "motors_esc",
      blocked ? "blocked" : powertrainAvailable ? "available" : "needs_setup",
      blocked ? "Waiting for refresh" : powertrainAvailable ? "Parameters available" : "Settings missing",
      blocked
        ? "Enable QuadPlane and refresh its parameter family before configuring lift motors."
        : "Configure ESC output, motor idle, thrust response, and guarded motor tests in Motors & ESC.",
    ),
    handoff(
      "tuning",
      "VTOL tuning",
      "pid_tuning",
      blocked ? "blocked" : tuningAvailable ? "available" : "needs_setup",
      blocked ? "Waiting for refresh" : tuningAvailable ? "Controllers available" : "Controller rows missing",
      "Use Initial Parameters for the baseline, then tune hover rate and position controllers in PID Tuning.",
    ),
    handoff(
      "flight_modes",
      "VTOL flight modes",
      "flight_modes",
      blocked ? "blocked" : flightModesConfigured ? "available" : "needs_setup",
      blocked ? "Waiting for refresh" : flightModesConfigured ? "Q mode assigned" : "No Q mode assigned",
      "Keep QSTABILIZE available for the first hover and add QHOVER or QLOITER only after basic stability is verified.",
    ),
    handoff(
      "navigation",
      "VTOL navigation",
      "navigation",
      blocked ? "blocked" : navigationAvailable ? "available" : "needs_setup",
      blocked ? "Waiting for refresh" : navigationAvailable ? "Guidance available" : "Guidance rows missing",
      "VTOL waypoint speed, acceleration, and Guided behavior live with the rest of Navigation.",
    ),
    handoff(
      "return",
      "VTOL return",
      "rtl_return",
      blocked ? "blocked" : returnAvailable ? "available" : "needs_setup",
      blocked ? "Waiting for refresh" : returnAvailable ? "Return profile available" : "Return rows missing",
      "Review hybrid RTL, QRTL altitude, approach, and final descent behavior in RTL / Return.",
    ),
  ];
}

function handoff(
  id: VtolSetupHandoff["id"],
  title: string,
  sectionId: VtolSetupHandoff["sectionId"],
  state: VtolHandoffState,
  stateText: string,
  detailText: string,
): VtolSetupHandoff {
  return { id, title, sectionId, state, stateText, detailText };
}

function profileStateText(profile: VehicleProfile): { stateText: string; detailText: string } {
  if (!profile.isPlane) {
    return {
      stateText: "Plane firmware required",
      detailText: "This section configures ArduPilot QuadPlane vehicles and does not apply to the active vehicle family.",
    };
  }

  switch (profile.planeVtolState) {
    case "enable-pending":
      return {
        stateText: "VTOL enable pending",
        detailText: "Apply Q_ENABLE, reboot the vehicle, and refresh parameters before continuing.",
      };
    case "awaiting-refresh":
      return {
        stateText: "VTOL refresh required",
        detailText: "QuadPlane is enabled, but the frame and controller parameter families have not arrived yet.",
      };
    case "partial-refresh":
      return {
        stateText: "VTOL parameters incomplete",
        detailText: "Only part of the Q_FRAME family is available; refresh before changing topology or testing motors.",
      };
    case "vtol-ready":
      return {
        stateText: profile.subtype === "tiltrotor"
          ? "Tiltrotor ready"
          : profile.subtype === "tailsitter"
            ? "Tailsitter ready"
            : profile.subtype === "compound"
              ? "Conflicting VTOL subtype"
              : "QuadPlane ready",
        detailText: "The refreshed VTOL parameter family is available for guided configuration.",
      };
    case "plain-plane":
    default:
      return {
        stateText: "QuadPlane disabled",
        detailText: "Enable Q_ENABLE to expose VTOL frame, motor, transition, and tuning settings.",
      };
  }
}

export function buildVtolSetupModel(input: VtolSetupModelInput): VtolSetupModel {
  const profile = deriveVehicleProfile(input.vehicleType, {
    paramStore: input.paramStore,
    stagedEdits: input.stagedEdits,
  });
  const assist = buildAssistModel(input);
  const profileState = profileStateText(profile);
  const notices: VtolSetupNotice[] = [];

  if (!profile.isPlane) {
    notices.push({
      id: "vehicle-family",
      tone: "info",
      text: "Connect a Plane or VTOL vehicle to configure QuadPlane settings here.",
    });
  } else if (profile.planeVtolState === "enable-pending" || profile.planeVtolState === "awaiting-refresh") {
    notices.push({
      id: "refresh-required",
      tone: "warning",
      text: "Finish the apply, reboot, and parameter refresh checkpoint before continuing with VTOL setup.",
    });
  } else if (profile.planeVtolState === "partial-refresh") {
    notices.push({
      id: "partial-refresh",
      tone: "warning",
      text: "The current scope has only part of the Q_FRAME family. Topology-dependent editing and tests remain unsafe.",
    });
  }

  if (profile.hasUnsupportedSubtype) {
    notices.push({
      id: "compound-subtype",
      tone: "danger",
      text: "Tiltrotor and tailsitter flags are both active. Confirm the airframe and refresh parameters before testing outputs.",
    });
  }

  if (profile.planeVtolState === "vtol-ready" && assist.state === "needs_decision") {
    notices.push({
      id: "assist-decision",
      tone: "warning",
      text: "Q_ASSIST_SPEED is zero. Choose deliberate disable or a positive automatic-assistance threshold before flight.",
    });
  }

  if (assist.state === "active" && assist.airspeedSensorConfigured === false) {
    notices.push({
      id: "synthetic-airspeed",
      tone: "warning",
      text: "Automatic QAssist is using synthetic airspeed because no active airspeed sensor is configured. False activations are possible.",
    });
  }

  return {
    profile,
    applicable: profile.isPlane,
    ...profileState,
    assist,
    handoffs: buildHandoffs(input, profile),
    notices,
  };
}
