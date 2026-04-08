import type { ParamMetadataMap } from "../../param-metadata";
import type { ParamStore } from "../../params";
import { isPreArmGood, type SensorHealthDomain } from "../../sensor-health";
import type { StatusMessage, StatusTextDomain } from "../../statustext";
import type { SupportDomain } from "../../support";

export type PrearmBlocker = {
  id: string;
  category: string;
  rawText: string;
  guidance: string;
  source: "status" | "sensor";
  stale: boolean;
};

export type PrearmSnapshot = {
  scopeKey: string;
  blockers: PrearmBlocker[];
};

export type PrearmModelInput = {
  scopeKey: string | null;
  liveConnected: boolean;
  armed: boolean;
  support: SupportDomain | null | undefined;
  sensorHealth: SensorHealthDomain | null | undefined;
  statusText: StatusTextDomain | null | undefined;
  previousSnapshot?: PrearmSnapshot | null;
};

export type PrearmModel = {
  state: "ready" | "blocked" | "stale" | "unknown" | "needs_recheck";
  statusText: string;
  detailText: string;
  blockers: PrearmBlocker[];
  snapshot: PrearmSnapshot | null;
  canRequestChecks: boolean;
  requestChecksBlockedReason: string | null;
  malformedEntriesDropped: boolean;
  canAttemptArm: boolean;
  canAttemptDisarm: boolean;
  armed: boolean;
};

export const ARMING_REQUIRE_OPTIONS = [
  { value: 0, label: "Disabled (no arming required)" },
  { value: 1, label: "Throttle-Yaw-Right (rudder arm)" },
  { value: 2, label: "Arm Switch (RC switch)" },
] as const;

export const PREARM_PATTERNS: { pattern: RegExp; category: string; guidance: string }[] = [
  { pattern: /gps/i, category: "GPS", guidance: "Ensure GPS has clear sky view. Wait for 3D fix and more than 6 satellites." },
  { pattern: /ahrs|ekf/i, category: "EKF", guidance: "Wait for EKF or AHRS convergence before retrying the pre-arm checks." },
  { pattern: /compass|mag/i, category: "Compass", guidance: "Run compass calibration or remove magnetic interference before retrying." },
  { pattern: /accel|gyro|ins/i, category: "IMU", guidance: "Keep the vehicle still and rerun the relevant accelerometer or gyro calibration." },
  { pattern: /rc|throttle/i, category: "RC", guidance: "Check RC calibration, stick trim, and throttle-low state before retrying." },
  { pattern: /batt/i, category: "Battery", guidance: "Check battery connection, voltage, and monitor calibration before retrying." },
  { pattern: /safety/i, category: "Safety", guidance: "Clear the hardware safety switch or other physical interlock before retrying." },
  { pattern: /baro/i, category: "Baro", guidance: "Allow the barometer to settle or inspect the hardware if the warning persists." },
  { pattern: /board|internal/i, category: "Hardware", guidance: "Inspect the flight controller hardware and reboot if the internal fault persists." },
  { pattern: /log/i, category: "Logging", guidance: "Check SD-card logging health and free space before retrying." },
];

const SENSOR_BLOCKER_FALLBACKS: Partial<Record<string, { category: string; guidance: string }>> = {
  gyro: { category: "IMU", guidance: "Gyro health is unhealthy. Keep the vehicle still and rerun the sensor calibration." },
  accel: { category: "IMU", guidance: "Accelerometer health is unhealthy. Rerun the calibration before arming." },
  mag: { category: "Compass", guidance: "Compass health is unhealthy. Recalibrate or remove magnetic interference before retrying." },
  baro: { category: "Baro", guidance: "Barometer health is unhealthy. Allow pressure to settle or inspect the hardware." },
  gps: { category: "GPS", guidance: "GPS health is unhealthy. Wait for lock or inspect the GPS hardware before retrying." },
  rc_receiver: { category: "RC", guidance: "RC receiver health is unhealthy. Rebind or recalibrate the receiver before retrying." },
  battery: { category: "Battery", guidance: "Battery health is unhealthy. Verify pack voltage and monitor calibration before retrying." },
  geofence: { category: "Safety", guidance: "Geofence health is unhealthy. Review fence configuration before retrying." },
};

