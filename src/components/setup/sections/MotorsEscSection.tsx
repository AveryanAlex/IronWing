import { useState, useCallback, useRef, useMemo } from "react";
import {
  AlertTriangle,
  Shield,
  Loader2,
  CheckCircle2,
  Info,
  Zap,
  SlidersHorizontal,
  Cog,
  Gauge,
} from "lucide-react";
import { Button } from "../../ui/button";
import { motorTest } from "../../../calibration";
import { toast } from "sonner";
import { ParamSelect } from "../primitives/ParamSelect";
import { ParamNumberInput } from "../primitives/ParamNumberInput";
import { getStagedOrCurrent } from "../primitives/param-helpers";
import type { ParamInputParams } from "../primitives/param-helpers";
import { MotorDiagram } from "../MotorDiagram";
import type { VehicleState } from "../../../telemetry";
import {
  deriveVtolProfile,
  getVehicleSlug,
} from "../shared/vehicle-helpers";
import {
  getVtolLayoutModel,
  getApMotorDiagramModel,
  type MotorDiagramModel,
} from "../shared/vtol-layouts";
import { SetupSectionIntro } from "../shared/SetupSectionIntro";
import { SectionCardHeader } from "../shared/SectionCardHeader";
import { resolveDocsUrl } from "../../../data/ardupilot-docs";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_THROTTLE_PCT = 5;
const MOTOR_TEST_DURATION_S = 2.0;
const COOLDOWN_MS = 2000;
const ESC_CALIBRATION_VALUE = 3;

const COPTER_MOTOR_PARAMS = {
  pwmType: "MOT_PWM_TYPE",
  pwmMin: "MOT_PWM_MIN",
  pwmMax: "MOT_PWM_MAX",
  spinArm: "MOT_SPIN_ARM",
  spinMin: "MOT_SPIN_MIN",
  spinMax: "MOT_SPIN_MAX",
};

const QUADPLANE_MOTOR_PARAMS = {
  pwmType: "Q_M_PWM_TYPE",
  pwmMin: "Q_M_PWM_MIN",
  pwmMax: "Q_M_PWM_MAX",
  spinArm: "Q_M_SPIN_ARM",
  spinMin: "Q_M_SPIN_MIN",
  spinMax: "Q_M_SPIN_MAX",
};

function isDshot(pwmType: number): boolean {
  return pwmType >= 4 && pwmType <= 7;
}

function hasStoreParam(params: ParamInputParams, name: string): boolean {
  return params.store?.params[name] !== undefined;
}

