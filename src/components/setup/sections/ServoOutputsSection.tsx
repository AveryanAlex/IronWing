import { useMemo } from "react";
import { AlertTriangle, Info, Plane, SlidersHorizontal } from "lucide-react";
import { ParamSelect } from "../primitives/ParamSelect";
import { ParamNumberInput } from "../primitives/ParamNumberInput";
import { ParamToggle } from "../primitives/ParamToggle";
import type { ParamInputParams } from "../primitives/param-helpers";
import type { VehicleState } from "../../../telemetry";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MOTOR_FUNCTION_MIN = 33;
const MOTOR_FUNCTION_MAX = 40;
const MAX_SERVO_INDEX = 32;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function detectServoIndices(params: ParamInputParams): number[] {
  const indices: number[] = [];
  for (let i = 1; i <= MAX_SERVO_INDEX; i++) {
    const key = `SERVO${i}_FUNCTION`;
    if (params.store?.params[key] !== undefined) {
      indices.push(i);
    }
  }
  return indices;
}

function isMotorFunction(functionValue: number | null): boolean {
  if (functionValue == null) return false;
  return functionValue >= MOTOR_FUNCTION_MIN && functionValue <= MOTOR_FUNCTION_MAX;
}

function hasAnyMotorAssignment(
  indices: number[],
  params: ParamInputParams,
): boolean {
  for (const i of indices) {
    const val = params.store?.params[`SERVO${i}_FUNCTION`]?.value ?? null;
    const staged = params.staged.get(`SERVO${i}_FUNCTION`);
    if (isMotorFunction(staged ?? val)) return true;
  }
  return false;
}

function isPlane(vehicleState: VehicleState | null): boolean {
  if (!vehicleState) return false;
  return vehicleState.vehicle_type.toLowerCase().includes("fixed_wing");
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MotorAssignmentBanner() {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-warning/20 bg-warning/5 p-3">
      <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-medium text-text-primary">
          Motor assignments are automatic
        </span>
        <span className="text-[11px] text-text-secondary">
          Motor function outputs (Motor 1–8) are set automatically based on your
          frame type. Changing motor-assigned servo functions is for advanced
          users only.
        </span>
      </div>
    </div>
  );
}

function PlaneGuidanceBanner() {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-accent/20 bg-accent/5 p-3">
      <Plane size={14} className="mt-0.5 shrink-0 text-accent" />
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-medium text-text-primary">
          Fixed-wing servo setup
        </span>
        <span className="text-[11px] text-text-secondary">
          For planes, assign control surfaces to servo outputs: Aileron (4),
          Elevator (19), Rudder (21), and Throttle (70). Verify min/max/trim
          values match your servo travel, and use Reversed to correct control
          direction.
        </span>
      </div>
    </div>
  );
}

function ServoRow({
  index,
  params,
}: {
  index: number;
  params: ParamInputParams;
}) {
  const prefix = `SERVO${index}`;
  const functionParam = `${prefix}_FUNCTION`;
  const functionValue = params.store?.params[functionParam]?.value ?? null;
  const stagedFunction = params.staged.get(functionParam);
  const isMotor = isMotorFunction(stagedFunction ?? functionValue);

  return (
    <div
      className={`flex flex-col gap-2 rounded-lg border p-3 transition-colors ${
        isMotor
          ? "border-warning/20 bg-warning/5"
          : "border-border bg-bg-tertiary/50"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center">
          <span className="text-xs font-semibold text-text-primary whitespace-nowrap">
            {prefix}
          </span>
          {isMotor && (
            <span className="ml-1.5 rounded bg-warning/15 px-1 py-px text-[9px] font-medium text-warning">
              motor
            </span>
          )}
        </div>
        <ParamToggle
          paramName={`${prefix}_REVERSED`}
          params={params}
          label="Rev"
        />
      </div>

      <ParamSelect
        paramName={functionParam}
        params={params}
        label="Function"
      />

      <div className="grid grid-cols-3 gap-2">
        <ParamNumberInput
          paramName={`${prefix}_MIN`}
          params={params}
          label="Min"
          unit="µs"
          min={500}
          max={2200}
          step={1}
        />
        <ParamNumberInput
          paramName={`${prefix}_MAX`}
          params={params}
          label="Max"
          unit="µs"
          min={800}
          max={2200}
          step={1}
        />
        <ParamNumberInput
          paramName={`${prefix}_TRIM`}
          params={params}
          label="Trim"
          unit="µs"
          min={500}
          max={2200}
          step={1}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type ServoOutputsSectionProps = {
  params: ParamInputParams;
  vehicleState: VehicleState | null;
};

// ---------------------------------------------------------------------------
// Main section
// ---------------------------------------------------------------------------

export function ServoOutputsSection({
  params,
  vehicleState,
}: ServoOutputsSectionProps) {
  const servoIndices = useMemo(() => detectServoIndices(params), [params.store]);
  const showMotorBanner = useMemo(
    () => hasAnyMotorAssignment(servoIndices, params),
    [servoIndices, params.store, params.staged],
  );
  const showPlaneBanner = isPlane(vehicleState);

  if (servoIndices.length === 0) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-bg-tertiary/50 p-4">
          <Info size={14} className="mt-0.5 shrink-0 text-text-muted" />
          <span className="text-sm text-text-muted">
            Servo output parameters not available. Download parameters first.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <SlidersHorizontal size={16} className="text-accent shrink-0" />
        <h2 className="text-sm font-semibold text-text-primary">
          Servo Outputs
        </h2>
        <span className="ml-auto rounded bg-bg-tertiary px-1.5 py-0.5 text-[10px] font-mono text-text-muted">
          {servoIndices.length} outputs
        </span>
      </div>

      {/* Info banners */}
      {showMotorBanner && <MotorAssignmentBanner />}
      {showPlaneBanner && <PlaneGuidanceBanner />}

      {/* Servo table — one card per output */}
      <div className="flex flex-col gap-2">
        {servoIndices.map((index) => (
          <ServoRow key={index} index={index} params={params} />
        ))}
      </div>
    </div>
  );
}