function trimmedText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function numericIdentity(entry: Pick<StatusMessage, "sequence" | "timestamp_usec">): string {
  if (typeof entry.sequence === "number" && Number.isFinite(entry.sequence)) {
    return `seq:${entry.sequence}`;
  }
  if (typeof entry.timestamp_usec === "number" && Number.isFinite(entry.timestamp_usec)) {
    return `ts:${entry.timestamp_usec}`;
  }
  return "fallback";
}

export function classifyPrearmMessage(text: string, identity: string): PrearmBlocker {
  const stripped = text.replace(/^pre-?arm:\s*/i, "").trim();
  for (const { pattern, category, guidance } of PREARM_PATTERNS) {
    if (pattern.test(stripped)) {
      return {
        id: `${category}-${identity}`,
        category,
        rawText: text,
        guidance,
        source: "status",
        stale: false,
      };
    }
  }

  return {
    id: `Other-${identity}`,
    category: "Other",
    rawText: text,
    guidance: "Review the ArduPilot pre-arm documentation for this blocker before retrying.",
    source: "status",
    stale: false,
  };
}

export function buildArmingRecoveryReasons(input: {
  paramStore: ParamStore | null;
  metadata: ParamMetadataMap | null;
}): string[] {
  const reasons: string[] = [];

  if (input.paramStore?.params.ARMING_CHECK === undefined) {
    reasons.push("ARMING_CHECK is unavailable for this vehicle scope.");
  } else {
    const bitmask = input.metadata?.get("ARMING_CHECK")?.bitmask;
    const validBits = Array.isArray(bitmask)
      ? bitmask.filter((entry) => Number.isInteger(entry.bit) && entry.bit >= 0 && typeof entry.label === "string" && entry.label.trim().length > 0)
      : [];
    if (validBits.length === 0) {
      reasons.push("ARMING_CHECK metadata is missing or malformed, so the pre-arm checklist stays read-only.");
    }
  }

  if (input.paramStore?.params.ARMING_REQUIRE === undefined) {
    reasons.push("ARMING_REQUIRE is unavailable for this vehicle scope.");
  } else {
    const values = input.metadata?.get("ARMING_REQUIRE")?.values;
    const validValues = Array.isArray(values)
      ? values.filter((entry) => Number.isFinite(entry.code) && typeof entry.label === "string" && entry.label.trim().length > 0)
      : [];
    if (validValues.length === 0) {
      reasons.push("ARMING_REQUIRE metadata is missing or malformed, so the arming-method selector stays read-only.");
    }
  }

  return reasons;
}

function selectStatusBlockers(domain: StatusTextDomain | null | undefined): {
  blockers: PrearmBlocker[];
  malformedEntriesDropped: boolean;
} {
  const entries = domain?.value?.entries;
  if (!Array.isArray(entries)) {
    return {
      blockers: [],
      malformedEntriesDropped: entries == null ? false : true,
    };
  }

  const blockers: PrearmBlocker[] = [];
  let malformedEntriesDropped = false;
  const seen = new Set<string>();

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") {
      malformedEntriesDropped = true;
      continue;
    }

    const text = trimmedText((entry as { text?: unknown }).text);
    if (!text) {
      malformedEntriesDropped = true;
      continue;
    }

    const severity = trimmedText((entry as { severity?: unknown }).severity)?.toLowerCase() ?? "";
    const relevant = /pre-?arm/i.test(text)
      || PREARM_PATTERNS.some((pattern) => pattern.pattern.test(text));
    const elevated = severity.includes("warn") || severity.includes("error") || severity.includes("critical") || severity.includes("alert");

    if (!relevant && !elevated) {
      continue;
    }

    const blocker = classifyPrearmMessage(text, numericIdentity(entry as StatusMessage));
    if (seen.has(blocker.id)) {
      continue;
    }

    seen.add(blocker.id);
    blockers.push(blocker);
  }

  return {
    blockers,
    malformedEntriesDropped,
  };
}

function synthesizeSensorBlockers(sensorHealth: SensorHealthDomain | null | undefined): PrearmBlocker[] {
  const health = sensorHealth?.value;
  if (!health || typeof health !== "object") {
    return [];
  }

  const blockers: PrearmBlocker[] = [];
  for (const [key, status] of Object.entries(health)) {
    if (status !== "unhealthy") {
      continue;
    }

    const fallback = SENSOR_BLOCKER_FALLBACKS[key];
    if (!fallback) {
      continue;
    }

    blockers.push({
      id: `${fallback.category}-sensor-${key}`,
      category: fallback.category,
      rawText: `${key} reports unhealthy sensor status`,
      guidance: fallback.guidance,
      source: "sensor",
      stale: false,
    });
  }

  return blockers;
}

