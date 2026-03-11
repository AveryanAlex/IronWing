import { useState, useCallback, useEffect, useRef } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  ShieldOff,
  RefreshCw,
  Power,
  PowerOff,
  AlertTriangle,
  X,
  Check,
  Lock,
} from "lucide-react";
import { ParamBitmaskInput } from "../primitives/ParamBitmaskInput";
import { ParamSelect } from "../primitives/ParamSelect";
import { getStagedOrCurrent } from "../primitives/param-helpers";
import type { ParamInputParams } from "../primitives/param-helpers";
import { armVehicle, disarmVehicle } from "../../../telemetry";
import type { VehicleState } from "../../../telemetry";
import { requestPrearmChecks } from "../../../calibration";
import { subscribeStatusText, type StatusMessage } from "../../../statustext";
import type { SensorHealth } from "../../../sensor-health";
import {
  type PrearmBlocker,
  classifyPrearm,
  categoryIcon,
} from "../shared/prearm-helpers";
import { getVehicleSlug } from "../shared/vehicle-helpers";
import { resolveDocsUrl } from "../../../data/ardupilot-docs";
import { SetupSectionIntro } from "../shared/SetupSectionIntro";
import { SectionCardHeader } from "../shared/SectionCardHeader";
import { DocsLink } from "../shared/DocsLink";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type ArmingSectionProps = {
  params: ParamInputParams;
  connected: boolean;
  vehicleState: VehicleState | null;
  sensorHealth: SensorHealth | null;
};

// ---------------------------------------------------------------------------
// ARMING_REQUIRE options (explicit for clarity)
// ---------------------------------------------------------------------------

export const ARMING_REQUIRE_OPTIONS = [
  { value: 0, label: "Disabled (no arming required)" },
  { value: 1, label: "Throttle-Yaw-Right (rudder arm)" },
  { value: 2, label: "Arm Switch (RC switch)" },
];

