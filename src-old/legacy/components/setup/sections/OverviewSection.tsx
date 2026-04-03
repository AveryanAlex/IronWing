import { useState, useCallback, useEffect, useRef } from "react";
import {
  Check,
  X,
  Satellite,
  Battery,
  Radio,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  Save,
  FolderOpen,
  Power,
  PowerOff,
  ChevronRight,
  AlertTriangle,
  Minus,
  Unplug,
  Download,
  RotateCw,
  Wifi,
  WifiOff,
  MapPin,
  Loader2,
  BookX,
  type LucideIcon,
} from "lucide-react";
import { resolveDocsUrl } from "../../../data/ardupilot-docs";
import { armVehicle, disarmVehicle } from "../../../telemetry";
import type { VehicleState, Telemetry, HomePosition, LinkState } from "../../../telemetry";
import { rebootVehicle } from "../../../calibration";
import { isPreArmGood, SENSOR_KEYS, type SensorHealth, type SensorId, type SensorStatus } from "../../../sensor-health";
import type { SupportDomain } from "../../../support";
import type { SetupSectionId, SectionStatus, OverallProgress } from "../../../hooks/use-setup-sections";
import type { ParamsState } from "../../../hooks/use-params";
import { paramProgressCounts, paramProgressPhase } from "../../../params";
import { SETUP_SECTIONS, SECTION_GROUPS } from "../SetupSectionPanel";
import { ParamDisplay } from "../primitives/ParamDisplay";
import type { ParamInputParams } from "../primitives/param-helpers";
import { SectionStatusIcon } from "../shared/SectionStatusIcon";
import { DocsLink } from "../shared/DocsLink";
import { getVehicleSlug } from "../shared/vehicle-helpers";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type OverviewSectionProps = {
  connected: boolean;
  vehicleState: VehicleState | null;
  telemetry: Telemetry | null;
  linkState: LinkState | null;
  support: SupportDomain;
  sensorHealth: SensorHealth | null;
  homePosition: HomePosition | null;
  params: ParamsState;
  sectionStatuses: Map<SetupSectionId, SectionStatus>;
  overallProgress: OverallProgress;
  onNavigateSection: (id: SetupSectionId) => void;
};

// ---------------------------------------------------------------------------
// Sensor helpers (reused from InspectionStep patterns)
// ---------------------------------------------------------------------------

const SENSOR_NAMES: Record<SensorId, string> = {
  gyro: "Gyroscope",
  accel: "Accelerometer",
  mag: "Compass",
  baro: "Barometer",
  gps: "GPS",
  airspeed: "Airspeed",
  rc_receiver: "RC Receiver",
  battery: "Battery",
  terrain: "Terrain",
  geofence: "Geofence",
};

const KEY_SENSORS: readonly SensorId[] = [
  "gyro",
  "accel",
  "mag",
  "baro",
  "gps",
  "rc_receiver",
  "battery",
];

function SensorStatusIcon({ status }: { status: SensorStatus }) {
  switch (status) {
    case "healthy":
      return <Check size={12} strokeWidth={2.5} className="text-success" />;
    case "unhealthy":
      return <X size={12} strokeWidth={2.5} className="text-danger" />;
    case "disabled":
      return <AlertTriangle size={12} strokeWidth={2} className="text-warning" />;
    case "not_present":
      return <Minus size={12} strokeWidth={2} className="text-text-muted" />;
  }
}

function sensorStatusLabel(status: SensorStatus): string {
  switch (status) {
    case "healthy":
      return "OK";
    case "unhealthy":
      return "Fail";
    case "disabled":
      return "Off";
    case "not_present":
      return "N/A";
  }
}

function sensorStatusColor(status: SensorStatus): string {
  switch (status) {
    case "healthy":
      return "text-success";
    case "unhealthy":
      return "text-danger";
    case "disabled":
      return "text-warning";
    case "not_present":
      return "text-text-muted";
  }
}

