import { useState, useCallback, useMemo } from "react";
import {
  Check,
  Circle,
  Satellite,
  Battery,
  MapPin,
  Plane,
  Download,
  ChevronDown,
  ChevronRight,
  Trash2,
  Info,
} from "lucide-react";
import type { VehicleState, Telemetry, HomePosition } from "../../../telemetry";
import type { SensorHealth } from "../../../sensor-health";
import type { WizardStep, WizardStepId, StepStatus } from "../../../hooks/use-setup-wizard";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type ReadinessStepProps = {
  vehicleState: VehicleState | null;
  telemetry: Telemetry | null;
  homePosition: HomePosition | null;
  sensorHealth: SensorHealth | null;
  stepStatuses: Map<WizardStepId, StepStatus>;
  steps: WizardStep[];
};

// ---------------------------------------------------------------------------
// Report types
// ---------------------------------------------------------------------------

type SetupReport = {
  timestamp: string;
  systemId: number;
  vehicleType: string;
  preArmGood: boolean;
  gpsFixType: string | null;
  batteryPct: number | null;
  homeSet: boolean;
  horizonVerified: boolean;
  stepsCompleted: string[];
  stepsRemaining: string[];
};

type StoredReport = {
  key: string;
  report: SetupReport;
};

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

const HORIZON_KEY = "ironwing_horizon_verified";

function getHorizonVerified(): boolean {
  try {
    return localStorage.getItem(HORIZON_KEY) === "true";
  } catch {
    return false;
  }
}

function setHorizonVerified(value: boolean): void {
  localStorage.setItem(HORIZON_KEY, value ? "true" : "false");
}

function getSavedReports(systemId: number): StoredReport[] {
  const results: StoredReport[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(`ironwing_setup_report_${systemId}_`)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      results.push({ key, report: JSON.parse(raw) as SetupReport });
    }
  } catch {
    // Ignore parse errors
  }
  return results.sort((a, b) => b.report.timestamp.localeCompare(a.report.timestamp));
}

// ---------------------------------------------------------------------------
// Live check helpers
// ---------------------------------------------------------------------------

type LiveCheck = {
  label: string;
  ok: boolean;
  detail: string;
  icon: typeof Satellite;
};