function staleSnapshot(snapshot: PrearmSnapshot | null | undefined): PrearmBlocker[] {
  return (snapshot?.blockers ?? []).map((blocker) => ({
    ...blocker,
    stale: true,
  }));
}

export function derivePrearmModel(input: PrearmModelInput): PrearmModel {
  const supportValue = input.support?.value;
  const canRequestChecks = supportValue?.can_request_prearm_checks === true;
  const requestChecksBlockedReason = canRequestChecks
    ? null
    : input.support?.value == null
      ? "Pre-arm check capability is still unavailable for this scope."
      : "This vehicle does not currently support explicit pre-arm check requests.";
  const statusBlockers = selectStatusBlockers(input.statusText);
  const sensorBlockers = synthesizeSensorBlockers(input.sensorHealth);
  const liveBlockers = statusBlockers.blockers.length > 0 ? statusBlockers.blockers : sensorBlockers;
  const scopeMatchesPrevious = Boolean(
    input.scopeKey
    && input.previousSnapshot?.scopeKey
    && input.previousSnapshot.scopeKey === input.scopeKey,
  );
  const canReuseSnapshot = scopeMatchesPrevious
    && liveBlockers.length === 0
    && (!input.liveConnected || input.statusText?.complete === false || input.sensorHealth?.complete === false);
  const blockers = canReuseSnapshot ? staleSnapshot(input.previousSnapshot) : liveBlockers;
  const malformedEntriesDropped = statusBlockers.malformedEntriesDropped;
  const prearmReady = input.sensorHealth?.value ? isPreArmGood(input.sensorHealth.value) : false;

  let state: PrearmModel["state"] = "unknown";
  let statusText = "Pre-arm state unknown";
  let detailText = "Request pre-arm checks on a live vehicle to inspect current blockers before arming.";

  if (malformedEntriesDropped) {
    state = "needs_recheck";
    statusText = "Needs explicit re-check";
    detailText = "Malformed pre-arm status entries were dropped. Request a fresh check before trusting readiness.";
  } else if (blockers.length > 0 && blockers.some((blocker) => blocker.stale)) {
    state = "stale";
    statusText = `Stale blockers · ${blockers.length}`;
    detailText = "Last same-scope blockers are retained while the status feed settles. Request a fresh check before arming.";
  } else if (blockers.length > 0) {
    state = "blocked";
    statusText = `${blockers.length} blocker${blockers.length === 1 ? "" : "s"}`;
    detailText = "Resolve the listed blockers before arming. Refresh the pre-arm checks after each fix.";
  } else if (!input.liveConnected) {
    state = "unknown";
    statusText = input.armed ? "Armed, link degraded" : "Disconnected";
    detailText = input.armed
      ? "Vehicle state last reported armed, but the live link is not connected right now. Reconnect before trusting readiness." 
      : "Connect to a live vehicle before trusting pre-arm readiness.";
  } else if (!canRequestChecks) {
    state = "unknown";
    statusText = "Check requests unavailable";
    detailText = requestChecksBlockedReason ?? "This vehicle does not currently expose pre-arm check requests.";
  } else if (prearmReady) {
    state = "ready";
    statusText = input.armed ? "Armed" : "Ready to arm";
    detailText = input.armed
      ? "Vehicle is already armed. Disarm if conditions become unsafe."
      : "All current pre-arm checks look healthy for this scope. Arm only when the area is clear.";
  }

  return {
    state,
    statusText,
    detailText,
    blockers,
    snapshot: input.scopeKey && blockers.length > 0 && !blockers.some((blocker) => blocker.stale)
      ? {
          scopeKey: input.scopeKey,
          blockers,
        }
      : null,
    canRequestChecks,
    requestChecksBlockedReason,
    malformedEntriesDropped,
    canAttemptArm: input.liveConnected && !input.armed && state === "ready",
    canAttemptDisarm: input.liveConnected && input.armed,
    armed: input.armed,
  };
}
