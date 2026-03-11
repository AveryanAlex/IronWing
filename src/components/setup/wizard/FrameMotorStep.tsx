import { useState, useCallback, useRef } from "react";
import {
  AlertTriangle,
  RotateCcw,
  Cog,
  Shield,
  Loader2,
  CheckCircle2,
  Info,
  Zap,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "../../ui/button";
import { motorTest, rebootVehicle } from "../../../calibration";
import { toast } from "sonner";
import type { VehicleState } from "../../../telemetry";
import type { useParams } from "../../../hooks/use-params";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type FrameMotorStepProps = {
  params: ReturnType<typeof useParams>;
  vehicleState: VehicleState | null;
  connected: boolean;
  onConfirm: () => void;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FRAME_CLASS_LABELS: Record<number, string> = {
  0: "Undefined",
  1: "Quad",
  2: "Hexa",
  3: "Octa",
  4: "OctaQuad",
  5: "Y6",
  6: "Heli",
  7: "Tri",
};

const FRAME_TYPE_LABELS: Record<number, string> = {
  0: "Plus",
  1: "X",
  2: "V",
  3: "H",
  4: "V-Tail",
};

const MOTOR_COUNT: Record<number, number> = {
  1: 4,
  2: 6,
  3: 8,
  4: 8,
  5: 6,
  7: 3,
};

const COPTER_VEHICLE_TYPES = ["quadrotor", "hexarotor", "octorotor", "tricopter"];

const SERVO_FUNCTION_LABELS: Record<number, string> = {
  0: "Disabled",
  1: "RCPassThru1",
  2: "RCPassThru2",
  3: "RCPassThru3",
  4: "RCPassThru4",
  33: "Motor 1",
  34: "Motor 2",
  35: "Motor 3",
  36: "Motor 4",
  37: "Motor 5",
  38: "Motor 6",
  39: "Motor 7",
  40: "Motor 8",
  51: "RCIN1",
  52: "RCIN2",
  53: "RCIN3",
  54: "RCIN4",
  70: "Throttle",
  73: "ThrottleLeft",
  74: "ThrottleRight",
};

const MAX_THROTTLE_PCT = 5;
const MOTOR_TEST_DURATION_S = 2.0;
const COOLDOWN_MS = 2000;

const MOT_PWM_TYPE_LABELS: Record<number, string> = {
  0: "Normal PWM",
  1: "OneShot",
  2: "OneShot125",
  3: "Brushed (DualPWM)",
  4: "DShot150",
  5: "DShot300",
  6: "DShot600",
  7: "DShot1200",
  8: "PWMRange",
};

const ESC_CALIBRATION_VALUE = 3;

function isDshot(pwmType: number): boolean {
  return pwmType >= 4 && pwmType <= 7;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isCopter(vehicleState: VehicleState | null): boolean {
  if (!vehicleState) return false;
  return COPTER_VEHICLE_TYPES.some((t) =>
    vehicleState.vehicle_type.toLowerCase().includes(t),
  );
}

function getParamValue(params: FrameMotorStepProps["params"], name: string): number | undefined {
  return params.store?.params[name]?.value;
}

function getStagedOrCurrent(
  params: FrameMotorStepProps["params"],
  name: string,
): number | undefined {
  const staged = params.staged.get(name);
  if (staged !== undefined) return staged;
  return getParamValue(params, name);
}

// ---------------------------------------------------------------------------
// Sub-sections
// ---------------------------------------------------------------------------

function FrameSelectionSection({ params }: { params: FrameMotorStepProps["params"] }) {
  const currentClass = getParamValue(params, "FRAME_CLASS");
  const currentType = getParamValue(params, "FRAME_TYPE");
  const selectedClass = getStagedOrCurrent(params, "FRAME_CLASS");
  const selectedType = getStagedOrCurrent(params, "FRAME_TYPE");
  const classChanged = currentClass !== undefined && selectedClass !== currentClass;

  const handleApplyReboot = useCallback(async () => {
    try {
      await params.applyStaged();
      toast.info("Rebooting vehicle...");
      await rebootVehicle();
    } catch (err) {
      toast.error("Reboot failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }, [params]);

  return (
    <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Cog size={14} className="text-accent" />
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          Frame Configuration
        </h3>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* FRAME_CLASS */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] uppercase tracking-wider text-text-muted">
            Frame Class
          </label>
          <select
            className="h-9 rounded-md border border-border bg-bg-secondary px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
            value={selectedClass ?? ""}
            onChange={(e) => params.stage("FRAME_CLASS", Number(e.target.value))}
          >
            {currentClass === undefined && <option value="">--</option>}
            {Object.entries(FRAME_CLASS_LABELS).map(([val, label]) => (
              <option key={val} value={val}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {/* FRAME_TYPE */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] uppercase tracking-wider text-text-muted">
            Frame Type
          </label>
          <select
            className="h-9 rounded-md border border-border bg-bg-secondary px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50"
            value={selectedType ?? ""}
            onChange={(e) => params.stage("FRAME_TYPE", Number(e.target.value))}
          >
            {currentType === undefined && <option value="">--</option>}
            {Object.entries(FRAME_TYPE_LABELS).map(([val, label]) => (
              <option key={val} value={val}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {classChanged && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2.5">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
          <div className="flex flex-1 flex-col gap-2">
            <p className="text-xs text-warning">
              Frame type change requires reboot. Apply changes and reboot before motor testing.
            </p>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleApplyReboot}
              className="self-start"
            >
              <RotateCcw size={12} />
              Apply &amp; Reboot
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function PropRemovalDialog({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="mx-4 w-full max-w-sm rounded-lg border border-danger/30 bg-bg-secondary p-5 shadow-2xl">
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangle size={18} className="text-danger" />
          <h4 className="text-sm font-semibold text-text-primary">Safety Warning</h4>
        </div>
        <p className="mb-4 text-xs leading-relaxed text-text-secondary">
          Remove <strong className="text-danger">ALL propellers</strong> before testing motors.
          Confirm propellers are removed.
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={onConfirm}>
            Props Removed
          </Button>
        </div>
      </div>
    </div>
  );
}

function MotorTestSection({
  params,
  vehicleState,
  connected,
}: {
  params: FrameMotorStepProps["params"];
  vehicleState: VehicleState | null;
  connected: boolean;
}) {
  const [propsConfirmed, setPropsConfirmed] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [throttle, setThrottle] = useState(3);
  const [activeMotor, setActiveMotor] = useState<number | null>(null);
  const [cooldown, setCooldown] = useState(false);
  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const frameClass = getStagedOrCurrent(params, "FRAME_CLASS");
  const motorCount = frameClass !== undefined ? (MOTOR_COUNT[frameClass] ?? 0) : 0;

  const copter = isCopter(vehicleState);

  const handleToggleEnable = useCallback(() => {
    if (!enabled) {
      if (!propsConfirmed) {
        setShowDialog(true);
        return;
      }
      setEnabled(true);
    } else {
      setEnabled(false);
    }
  }, [enabled, propsConfirmed]);

  const handleDialogConfirm = useCallback(() => {
    setPropsConfirmed(true);
    setShowDialog(false);
    setEnabled(true);
  }, []);

  const handleMotorTest = useCallback(
    async (instance: number) => {
      if (!connected || cooldown || activeMotor !== null) return;
      const clampedThrottle = Math.min(throttle, MAX_THROTTLE_PCT);
      setActiveMotor(instance);
      try {
        await motorTest(instance, clampedThrottle, MOTOR_TEST_DURATION_S);
      } catch (err) {
        toast.error(`Motor ${instance} test failed`, {
          description: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setActiveMotor(null);
        setCooldown(true);
        if (cooldownTimer.current) clearTimeout(cooldownTimer.current);
        cooldownTimer.current = setTimeout(() => setCooldown(false), COOLDOWN_MS);
      }
    },
    [connected, cooldown, activeMotor, throttle],
  );

  if (!copter) {
    return (
      <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Info size={14} className="text-accent" />
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Motor / Servo Verification
          </h3>
        </div>
        <p className="text-xs leading-relaxed text-text-secondary">
          Motor/servo verification for this vehicle type should be done through manual inspection.
          Refer to{" "}
          <span className="font-medium text-accent">ArduPilot documentation</span> for
          vehicle-specific testing procedures.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
      {showDialog && (
        <PropRemovalDialog
          onCancel={() => setShowDialog(false)}
          onConfirm={handleDialogConfirm}
        />
      )}

      <div className="mb-3 flex items-center gap-2">
        <Shield size={14} className="text-accent" />
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          Motor Test
        </h3>
      </div>

      {/* Safety toggle */}
      <div className="mb-4 flex items-center justify-between rounded-md border border-border-light bg-bg-secondary/50 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <AlertTriangle size={12} className={enabled ? "text-danger" : "text-text-muted"} />
          <span className="text-xs font-medium text-text-primary">Enable Motor Test</span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={handleToggleEnable}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
            enabled ? "bg-danger" : "bg-bg-tertiary"
          }`}
        >
          <span
            className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
              enabled ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {enabled && (
        <div className="flex flex-col gap-4">
          {/* Throttle slider */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] uppercase tracking-wider text-text-muted">
                Throttle
              </label>
              <span className="text-xs font-medium text-text-primary">{throttle}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={MAX_THROTTLE_PCT}
              step={1}
              value={throttle}
              onChange={(e) => setThrottle(Number(e.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-bg-tertiary accent-accent"
            />
            <div className="flex justify-between text-[9px] text-text-muted">
              <span>0%</span>
              <span>{MAX_THROTTLE_PCT}% max</span>
            </div>
          </div>

          {/* Motor buttons */}
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: motorCount }, (_, i) => (
              <Button
                key={i}
                variant="secondary"
                size="sm"
                disabled={!connected || cooldown || activeMotor !== null}
                onClick={() => handleMotorTest(i + 1)}
                className="relative"
              >
                {activeMotor === i + 1 ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <span>Motor {i + 1}</span>
                )}
              </Button>
            ))}
          </div>

          {cooldown && (
            <p className="text-[10px] text-text-muted">Cooldown — wait before next test...</p>
          )}
        </div>
      )}
    </div>
  );
}

function ParamNumericInput({
  label,
  paramName,
  params,
  unit,
  min,
  max,
  step,
  description,
}: {
  label: string;
  paramName: string;
  params: FrameMotorStepProps["params"];
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  description?: string;
}) {
  const value = getStagedOrCurrent(params, paramName);
  const isStaged = params.staged.has(paramName);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-text-muted">{label}</span>
        {isStaged && (
          <span className="rounded bg-warning/10 px-1 py-px text-[9px] font-medium text-warning">
            staged
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          value={value != null ? String(value) : ""}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!Number.isNaN(v)) params.stage(paramName, v);
          }}
          min={min}
          max={max}
          step={step}
          className="w-full rounded border border-border bg-bg-input px-2 py-1.5 text-xs font-mono text-text-primary focus:border-accent focus:outline-none"
        />
        {unit && <span className="shrink-0 text-[10px] text-text-muted">{unit}</span>}
      </div>
      {description && (
        <span className="text-[10px] text-text-muted">{description}</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function EscCalibrationSection({ params }: { params: FrameMotorStepProps["params"] }) {
  const pwmType = getParamValue(params, "MOT_PWM_TYPE");
  const escCalStaged = params.staged.has("ESC_CALIBRATION");

  // Params not loaded yet
  if (!params.store) {
    return (
      <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4 text-sm text-text-muted">
        Download parameters first
      </div>
    );
  }

  const pwmTypeValue = pwmType ?? 0;
  const protocolName = MOT_PWM_TYPE_LABELS[pwmTypeValue] ?? `Type ${pwmTypeValue}`;

  // DShot — no calibration needed
  if (isDshot(pwmTypeValue)) {
    return (
      <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Zap size={14} className="text-accent" />
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            ESC Calibration
          </h3>
        </div>
        <div className="flex items-center gap-2 rounded-md bg-success/10 px-3 py-2.5 text-xs text-success">
          <CheckCircle2 size={14} className="shrink-0" />
          <span>
            No ESC calibration needed — <strong>{protocolName}</strong> is a digital protocol
          </span>
        </div>
      </div>
    );
  }

  // PWM / OneShot — show calibration guidance
  return (
    <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Zap size={14} className="text-accent" />
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          ESC Calibration
        </h3>
      </div>

      {/* Protocol badge */}
      <div className="mb-3">
        <span className="inline-flex items-center rounded bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
          Protocol: {protocolName}
        </span>
      </div>

      {/* Semi-Automatic Calibration */}
      <div className="flex flex-col gap-3">
        <h4 className="text-xs font-semibold text-text-primary">Semi-Automatic Calibration</h4>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => params.stage("ESC_CALIBRATION", ESC_CALIBRATION_VALUE)}
            className="flex items-center gap-1.5 rounded-md bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
          >
            <Zap size={12} />
            Stage ESC_CALIBRATION = 3
          </button>
          {escCalStaged && (
            <span className="rounded bg-warning/10 px-1.5 py-0.5 text-[9px] font-medium text-warning">
              staged
            </span>
          )}
        </div>

        {escCalStaged && (
          <ol className="ml-4 flex list-decimal flex-col gap-1.5 text-xs leading-relaxed text-text-secondary">
            <li>Apply the staged parameter change using the yellow bar at the bottom</li>
            <li>Disconnect battery and USB from the vehicle</li>
            <li>Reconnect battery</li>
            <li>Wait for arming tone, press safety button if present</li>
            <li>
              Wait for musical tone → cell-count beeps → long confirmation tone
            </li>
            <li>Disconnect battery, then reconnect normally to fly</li>
          </ol>
        )}

        {/* Safety warning */}
        <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2.5">
          <AlertTriangle size={13} className="mt-0.5 shrink-0 text-danger" />
          <span className="text-xs font-medium text-danger">
            Remove ALL propellers before ESC calibration
          </span>
        </div>

        {/* Fallback note */}
        <p className="text-[10px] leading-relaxed text-text-muted">
          Some ESC brands don't support calibration. If motors don't respond uniformly after
          calibration, manually adjust MOT_PWM_MIN and MOT_PWM_MAX in the Motor Range section below.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function MotorRangeSection({ params }: { params: FrameMotorStepProps["params"] }) {
  const pwmType = getParamValue(params, "MOT_PWM_TYPE");

  // Params not loaded yet
  if (!params.store) {
    return (
      <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4 text-sm text-text-muted">
        Download parameters first
      </div>
    );
  }

  const pwmTypeValue = pwmType ?? 0;
  const dshotActive = isDshot(pwmTypeValue);

  return (
    <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <SlidersHorizontal size={14} className="text-accent" />
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          Motor Range Configuration
        </h3>
      </div>

      {/* DShot info note */}
      {dshotActive && (
        <div className="mb-3 flex items-start gap-2 rounded-md bg-accent/10 px-3 py-2.5">
          <Info size={13} className="mt-0.5 shrink-0 text-accent" />
          <span className="text-xs text-accent">
            PWM range (MOT_PWM_MIN/MAX) is not used with DShot. Only MOT_SPIN_* parameters apply.
          </span>
        </div>
      )}

      {/* Helper text */}
      <div className="mb-4 flex flex-col gap-1 rounded-md border border-border-light bg-bg-secondary/50 px-3 py-2.5">
        <p className="text-xs text-text-secondary">
          Use Motor Test above to find the minimum throttle % that starts each motor. This is the
          ESC deadzone.
        </p>
        <p className="text-[10px] font-mono text-text-muted">
          MOT_SPIN_ARM = (deadzone% + 2) / 100 &nbsp;·&nbsp; MOT_SPIN_MIN = MOT_SPIN_ARM + 0.03
        </p>
      </div>

      {/* Parameter inputs — 2-column grid */}
      <div className="grid grid-cols-2 gap-4">
        <ParamNumericInput
          label="MOT_PWM_MIN"
          paramName="MOT_PWM_MIN"
          params={params}
          unit="PWM"
          min={0}
          max={2000}
          step={1}
          description="Min PWM sent to ESCs"
        />
        <ParamNumericInput
          label="MOT_PWM_MAX"
          paramName="MOT_PWM_MAX"
          params={params}
          unit="PWM"
          min={0}
          max={2000}
          step={1}
          description="Max PWM sent to ESCs"
        />
        <ParamNumericInput
          label="MOT_SPIN_ARM"
          paramName="MOT_SPIN_ARM"
          params={params}
          min={0}
          max={0.3}
          step={0.01}
          description="Motor spin when armed (fraction)"
        />
        <ParamNumericInput
          label="MOT_SPIN_MIN"
          paramName="MOT_SPIN_MIN"
          params={params}
          min={0}
          max={0.4}
          step={0.01}
          description="Min spin in flight (fraction)"
        />
        <ParamNumericInput
          label="MOT_SPIN_MAX"
          paramName="MOT_SPIN_MAX"
          params={params}
          min={0.9}
          max={1.0}
          step={0.01}
          description="Max useful throttle (fraction)"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ServoOutputTable({ params }: { params: FrameMotorStepProps["params"] }) {
  const servos: { index: number; paramName: string; value: number | undefined }[] = [];
  for (let i = 1; i <= 8; i++) {
    const paramName = `SERVO${i}_FUNCTION`;
    servos.push({
      index: i,
      paramName,
      value: getParamValue(params, paramName),
    });
  }

  const hasData = servos.some((s) => s.value !== undefined);

  if (!hasData) {
    return (
      <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4 text-sm text-text-muted">
        Servo output data not available. Download parameters first.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
        Servo Output Assignment
      </h3>
      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-bg-secondary/50">
              <th className="px-3 py-1.5 text-left font-medium text-text-muted">Servo #</th>
              <th className="px-3 py-1.5 text-left font-medium text-text-muted">Function</th>
              <th className="px-3 py-1.5 text-right font-medium text-text-muted">Value</th>
            </tr>
          </thead>
          <tbody>
            {servos.map((s) => (
              <tr
                key={s.index}
                className="border-b border-border/50 last:border-b-0 transition-colors hover:bg-bg-secondary/30"
              >
                <td className="px-3 py-1.5 font-medium text-text-primary">SERVO{s.index}</td>
                <td className="px-3 py-1.5 text-text-secondary">
                  {s.value !== undefined
                    ? (SERVO_FUNCTION_LABELS[s.value] ?? `Function ${s.value}`)
                    : "--"}
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-text-muted">
                  {s.value ?? "--"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function FrameMotorStep({
  params,
  vehicleState,
  connected,
  onConfirm,
}: FrameMotorStepProps) {
  const [verified, setVerified] = useState(false);

  return (
    <div className="flex flex-col gap-3 p-4">
      <FrameSelectionSection params={params} />
      <MotorTestSection params={params} vehicleState={vehicleState} connected={connected} />
      <EscCalibrationSection params={params} />
      <MotorRangeSection params={params} />
      <ServoOutputTable params={params} />

      {/* Confirmation */}
      <div className="rounded-lg border border-border-light bg-accent/5 p-4">
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={verified}
            onChange={(e) => {
              setVerified(e.target.checked);
              if (e.target.checked) onConfirm();
            }}
            className="h-4 w-4 rounded border-border accent-accent"
          />
          <div className="flex items-center gap-2">
            {verified && <CheckCircle2 size={14} className="text-success" />}
            <span className="text-xs font-medium text-text-primary">
              Motor order and direction verified
            </span>
          </div>
        </label>
      </div>
    </div>
  );
}