import {
  categoryIcon,
} from "../shared/prearm-helpers";
import { usePrearmChecks } from "../shared/use-prearm-checks";

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

function fmt(value: number | undefined, decimals = 1): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "--";
  return value.toFixed(decimals);
}

function formatVehicleType(raw: string): string {
  return raw
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function linkStateLabel(ls: LinkState | null): string {
  if (ls === null) return "Unknown";
  if (ls === "connected") return "Connected";
  if (ls === "connecting") return "Connecting";
  if (ls === "disconnected") return "Disconnected";
  if (typeof ls === "object" && "error" in ls) return "Error";
  return "Unknown";
}

function linkStateOk(ls: LinkState | null): boolean {
  return ls === "connected";
}

// ---------------------------------------------------------------------------
// ParamInputParams builder
// ---------------------------------------------------------------------------

function buildParamInputParams(params: ParamsState): ParamInputParams {
  return {
    store: params.store,
    staged: params.staged,
    metadata: params.metadata,
    stage: params.stage,
  };
}

// ---------------------------------------------------------------------------
// Sub-sections
// ---------------------------------------------------------------------------

function ProgressHeader({ progress }: { progress: OverallProgress }) {
  return (
    <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          Setup Progress
        </h3>
        <span className="text-sm font-semibold text-text-primary">
          {progress.completed}
          <span className="text-text-muted">/{progress.total}</span>
          <span className="ml-1.5 text-xs text-text-muted">{progress.percentage}%</span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-bg-secondary">
        <div
          className="h-full rounded-full bg-accent transition-all duration-500"
          style={{ width: `${progress.percentage}%` }}
        />
      </div>
    </div>
  );
}

function VehicleInfoCard({
  vehicleState,
  params,
}: {
  vehicleState: VehicleState | null;
  params: ParamsState;
}) {
  if (!vehicleState) {
    return (
      <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4 text-sm text-text-muted">
        Waiting for vehicle heartbeat...
      </div>
    );
  }

  const pip = buildParamInputParams(params);
  const hasParams = params.store !== null;

  return (
    <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
        Vehicle
      </h3>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
        <InfoField label="Type" value={formatVehicleType(vehicleState.vehicle_type)} />
        <InfoField label="Autopilot" value={formatVehicleType(vehicleState.autopilot)} />
        <InfoField label="System ID" value={String(vehicleState.system_id)} />
        <InfoField label="Mode" value={vehicleState.mode_name || "Unknown"} />
        <InfoField
          label="Armed"
          value={vehicleState.armed ? "Armed" : "Disarmed"}
          valueClass={vehicleState.armed ? "text-danger" : "text-success"}
        />
        <InfoField label="Status" value={formatVehicleType(vehicleState.system_status)} />
      </div>
      {hasParams && (
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 border-t border-border pt-3 sm:grid-cols-3">
          <ParamDisplay paramName="FRAME_CLASS" params={pip} label="Frame Class" />
          <ParamDisplay paramName="BATT_MONITOR" params={pip} label="Battery Monitor" />
          <ParamDisplay paramName="ARMING_CHECK" params={pip} label="Arming Checks" />
        </div>
      )}
    </div>
  );
}

function InfoField({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-text-muted">{label}</span>
      <span className={`text-sm font-medium ${valueClass ?? "text-text-primary"}`}>{value}</span>
    </div>
  );
}

function QuickActions({
  connected,
  params,
}: {
  connected: boolean;
  params: ParamsState;
}) {
  const [rebooting, setRebooting] = useState(false);
  const lingerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  // Snapshot of the last known counts — preserved for the completion linger window,
  // since paramProgressCounts returns null for terminal states like "completed".
  const lastCountsRef = useRef<{ received: number; expected: number | null } | null>(null);

  const phase = params.progress ? paramProgressPhase(params.progress) : null;
  const isDownloading = phase === "downloading";
  const counts = params.progress ? paramProgressCounts(params.progress) : null;
  if (counts !== null) lastCountsRef.current = counts;

  // Linger "completed" state for 1.5s, clear timer on transition away
  useEffect(() => {
    if (phase === "completed") {
      setShowCompleted(true);
      lingerTimerRef.current = setTimeout(() => {
        setShowCompleted(false);
        lingerTimerRef.current = null;
      }, 1500);
    } else {
      if (lingerTimerRef.current) {
        clearTimeout(lingerTimerRef.current);
        lingerTimerRef.current = null;
      }
      setShowCompleted(false);
    }
    return () => {
      if (lingerTimerRef.current) {
        clearTimeout(lingerTimerRef.current);
        lingerTimerRef.current = null;
      }
    };
  }, [phase]);

  const handleReboot = useCallback(async () => {
    if (!connected) return;
    setRebooting(true);
    try {
      await rebootVehicle();
    } catch {
      // reboot errors are expected as connection drops
    } finally {
      setRebooting(false);
    }
  }, [connected]);

  const progressPct =
    counts && counts.expected
      ? Math.round((counts.received / counts.expected) * 100)
      : isDownloading
        ? 0
        : 100;

  return (
    <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
        Quick Actions
      </h3>
      <div className="flex flex-wrap gap-2">
        {isDownloading ? (
          <button
            onClick={() => params.cancel()}
            className="flex items-center gap-1.5 rounded-md border border-danger/30 bg-danger/5 px-3 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/10"
          >
            <X size={12} />
            Cancel
          </button>
        ) : (
          <button
            onClick={() => params.download()}
            disabled={!connected}
            className="flex items-center gap-1.5 rounded-md border border-border bg-bg-secondary px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-bg-tertiary disabled:opacity-40"
          >
            <RefreshCw size={12} />
            Refresh
          </button>
        )}
        <button
          onClick={params.saveToFile}
          disabled={!params.store}
          className="flex items-center gap-1.5 rounded-md border border-border bg-bg-secondary px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-bg-tertiary disabled:opacity-40"
        >
          <Save size={12} />
          Save
        </button>
        <button
          onClick={params.loadFromFile}
          className="flex items-center gap-1.5 rounded-md border border-border bg-bg-secondary px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-bg-tertiary disabled:opacity-40"
        >
          <FolderOpen size={12} />
          Load
        </button>
        <button
          onClick={handleReboot}
          disabled={!connected || rebooting}
          className="flex items-center gap-1.5 rounded-md border border-danger/30 bg-danger/5 px-3 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-40"
        >
          <RotateCw size={12} className={rebooting ? "animate-spin" : ""} />
          {rebooting ? "Rebooting..." : "Reboot Vehicle"}
        </button>
      </div>

      {/* Download progress bar */}
      {(isDownloading || showCompleted) && (
        <div className="mt-3 flex flex-col gap-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-bg-secondary">
            <div
              className="h-full rounded-full bg-accent-blue transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="text-[10px] text-text-muted">
            {showCompleted && !isDownloading
              ? `Downloaded ${lastCountsRef.current?.received ?? ""} / ${lastCountsRef.current?.expected ?? ""} parameters`
              : counts
                ? `Downloading ${counts.received} / ${counts.expected ?? "?"} parameters`
                : "Downloading…"}
          </span>
        </div>
      )}
    </div>
  );
}

function LiveStatusCards({
  telemetry,
  homePosition,
  linkState,
}: {
  telemetry: Telemetry | null;
  homePosition: HomePosition | null;
  linkState: LinkState | null;
}) {
  const gpsOk =
    telemetry?.gps_fix_type != null &&
    ["fix_3d", "dgps", "rtk_float", "rtk_fixed"].includes(telemetry.gps_fix_type);
  const batteryOk = telemetry?.battery_pct != null && telemetry.battery_pct > 20;
  const homeOk = homePosition !== null;
  const linkOk = linkStateOk(linkState);

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      <StatusCard
        icon={linkOk ? Wifi : WifiOff}
        label="Link"
        value={linkStateLabel(linkState)}
        ok={linkOk}
      />
      <StatusCard
        icon={Satellite}
        label="GPS"
        value={telemetry?.gps_fix_type ?? "--"}
        detail={
          telemetry?.gps_satellites != null ? `${telemetry.gps_satellites} sats` : undefined
        }
        ok={gpsOk}
      />
      <StatusCard
        icon={Battery}
        label="Battery"
        value={
          telemetry?.battery_pct != null ? `${Math.round(telemetry.battery_pct)}%` : "--"
        }
        detail={
          telemetry?.battery_voltage_v != null
            ? `${fmt(telemetry.battery_voltage_v, 2)}V`
            : undefined
        }
        ok={batteryOk}
      />
      <StatusCard
        icon={Radio}
        label="RC"
        value={
          telemetry?.rc_channels != null ? `${telemetry.rc_channels.length} ch` : "--"
        }
        detail={
          telemetry?.rc_rssi != null ? `RSSI ${telemetry.rc_rssi}` : undefined
        }
        ok={telemetry?.rc_channels != null}
      />
      <StatusCard
        icon={MapPin}
        label="Home"
        value={homeOk ? "Set" : "Not set"}
        detail={
          homeOk
            ? `${homePosition.latitude_deg.toFixed(4)}, ${homePosition.longitude_deg.toFixed(4)}`
            : undefined
        }
        ok={homeOk}
      />
    </div>
  );
}