export { PREARM_PATTERNS } from "../shared/prearm-helpers";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ArmingSection({
  params,
  connected,
  vehicleState,
  sensorHealth,
}: ArmingSectionProps) {
  const vehicleSlug = getVehicleSlug(vehicleState);
  const armingCheckValue = getStagedOrCurrent("ARMING_CHECK", params);
  const armingRequireValue = getStagedOrCurrent("ARMING_REQUIRE", params);
  const isReady = sensorHealth?.pre_arm_good === true;
  const armed = vehicleState?.armed === true;

  const checksDisabled = armingCheckValue === 0;
  const checksNotAll = armingCheckValue !== null && armingCheckValue !== 1 && armingCheckValue !== 0;
  const armingDisabled = armingRequireValue === 0;

  return (
    <div className="flex flex-col gap-4 p-4">
      <SetupSectionIntro
        icon={Lock}
        title="Arming & Pre-Arm Checks"
        description="Configure arming requirements and review pre-flight safety checks before the vehicle can arm."
        docsUrl={resolveDocsUrl("arming", vehicleSlug)}
        docsLabel="Arming Docs"
      />

      {checksDisabled && (
        <div className="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/10 p-4">
          <ShieldOff size={18} className="mt-0.5 shrink-0 text-danger" />
          <div>
            <h4 className="text-xs font-semibold text-danger">
              Arming Checks Disabled
            </h4>
            <p className="mt-0.5 text-[11px] leading-relaxed text-danger/80">
              All pre-arm safety checks are disabled. The vehicle will arm without verifying
              sensors, GPS, or calibration. This is extremely dangerous for flight.
              Set ARMING_CHECK to &quot;All&quot; (1) for safe operation.
            </p>
          </div>
        </div>
      )}

      {checksNotAll && (
        <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warning" />
          <div>
            <h4 className="text-xs font-semibold text-warning">
              Partial Arming Checks
            </h4>
            <p className="mt-0.5 text-[11px] leading-relaxed text-warning/80">
              Setting ARMING_CHECK to &quot;All&quot; (value 1) is strongly recommended for flight safety.
              Individual checks should only be disabled by experienced users for specific testing scenarios.
            </p>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
        <SectionCardHeader
          icon={ShieldCheck}
          title="Arming Checks"
          docsUrl={resolveDocsUrl("prearm_safety_checks", vehicleSlug)}
          docsLabel="Pre-Arm Checks Docs"
        />
        <ParamBitmaskInput
          paramName="ARMING_CHECK"
          params={params}
          label="ARMING_CHECK"
          description="Controls which pre-arm checks are enforced before the vehicle can be armed."
        />
      </div>

      <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
        <SectionCardHeader
          icon={Lock}
          title="Arming Method"
        />
        <ParamSelect
          paramName="ARMING_REQUIRE"
          params={params}
          label="ARMING_REQUIRE"
          description="How the vehicle can be armed: via GCS command, rudder stick, or RC switch."
          options={ARMING_REQUIRE_OPTIONS}
        />
        {armingDisabled && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-warning/20 bg-warning/5 p-2.5">
            <AlertTriangle size={12} className="mt-0.5 shrink-0 text-warning" />
            <p className="text-[11px] leading-relaxed text-warning">
              Arming requirement is disabled. The vehicle may arm unexpectedly via GCS commands
              without physical confirmation. Consider requiring rudder arm or arm switch for safety.
            </p>
          </div>
        )}
      </div>

      <PrearmStatusPanel
        connected={connected}
        sensorHealth={sensorHealth}
        vehicleSlug={vehicleSlug}
      />

      <ArmDisarmControls
        connected={connected}
        armed={armed}
        isReady={isReady}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pre-Arm Status Panel
// ---------------------------------------------------------------------------

function PrearmStatusPanel({
  connected,
  sensorHealth,
  vehicleSlug,
}: {
  connected: boolean;
  sensorHealth: SensorHealth | null;
  vehicleSlug: ReturnType<typeof getVehicleSlug>;
}) {
  const [blockers, setBlockers] = useState<PrearmBlocker[]>([]);
  const [checking, setChecking] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);
  const lastCheckTime = useRef<number>(0);

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    const handleStatus = (msg: StatusMessage) => {
      const now = Date.now();
      if (now < lastCheckTime.current) return;
      if (!msg.text.toLowerCase().includes("prearm")) return;

      const blocker = classifyPrearm(msg.text, now);
      setBlockers((prev) => {
        const filtered = prev.filter((b) => b.category !== blocker.category);
        return [...filtered, blocker];
      });
    };

    (async () => {
      unlisten = await subscribeStatusText(handleStatus);
    })();

    return () => {
      unlisten?.();
    };
  }, []);

  const runChecks = useCallback(async () => {
    if (!connected) return;
    setChecking(true);
    setBlockers([]);
    lastCheckTime.current = Date.now();
    try {
      await requestPrearmChecks();
      setHasChecked(true);
    } catch {
      // Vehicle may not support the command
    }
    setTimeout(() => setChecking(false), 3000);
  }, [connected]);

  useEffect(() => {
    if (sensorHealth?.pre_arm_good === true) {
      setBlockers([]);
    }
  }, [sensorHealth?.pre_arm_good]);

  const autoChecked = useRef(false);
  useEffect(() => {
    if (connected && !autoChecked.current) {
      autoChecked.current = true;
      runChecks();
    }
  }, [connected]); // eslint-disable-line react-hooks/exhaustive-deps

  const isReady = sensorHealth?.pre_arm_good === true;
  const blockerCount = blockers.length;

  return (
    <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isReady ? (
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-success/15">
              <ShieldCheck size={20} className="text-success" />
            </span>
          ) : (
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-danger/15">
              <ShieldAlert size={20} className="text-danger" />
            </span>
          )}
          <div>
            <h3 className="text-sm font-semibold text-text-primary">
              {isReady ? "Ready to Arm" : "Pre-Arm Status"}
            </h3>
            <p className="text-[11px] text-text-muted">
              {isReady
                ? "All pre-arm checks passed. Vehicle is ready to arm."
                : checking
                  ? "Checking pre-arm requirements..."
                  : hasChecked
                    ? `${blockerCount} blocker${blockerCount !== 1 ? "s" : ""} remaining`
                    : "Run checks to identify pre-arm blockers"}
            </p>
          </div>
        </div>

        <button
          onClick={runChecks}
          disabled={!connected || checking}
          className="flex items-center gap-1.5 rounded-md border border-border bg-bg-secondary px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-bg-tertiary disabled:opacity-40"
        >
          <RefreshCw size={12} className={checking ? "animate-spin" : ""} />
          {checking ? "Checking..." : "Refresh"}
        </button>
      </div>

      {hasChecked && (
        <div className="mt-3 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-secondary">
            <div
              className={`h-full rounded-full transition-all duration-500 ${isReady ? "w-full bg-success" : "bg-danger"}`}
              style={isReady ? undefined : { width: "30%" }}
            />
          </div>
          <span className={`text-[10px] font-medium ${isReady ? "text-success" : "text-danger"}`}>
            {isReady ? "PASS" : "FAIL"}
          </span>
        </div>
      )}

      {blockerCount > 0 && (
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

      {isReady && hasChecked && blockerCount === 0 && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-success/20 bg-success/10 px-4 py-3 text-xs text-success">
          <Check size={14} />
          <span className="font-medium">All pre-arm checks passed</span>
        </div>
      )}

      {!isReady && hasChecked && !checking && blockerCount === 0 && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-warning/20 bg-warning/10 px-4 py-3 text-xs text-warning">
          <AlertTriangle size={14} />
          <span>
            Pre-arm status reports not ready but no specific blockers received.
            Try pressing Refresh or wait for sensor convergence.
          </span>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3">
        <DocsLink
          docsUrl={resolveDocsUrl("prearm_safety_checks", vehicleSlug)}
          docsLabel="Pre-Arm Checks"
          variant="inline"
        />
        <DocsLink
          docsUrl={resolveDocsUrl("arming", vehicleSlug)}
          docsLabel="Arming the Motors"
          variant="inline"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ARM / DISARM Controls
// ---------------------------------------------------------------------------

function ArmDisarmControls({
  connected,
  armed,
  isReady,
}: {
  connected: boolean;
  armed: boolean;
  isReady: boolean;
}) {
  const [arming, setArming] = useState(false);
  const [confirmArm, setConfirmArm] = useState(false);

  const handleArm = useCallback(async () => {
    if (!connected) return;
    setArming(true);
    setConfirmArm(false);
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

  useEffect(() => {
    setConfirmArm(false);
  }, [armed]);

  return (
    <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
      <SectionCardHeader
        icon={Power}
        title="Vehicle Control"
      />

      <div className="mb-4 flex items-center gap-3">
        <span
          className={`flex h-10 w-10 items-center justify-center rounded-full ${
            armed ? "bg-danger/15" : "bg-bg-secondary"
          }`}
        >
          {armed ? (
            <Power size={20} className="text-danger" />
          ) : (
            <PowerOff size={20} className="text-text-muted" />
          )}
        </span>
        <div>
          <h4 className={`text-sm font-semibold ${armed ? "text-danger" : "text-text-primary"}`}>
            {armed ? "ARMED" : "Disarmed"}
          </h4>
          <p className="text-[11px] text-text-muted">
            {armed
              ? "Motors are live. Exercise caution."
              : isReady
                ? "Vehicle is ready to arm."
                : connected
                  ? "Resolve pre-arm blockers before arming."
                  : "Connect to a vehicle to arm."}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {armed ? (
          <button
            onClick={handleDisarm}
            disabled={!connected}
            className="flex items-center gap-2 rounded-lg bg-danger/15 px-4 py-2.5 text-sm font-semibold text-danger transition-colors hover:bg-danger/25 disabled:opacity-40"
          >
            <PowerOff size={16} />
            Disarm
          </button>
        ) : confirmArm ? (
          <>
            <button
              onClick={handleArm}
              disabled={!connected || !isReady || arming}
              className="flex items-center gap-2 rounded-lg bg-success px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-success/90 disabled:opacity-40"
            >
              <Power size={16} />
              {arming ? "Arming..." : "Confirm Arm"}
            </button>
            <button
              onClick={() => setConfirmArm(false)}
              className="rounded-lg border border-border bg-bg-secondary px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirmArm(true)}
            disabled={!connected || !isReady}
            className="flex items-center gap-2 rounded-lg bg-success/15 px-4 py-2.5 text-sm font-semibold text-success transition-colors hover:bg-success/25 disabled:opacity-40"
            title={!isReady ? "Pre-arm checks must pass before arming" : undefined}
          >
            <Power size={16} />
            Arm
          </button>
        )}
      </div>

      {armed && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-danger/20 bg-danger/5 p-2.5">
          <AlertTriangle size={12} className="mt-0.5 shrink-0 text-danger" />
          <p className="text-[11px] leading-relaxed text-danger/80">
            Vehicle is armed. Motors will spin at throttle input. Keep clear of propellers.
            Disarm immediately if conditions are unsafe.
          </p>
        </div>
      )}
    </div>
  );
}