function formatParamCode(paramName: string): string {
  return paramName;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MotorParamNames = typeof COPTER_MOTOR_PARAMS;

type MotorsEscSectionProps = {
  params: ParamInputParams;
  vehicleState: VehicleState | null;
  connected: boolean;
};

// ---------------------------------------------------------------------------
// ESC Protocol card
// ---------------------------------------------------------------------------

function EscProtocolCard({
  params,
  pwmTypeParam,
}: {
  params: ParamInputParams;
  pwmTypeParam: string;
}) {
  if (!params.store) {
    return (
      <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4 text-sm text-text-muted">
        Download parameters first
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
      <SectionCardHeader icon={Cog} title="ESC Protocol" />
      <ParamSelect paramName={pwmTypeParam} params={params} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Prop removal safety dialog
// ---------------------------------------------------------------------------

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
        <div className="flex justify-end gap-2">
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

// ---------------------------------------------------------------------------
// VTOL gap / preview card
// ---------------------------------------------------------------------------

function VtolMotorSurfaceCard({
  layoutModel,
  missingMotorParams,
}: {
  layoutModel: MotorDiagramModel | null;
  missingMotorParams: string[];
}) {
  return (
    <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
      <SectionCardHeader icon={Info} title="VTOL Lift-Motor Surface" />

      {layoutModel && layoutModel.status !== "unsupported" && (
        <div className="mb-4 flex justify-center">
          <MotorDiagram model={layoutModel} size={180} />
        </div>
      )}

      <div className="flex flex-col gap-3 text-xs leading-relaxed text-text-secondary">
        {layoutModel?.message && (
          <div
            className={
              layoutModel.status === "unsupported"
                ? "rounded-md border border-warning/30 bg-warning/10 px-3 py-2.5 text-warning"
                : "rounded-md border border-border-light bg-bg-secondary/50 px-3 py-2.5"
            }
          >
            {layoutModel.message}
          </div>
        )}

        {missingMotorParams.length > 0 && (
          <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2.5 text-warning">
            QuadPlane lift-motor parameters are not fully loaded yet. Refresh parameters before
            calibrating or testing VTOL motors. Missing: {" "}
            {missingMotorParams.map((name, index) => (
              <span key={name}>
                {index > 0 ? ", " : ""}
                <code className="rounded bg-warning/15 px-1 py-px font-mono text-[10px]">
                  {formatParamCode(name)}
                </code>
              </span>
            ))}
          </div>
        )}

        {layoutModel?.status === "preview-only" && (
          <div className="rounded-md border border-border-light bg-bg-secondary/50 px-3 py-2.5">
            Motor Test stays hidden for this VTOL layout because the airframe does not expose a
            distinct lift-motor surface here yet.
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Motor Test card
// ---------------------------------------------------------------------------

function MotorTestCard({
  connected,
  layoutModel,
}: {
  connected: boolean;
  layoutModel: MotorDiagramModel | null;
}) {
  const [propsConfirmed, setPropsConfirmed] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [throttle, setThrottle] = useState(3);
  const [activeMotor, setActiveMotor] = useState<number | null>(null);
  const [cooldown, setCooldown] = useState(false);
  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const motorCount = layoutModel?.motors.length ?? 0;

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

  return (
    <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
      {showDialog && (
        <PropRemovalDialog
          onCancel={() => setShowDialog(false)}
          onConfirm={handleDialogConfirm}
        />
      )}

      <SectionCardHeader icon={Shield} title="Motor Test" />

      {layoutModel && (
        <div className="mb-4 flex justify-center">
          <MotorDiagram model={layoutModel} activeMotor={activeMotor} size={180} />
        </div>
      )}

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

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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

// ---------------------------------------------------------------------------
// ESC Calibration card
// ---------------------------------------------------------------------------

function EscCalibrationCard({
  params,
  escCalDocsUrl,
  pwmTypeParam,
}: {
  params: ParamInputParams;
  escCalDocsUrl: string | null;
  pwmTypeParam: string;
}) {
  const pwmType = getStagedOrCurrent(pwmTypeParam, params);
  const escCalStaged = params.staged.has("ESC_CALIBRATION");

  if (!params.store) {
    return (
      <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4 text-sm text-text-muted">
        Download parameters first
      </div>
    );
  }

  const pwmTypeValue = pwmType ?? 0;

  if (isDshot(pwmTypeValue)) {
    return (
      <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
        <SectionCardHeader icon={Zap} title="ESC Calibration" docsUrl={escCalDocsUrl} docsLabel="ESC Calibration Docs" />
        <div className="flex items-center gap-2 rounded-md bg-success/10 px-3 py-2.5 text-xs text-success">
          <CheckCircle2 size={14} className="shrink-0" />
          <span>
            No ESC calibration needed — <strong>DShot</strong> is a digital protocol
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
      <SectionCardHeader icon={Zap} title="ESC Calibration" docsUrl={escCalDocsUrl} docsLabel="ESC Calibration Docs" />

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

        <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2.5">
          <AlertTriangle size={13} className="mt-0.5 shrink-0 text-danger" />
          <span className="text-xs font-medium text-danger">
            Remove ALL propellers before ESC calibration
          </span>
        </div>

        <p className="text-[10px] leading-relaxed text-text-muted">
          Some ESC brands don't support calibration. If motors don't respond uniformly after
          calibration, manually adjust the motor range parameters in the Motor Range section below.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Motor Range card
// ---------------------------------------------------------------------------

function MotorRangeCard({
  params,
  paramNames,
}: {
  params: ParamInputParams;
  paramNames: MotorParamNames;
}) {
  const pwmType = getStagedOrCurrent(paramNames.pwmType, params);

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
      <SectionCardHeader icon={SlidersHorizontal} title="Motor Range Configuration" />

      {dshotActive && (
        <div className="mb-3 flex items-start gap-2 rounded-md bg-accent/10 px-3 py-2.5">
          <Info size={13} className="mt-0.5 shrink-0 text-accent" />
          <span className="text-xs text-accent">
            PWM range ({paramNames.pwmMin}/{paramNames.pwmMax}) is not used with DShot. Only {" "}
            {paramNames.spinArm}, {paramNames.spinMin}, and {paramNames.spinMax} apply.
          </span>
        </div>
      )}

      <div className="mb-4 flex flex-col gap-1 rounded-md border border-border-light bg-bg-secondary/50 px-3 py-2.5">
        <p className="text-xs text-text-secondary">
          Use Motor Test above to find the minimum throttle % that starts each motor. This is the
          ESC deadzone.
        </p>
        <p className="text-[10px] font-mono text-text-muted">
          {paramNames.spinArm} = (deadzone% + 2) / 100 &nbsp;·&nbsp; {paramNames.spinMin} = {" "}
          {paramNames.spinArm} + 0.03
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <ParamNumberInput
          paramName={paramNames.pwmMin}
          params={params}
          unit="PWM"
          min={0}
          max={2000}
          step={1}
          description="Min PWM sent to ESCs"
        />
        <ParamNumberInput
          paramName={paramNames.pwmMax}
          params={params}
          unit="PWM"
          min={0}
          max={2000}
          step={1}
          description="Max PWM sent to ESCs"
        />
        <ParamNumberInput
          paramName={paramNames.spinArm}
          params={params}
          min={0}
          max={0.3}
          step={0.01}
          description="Motor spin when armed (fraction)"
        />
        <ParamNumberInput
          paramName={paramNames.spinMin}
          params={params}
          min={0}
          max={0.4}
          step={0.01}
          description="Min spin in flight (fraction)"
        />
        <ParamNumberInput
          paramName={paramNames.spinMax}
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
// Plane throttle fallback card
// ---------------------------------------------------------------------------

function PlaneThrottleCard({ params }: { params: ParamInputParams }) {
  if (!params.store) {
    return (
      <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4 text-sm text-text-muted">
        Download parameters first
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
      <SectionCardHeader icon={Gauge} title="Throttle Configuration" />

      <div className="mb-3 flex items-start gap-2 rounded-md bg-accent/10 px-3 py-2.5">
        <Info size={13} className="mt-0.5 shrink-0 text-accent" />
        <span className="text-xs text-accent">
          Plane throttle limits. Adjust these to match your ESC and motor setup.
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <ParamNumberInput
          paramName="THR_MAX"
          params={params}
          label="Throttle Max"
          unit="%"
          min={0}
          max={100}
          step={1}
          description="Maximum throttle output"
        />
        <ParamNumberInput
          paramName="THR_MIN"
          params={params}
          label="Throttle Min"
          unit="%"
          min={0}
          max={100}
          step={1}
          description="Minimum throttle output"
        />
        <ParamNumberInput
          paramName="THR_SLEWRATE"
          params={params}
          label="Slew Rate"
          unit="%/s"
          min={0}
          max={127}
          step={1}
          description="Throttle change rate limit"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main section
// ---------------------------------------------------------------------------

export function MotorsEscSection({
  params,
  vehicleState,
  connected,
}: MotorsEscSectionProps) {
  const profile = useMemo(
    () => deriveVtolProfile(vehicleState, params),
    [vehicleState, params],
  );
  const vtolLayoutModel = useMemo(
    () => getVtolLayoutModel(profile),
    [profile],
  );
  const copterLayoutModel = useMemo(() => {
    if (!profile.isCopter) return null;

    const frameClass = getStagedOrCurrent("FRAME_CLASS", params);
    const frameType = getStagedOrCurrent("FRAME_TYPE", params);
    if (frameClass == null || frameType == null) return null;

    return getApMotorDiagramModel(frameClass, frameType);
  }, [profile.isCopter, params]);

  const quadPlaneLiftSurface =
    profile.frameParamFamily === "quadplane" &&
    vtolLayoutModel != null &&
    vtolLayoutModel.status !== "unsupported" &&
    vtolLayoutModel.hasLiftMotorSurface;

  const missingQuadPlaneMotorParams = quadPlaneLiftSurface
    ? Object.values(QUADPLANE_MOTOR_PARAMS).filter(
        (name) => !hasStoreParam(params, name),
      )
    : [];

  const quadPlaneMotorControlsReady =
    quadPlaneLiftSurface && missingQuadPlaneMotorParams.length === 0;

  const activeMotorParams: MotorParamNames = quadPlaneMotorControlsReady
    ? QUADPLANE_MOTOR_PARAMS
    : COPTER_MOTOR_PARAMS;

  const showVtolGapCard =
    profile.frameParamFamily === "quadplane" &&
    (!quadPlaneMotorControlsReady || vtolLayoutModel?.status === "preview-only");

  const showPlaneThrottleFallback =
    profile.isPlane &&
    (profile.frameParamFamily !== "quadplane" ||
      vtolLayoutModel?.status === "preview-only");

  const showMotorControlCards = profile.isCopter || quadPlaneMotorControlsReady;
  const activeLayoutModel = profile.isCopter ? copterLayoutModel : vtolLayoutModel;
  const slug = getVehicleSlug(vehicleState);
  const motorsDocsUrl = resolveDocsUrl("motors_esc", slug);
  const escCalDocsUrl = resolveDocsUrl("esc_calibration", slug);

  return (
    <div className="flex flex-col gap-3 p-4">
      <SetupSectionIntro
        icon={Cog}
        title="Motors & ESC"
        description="Configure ESC protocol, test individual motors, calibrate ESCs, and set motor output ranges. Always remove propellers before testing."
        docsUrl={motorsDocsUrl}
        docsLabel="Motor Setup Docs"
      />

      {showMotorControlCards && (
        <EscProtocolCard params={params} pwmTypeParam={activeMotorParams.pwmType} />
      )}

      {showVtolGapCard && (
        <VtolMotorSurfaceCard
          layoutModel={vtolLayoutModel}
          missingMotorParams={missingQuadPlaneMotorParams}
        />
      )}

      {showMotorControlCards && vtolLayoutModel && !profile.isCopter && (
        <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
          <SectionCardHeader icon={Info} title="VTOL Motor Layout" />
          <div className="flex items-center gap-3 text-xs text-text-secondary">
            <div className="shrink-0">
              <MotorDiagram model={vtolLayoutModel} size={120} />
            </div>
            <p>
              QuadPlane lift motors are using the VTOL-specific {" "}
              <code className="rounded bg-bg-secondary px-1 py-px font-mono text-[10px]">
                Q_M_*
              </code>{" "}
              param family in this section.
            </p>
          </div>
        </div>
      )}

      {showMotorControlCards && (
        <MotorTestCard
          connected={connected}
          layoutModel={activeLayoutModel}
        />
      )}

      {showMotorControlCards && (
        <EscCalibrationCard
          params={params}
          escCalDocsUrl={escCalDocsUrl}
          pwmTypeParam={activeMotorParams.pwmType}
        />
      )}

      {showMotorControlCards && (
        <MotorRangeCard params={params} paramNames={activeMotorParams} />
      )}

      {showPlaneThrottleFallback && <PlaneThrottleCard params={params} />}
    </div>
  );
}