function StatusCard({
  icon: Icon,
  label,
  value,
  detail,
  ok,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail?: string;
  ok: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-bg-tertiary/50 p-3">
      <div className="mb-1.5 flex items-center gap-1.5">
        <Icon size={12} className={ok ? "text-success" : "text-text-muted"} />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          {label}
        </span>
        <span
          className={`ml-auto h-1.5 w-1.5 rounded-full ${ok ? "bg-success animate-pulse" : "bg-text-muted/30"}`}
        />
      </div>
      <span className={`text-sm font-medium ${ok ? "text-text-primary" : "text-text-muted"}`}>
        {value}
      </span>
      {detail && (
        <span className="ml-1 text-[10px] text-text-muted">{detail}</span>
      )}
    </div>
  );
}

function PrearmAndActions({
  connected,
  support,
  vehicleState,
  sensorHealth,
}: {
  connected: boolean;
  support: SupportDomain;
  vehicleState: VehicleState | null;
  sensorHealth: SensorHealth | null;
}) {
  const [arming, setArming] = useState(false);
  const canRequestChecks = support.value?.can_request_prearm_checks === true;
  const { blockers, checking, runChecks } = usePrearmChecks({
    connected,
    canRequestChecks,
    preArmGood: sensorHealth != null && isPreArmGood(sensorHealth),
    resetKey: `${vehicleState?.system_id ?? "none"}:${connected}`,
  });

  const handleArm = useCallback(async () => {
    if (!connected) return;
    setArming(true);
    try {
      await armVehicle(false);
    } catch {
      // Error surfaced via toast in hook layer
    } finally {
      setArming(false);
    }
  }, [connected]);

  const handleDisarm = useCallback(async () => {
    if (!connected) return;
    try {
      await disarmVehicle(false);
    } catch {
      // Error surfaced via toast in hook layer
    }
  }, [connected]);

  const isReady = sensorHealth != null && isPreArmGood(sensorHealth);
  const armed = vehicleState?.armed === true;

  return (
    <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isReady ? (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-success/15">
              <ShieldCheck size={16} className="text-success" />
            </span>
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-danger/15">
              <ShieldAlert size={16} className="text-danger" />
            </span>
          )}
          <div>
            <h3 className="text-xs font-semibold text-text-primary">
              {isReady ? "Ready to Arm" : "Pre-Arm Checks"}
            </h3>
            <p className="text-[10px] text-text-muted">
              {isReady
                ? "All checks passed"
                : checking
                  ? "Checking..."
                  : blockers.length > 0
                    ? `${blockers.length} blocker${blockers.length !== 1 ? "s" : ""}`
                    : "Run checks to verify"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
            <button
              onClick={runChecks}
              disabled={!connected || !canRequestChecks || checking}
              className="flex items-center gap-1 rounded-md border border-border bg-bg-secondary px-2 py-1 text-[11px] font-medium text-text-primary transition-colors hover:bg-bg-tertiary disabled:opacity-40"
              title={!canRequestChecks ? "Pre-arm check requests are unavailable for this vehicle" : undefined}
            >
            <RefreshCw size={10} className={checking ? "animate-spin" : ""} />
            Check
          </button>
          {armed ? (
            <button
              onClick={handleDisarm}
              disabled={!connected}
              className="flex items-center gap-1 rounded-md bg-danger/15 px-2.5 py-1 text-[11px] font-medium text-danger transition-colors hover:bg-danger/25 disabled:opacity-40"
            >
              <PowerOff size={10} />
              Disarm
            </button>
          ) : (
            <button
              onClick={handleArm}
              disabled={!connected || !isReady || arming}
              className="flex items-center gap-1 rounded-md bg-success/15 px-2.5 py-1 text-[11px] font-medium text-success transition-colors hover:bg-success/25 disabled:opacity-40"
              title={!isReady ? "Pre-arm checks must pass before arming" : undefined}
            >
              <Power size={10} />
              {arming ? "Arming..." : "Arm"}
            </button>
          )}
        </div>
      </div>

      {blockers.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Pre-Arm Blockers
          </h4>
          {blockers.map((blocker) => (
            <div
              key={blocker.id}
              className="rounded-lg border border-danger/20 bg-danger/5 p-3"
            >
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 text-sm leading-none" role="img" aria-label={blocker.category}>
                  {categoryIcon(blocker.category)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-text-primary">
                      {blocker.category}
                    </span>
                    <X size={10} className="text-danger" />
                  </div>
                  <p className="mt-0.5 truncate text-[11px] font-mono text-text-secondary" title={blocker.rawText}>
                    {blocker.rawText}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-text-muted">
                    {blocker.guidance}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SensorHealthGrid({ sensorHealth }: { sensorHealth: SensorHealth | null }) {
  if (!sensorHealth) {
    return (
      <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4 text-sm text-text-muted">
        Waiting for sensor data...
      </div>
    );
  }

  const preArmGood = isPreArmGood(sensorHealth);
  const otherSensors = SENSOR_KEYS.filter((id) => !KEY_SENSORS.includes(id));
  const orderedSensors = [...KEY_SENSORS, ...otherSensors];

  return (
    <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          Sensor Health
        </h3>
        <span
          className={`text-[10px] font-medium ${preArmGood ? "text-success" : "text-warning"}`}
        >
          {preArmGood ? "Pre-Arm Good" : "Pre-Arm Fail"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-0.5 sm:grid-cols-4">
        {orderedSensors.map((id) => {
          const status = sensorHealth[id];
          return (
            <div
              key={id}
              className="flex items-center gap-1.5 rounded px-2 py-1 transition-colors hover:bg-bg-secondary/50"
            >
              <SensorStatusIcon status={status} />
              <span className="flex-1 truncate text-[11px] font-medium text-text-primary">
                {SENSOR_NAMES[id] ?? id}
              </span>
              <span className={`text-[9px] ${sensorStatusColor(status)}`}>
                {sensorStatusLabel(status)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SectionProgressList({
  sectionStatuses,
  onNavigateSection,
}: {
  sectionStatuses: Map<SetupSectionId, SectionStatus>;
  onNavigateSection: (id: SetupSectionId) => void;
}) {
  const sectionMap = new Map(SETUP_SECTIONS.map((s) => [s.id, s]));

  return (
    <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
        All Sections
      </h3>
      <div className="flex flex-col gap-2">
        {SECTION_GROUPS.map((group) => (
          <div key={group.id}>
            <span className="mb-0.5 block px-1 text-[9px] font-semibold uppercase tracking-wider text-text-muted/70">
              {group.label}
            </span>
            <div className="flex flex-col gap-0.5">
              {group.sections.map((sectionId) => {
                const section = sectionMap.get(sectionId);
                if (!section) return null;
                const status = sectionStatuses.get(sectionId) ?? "unknown";
                const Icon = section.icon;

                return (
                  <button
                    key={sectionId}
                    onClick={() => onNavigateSection(sectionId)}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-bg-secondary/50"
                  >
                    <Icon
                      size={13}
                      className={
                        status === "complete"
                          ? "shrink-0 text-success"
                          : status === "in_progress"
                            ? "shrink-0 text-accent"
                            : status === "failed"
                              ? "shrink-0 text-danger"
                              : status === "unknown"
                                ? "shrink-0 text-warning"
                                : "shrink-0 text-text-muted"
                      }
                    />
                    <span
                      className={`flex-1 font-medium ${
                        status === "complete"
                          ? "text-success"
                          : status === "failed"
                            ? "text-danger"
                            : status === "unknown"
                              ? "text-warning"
                              : status === "in_progress"
                                ? "text-text-primary"
                                : "text-text-secondary"
                      }`}
                    >
                      {section.label}
                    </span>
                    <SectionStatusIcon status={status} />
                    <ChevronRight size={12} className="shrink-0 text-text-muted/50" />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Disconnected gate
// ---------------------------------------------------------------------------

function DisconnectedOverview() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-text-muted">
      <Unplug size={32} className="opacity-40" />
      <span className="text-sm">Connect to a vehicle to see setup overview</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Onboarding state: connected but parameters not yet downloaded
// ---------------------------------------------------------------------------

function OnboardingOverview({
  vehicleState,
  linkState,
  params,
}: {
  vehicleState: VehicleState | null;
  linkState: LinkState | null;
  params: ParamsState;
}) {
  const phase = params.progress ? paramProgressPhase(params.progress) : null;
  const isDownloading = phase === "downloading";
  const counts = params.progress ? paramProgressCounts(params.progress) : null;

  const linkOk = linkStateOk(linkState);

  return (
    <div className="flex flex-col gap-4 p-4">
      {vehicleState && (
        <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
            <InfoField label="Type" value={formatVehicleType(vehicleState.vehicle_type)} />
            <InfoField label="Autopilot" value={formatVehicleType(vehicleState.autopilot)} />
            <InfoField label="System ID" value={String(vehicleState.system_id)} />
          </div>
        </div>
      )}

      <div className="rounded-lg border border-accent/30 bg-accent/5 p-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15">
            <Download size={24} className="text-accent" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">
              Download Parameters to Get Started
            </h3>
            <p className="mt-1.5 max-w-md text-xs leading-relaxed text-text-secondary">
              Vehicle parameters define your aircraft's configuration — frame type, sensor
              calibration, flight modes, safety limits, and more. Download them to unlock
              all setup sections.
            </p>
          </div>
          {isDownloading ? (
            <button
              onClick={() => params.cancel()}
              className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/5 px-5 py-2.5 text-sm font-semibold text-danger transition-opacity hover:opacity-90"
            >
              <X size={16} />
              Cancel
            </button>
          ) : (
            <button
              onClick={() => params.download()}
              disabled={!linkOk}
              className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-bg-primary transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <Download size={16} />
              Download Parameters
            </button>
          )}
          {isDownloading && counts && (
            <div className="w-full max-w-xs">
              <div className="h-1.5 overflow-hidden rounded-full bg-bg-secondary">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-300"
                  style={{
                    width: `${counts.expected ? Math.round((counts.received / counts.expected) * 100) : 0}%`,
                  }}
                />
              </div>
              <span className="mt-1 block text-[10px] text-text-muted">
                {counts.received} / {counts.expected ?? "?"} parameters
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          What happens next
        </h3>
        <ul className="flex flex-col gap-2 text-xs text-text-secondary">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[10px] font-bold text-accent">
              1
            </span>
            <span>Parameters are read from your flight controller</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[10px] font-bold text-accent">
              2
            </span>
            <span>All setup sections unlock — calibration, modes, safety, tuning</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[10px] font-bold text-accent">
              3
            </span>
            <span>Edit parameters in context, review staged changes, then apply</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

function MetadataLoadingOverview({
  vehicleState,
  params,
}: {
  vehicleState: VehicleState | null;
  params: ParamsState;
}) {
  const isLoading = params.metadataLoading;
  const hasFailed = !isLoading && params.metadata === null;

  return (
    <div className="flex flex-col gap-4 p-4">
      {vehicleState && (
        <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
            <InfoField label="Type" value={formatVehicleType(vehicleState.vehicle_type)} />
            <InfoField label="Autopilot" value={formatVehicleType(vehicleState.autopilot)} />
            <InfoField label="System ID" value={String(vehicleState.system_id)} />
          </div>
        </div>
      )}

      <div className="rounded-lg border border-accent/30 bg-accent/5 p-4">
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <Check size={14} className="shrink-0 text-success" />
          <span>Parameters downloaded &mdash; {Object.keys(params.store?.params ?? {}).length} parameters</span>
        </div>
      </div>

      {isLoading && (
        <div className="rounded-lg border border-border bg-bg-tertiary/50 p-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <Loader2 size={24} className="animate-spin text-accent" />
            <div>
              <h3 className="text-sm font-semibold text-text-primary">
                Loading parameter descriptions
              </h3>
              <p className="mt-1 max-w-md text-xs leading-relaxed text-text-secondary">
                Fetching human-readable descriptions, ranges, and options for each
                parameter. Setup sections will unlock once this completes.
              </p>
            </div>
          </div>
        </div>
      )}

      {hasFailed && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <BookX size={24} className="text-warning" />
            <div>
              <h3 className="text-sm font-semibold text-text-primary">
                Could not load parameter descriptions
              </h3>
              <p className="mt-1 max-w-md text-xs leading-relaxed text-text-secondary">
                Parameter metadata could not be fetched. Setup sections need descriptions
                for labels, value ranges, and options. Check your internet connection and
                try again.
              </p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="flex items-center gap-1.5 rounded-md border border-border bg-bg-secondary px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-bg-tertiary"
            >
              <RefreshCw size={12} />
              Reload
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function OverviewSection({
  connected,
  vehicleState,
  telemetry,
  linkState,
  support,
  sensorHealth,
  homePosition,
  params,
  sectionStatuses,
  overallProgress,
  onNavigateSection,
}: OverviewSectionProps) {
  if (!connected) return <DisconnectedOverview />;

  if (params.store === null) {
    return (
      <OnboardingOverview
        vehicleState={vehicleState}
        linkState={linkState}
        params={params}
      />
    );
  }

  if (params.metadata === null) {
    return (
      <MetadataLoadingOverview
        vehicleState={vehicleState}
        params={params}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <ProgressHeader progress={overallProgress} />
      <div className="px-1">
        <DocsLink
          docsUrl={resolveDocsUrl(
            "mandatory_hardware_config",
            getVehicleSlug(vehicleState),
          )}
          docsLabel="Setup Guide"
          variant="inline"
        />
      </div>
      <VehicleInfoCard vehicleState={vehicleState} params={params} />
      <QuickActions connected={connected} params={params} />
      <PrearmAndActions
        connected={connected}
        support={support}
        vehicleState={vehicleState}
        sensorHealth={sensorHealth}
      />
      <LiveStatusCards telemetry={telemetry} homePosition={homePosition} linkState={linkState} />
      <SensorHealthGrid sensorHealth={sensorHealth} />
      <SectionProgressList
        sectionStatuses={sectionStatuses}
        onNavigateSection={onNavigateSection}
      />
    </div>
  );
}