function computeLiveChecks(
  telemetry: Telemetry | null,
  homePosition: HomePosition | null,
): LiveCheck[] {
  const gpsOk =
    telemetry?.gps_fix_type != null &&
    ["fix_3d", "dgps", "rtk_float", "rtk_fixed"].includes(telemetry.gps_fix_type);

  const batteryOk =
    telemetry?.battery_pct != null && telemetry.battery_pct > 20;

  const homeOk = homePosition !== null;

  return [
    {
      label: "GPS Lock",
      ok: gpsOk,
      detail: telemetry?.gps_fix_type
        ? `${telemetry.gps_fix_type}${telemetry.gps_satellites != null ? ` (${telemetry.gps_satellites} sats)` : ""}`
        : "No fix",
      icon: Satellite,
    },
    {
      label: "Battery",
      ok: batteryOk,
      detail: telemetry?.battery_pct != null
        ? `${Math.round(telemetry.battery_pct)}%`
        : "Unknown",
      icon: Battery,
    },
    {
      label: "Home Position",
      ok: homeOk,
      detail: homeOk
        ? `${homePosition.latitude_deg.toFixed(6)}, ${homePosition.longitude_deg.toFixed(6)}`
        : "Not set",
      icon: MapPin,
    },
  ];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReadinessStep({
  vehicleState,
  telemetry,
  homePosition,
  sensorHealth,
  stepStatuses,
  steps,
}: ReadinessStepProps) {
  const [horizonOk, setHorizonOk] = useState(getHorizonVerified);
  const [showReports, setShowReports] = useState(false);
  const [savedReports, setSavedReports] = useState<StoredReport[]>(() =>
    getSavedReports(vehicleState?.system_id ?? 0),
  );

  const liveChecks = computeLiveChecks(telemetry, homePosition);

  const completedSteps = useMemo(
    () => steps.filter((s) => stepStatuses.get(s.id) === "complete"),
    [steps, stepStatuses],
  );
  const remainingSteps = useMemo(
    () => steps.filter((s) => stepStatuses.get(s.id) !== "complete"),
    [steps, stepStatuses],
  );

  const allStepsComplete = remainingSteps.length === 0;
  const allLiveOk = liveChecks.every((c) => c.ok);
  const isReady = allStepsComplete && allLiveOk && (sensorHealth?.pre_arm_good ?? false);

  // Horizon verified toggle
  const handleHorizon = useCallback((value: boolean) => {
    setHorizonOk(value);
    setHorizonVerified(value);
  }, []);

  // Save report
  const saveReport = useCallback(() => {
    const sysId = vehicleState?.system_id ?? 0;
    const report: SetupReport = {
      timestamp: new Date().toISOString(),
      systemId: sysId,
      vehicleType: vehicleState?.vehicle_type ?? "unknown",
      preArmGood: sensorHealth?.pre_arm_good ?? false,
      gpsFixType: telemetry?.gps_fix_type ?? null,
      batteryPct: telemetry?.battery_pct ?? null,
      homeSet: homePosition !== null,
      horizonVerified: horizonOk,
      stepsCompleted: completedSteps.map((s) => s.label),
      stepsRemaining: remainingSteps.map((s) => s.label),
    };

    const key = `ironwing_setup_report_${sysId}_${Date.now()}`;
    localStorage.setItem(key, JSON.stringify(report));
    setSavedReports(getSavedReports(sysId));
  }, [vehicleState, sensorHealth, telemetry, homePosition, horizonOk, completedSteps, remainingSteps]);

  // Delete report
  const deleteReport = useCallback(
    (key: string) => {
      localStorage.removeItem(key);
      setSavedReports(getSavedReports(vehicleState?.system_id ?? 0));
    },
    [vehicleState],
  );

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* Readiness verdict */}
      <div
        className={`rounded-lg border p-4 ${
          isReady
            ? "border-success/30 bg-success/5"
            : "border-warning/30 bg-warning/5"
        }`}
      >
        <div className="flex items-center gap-3">
          <span
            className={`flex h-10 w-10 items-center justify-center rounded-full ${
              isReady ? "bg-success/15" : "bg-warning/15"
            }`}
          >
            <Plane
              size={20}
              className={isReady ? "text-success" : "text-warning"}
            />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">
              {isReady
                ? "Ready for First Flight"
                : `${remainingSteps.length} step${remainingSteps.length !== 1 ? "s" : ""} remaining`}
            </h3>
            <p className="text-[11px] text-text-muted">
              {isReady
                ? "All checks passed. Review the first-flight guidance below."
                : "Complete all steps and live checks for full readiness."}
            </p>
          </div>
        </div>
      </div>

      {/* Step completion checklist */}
      <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          Wizard Steps
        </h4>
        <div className="flex flex-col gap-1">
          {steps.map((step) => {
            const status = stepStatuses.get(step.id) ?? "idle";
            const done = status === "complete";
            return (
              <div
                key={step.id}
                className="flex items-center gap-2.5 rounded px-2 py-1.5 text-xs"
              >
                {done ? (
                  <Check size={14} strokeWidth={2.5} className="shrink-0 text-success" />
                ) : (
                  <Circle size={14} strokeWidth={1.5} className="shrink-0 text-text-muted" />
                )}
                <span
                  className={`font-medium ${done ? "text-success" : "text-text-secondary"}`}
                >
                  {step.label}
                </span>
                {step.required && !done && (
                  <span className="ml-auto text-[9px] text-warning">required</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Live readiness checks */}
      <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          Live Checks
        </h4>
        <div className="flex flex-col gap-1.5">
          {liveChecks.map((check) => (
            <div key={check.label} className="flex items-center gap-2.5 rounded px-2 py-1.5 text-xs">
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full ${
                  check.ok ? "bg-success/15" : "bg-bg-secondary"
                }`}
              >
                <check.icon
                  size={12}
                  className={check.ok ? "text-success" : "text-text-muted"}
                />
              </span>
              <span className={`font-medium ${check.ok ? "text-success" : "text-text-secondary"}`}>
                {check.label}
              </span>
              <span className="ml-auto text-[10px] text-text-muted">{check.detail}</span>
              {/* Live indicator dot */}
              <span
                className={`h-1.5 w-1.5 rounded-full ${check.ok ? "bg-success animate-pulse" : "bg-text-muted/30"}`}
              />
            </div>
          ))}

          {/* Horizon verification */}
          <div className="flex items-center gap-2.5 rounded px-2 py-1.5 text-xs">
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full ${
                horizonOk ? "bg-success/15" : "bg-bg-secondary"
              }`}
            >
              <Check
                size={12}
                className={horizonOk ? "text-success" : "text-text-muted"}
              />
            </span>
            <span className={`font-medium ${horizonOk ? "text-success" : "text-text-secondary"}`}>
              Level Horizon
            </span>
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={() => handleHorizon(true)}
                className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                  horizonOk
                    ? "bg-success/15 text-success"
                    : "bg-bg-secondary text-text-muted hover:bg-bg-tertiary"
                }`}
              >
                Yes
              </button>
              <button
                onClick={() => handleHorizon(false)}
                className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                  !horizonOk
                    ? "bg-danger/15 text-danger"
                    : "bg-bg-secondary text-text-muted hover:bg-bg-tertiary"
                }`}
              >
                No
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Save report */}
      <div className="flex items-center gap-2">
        <button
          onClick={saveReport}
          className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
        >
          <Download size={12} />
          Save Setup Report
        </button>
      </div>

      {/* Previous reports */}
      {savedReports.length > 0 && (
        <div className="rounded-lg border border-border bg-bg-tertiary/50">
          <button
            onClick={() => setShowReports(!showReports)}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-xs font-medium text-text-secondary hover:bg-bg-secondary/50 transition-colors"
          >
            {showReports ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            View Previous Reports ({savedReports.length})
          </button>
          {showReports && (
            <div className="border-t border-border px-4 py-2 flex flex-col gap-1.5 max-h-48 overflow-y-auto">
              {savedReports.map(({ key, report }) => (
                <div key={key} className="flex items-center gap-2 text-[11px]">
                  <span className="text-text-muted font-mono">
                    {new Date(report.timestamp).toLocaleDateString()}{" "}
                    {new Date(report.timestamp).toLocaleTimeString()}
                  </span>
                  <span className={`font-medium ${report.preArmGood ? "text-success" : "text-warning"}`}>
                    {report.preArmGood ? "Ready" : "Not Ready"}
                  </span>
                  <span className="text-text-muted">
                    {report.stepsCompleted.length}/{report.stepsCompleted.length + report.stepsRemaining.length} steps
                  </span>
                  <button
                    onClick={() => deleteReport(key)}
                    className="ml-auto p-0.5 text-text-muted hover:text-danger"
                    title="Delete report"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* First-flight guidance */}
      <div className="rounded-lg border border-border-light bg-accent/5 p-4">
        <div className="mb-2 flex items-center gap-2">
          <Info size={14} className="text-accent" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            First Flight Guidance
          </h4>
        </div>
        <ul className="flex flex-col gap-1.5 text-[11px] text-text-secondary leading-relaxed">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 h-1 w-1 shrink-0 rounded-full bg-text-muted" />
            Start in Stabilize or AltHold. Progress to Loiter once comfortable, then test RTL.
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 h-1 w-1 shrink-0 rounded-full bg-text-muted" />
            Keep the vehicle within line of sight for the first few flights.
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 h-1 w-1 shrink-0 rounded-full bg-text-muted" />
            Verify RTL behavior at low altitude before flying further away.
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 h-1 w-1 shrink-0 rounded-full bg-text-muted" />
            Review logs after each flight to check for vibration or EKF issues.
          </li>
        </ul>
      </div>
    </div>
  );
}
