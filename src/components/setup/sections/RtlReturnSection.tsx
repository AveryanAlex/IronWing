import { Home, Plane, AlertTriangle, ExternalLink } from "lucide-react";
import { ParamSelect } from "../primitives/ParamSelect";
import {
  getStagedOrCurrent,
  getParamMeta,
  StagedBadge,
} from "../primitives/param-helpers";
import type { ParamInputParams } from "../primitives/param-helpers";
import type { VehicleState } from "../../../telemetry";

// ---------------------------------------------------------------------------
// Vehicle type helpers
// ---------------------------------------------------------------------------

function isPlane(vehicleState: VehicleState | null): boolean {
  if (!vehicleState) return false;
  return vehicleState.vehicle_type.toLowerCase().includes("fixed_wing");
}

// ---------------------------------------------------------------------------
// Unit conversion (exported for testing)
// ---------------------------------------------------------------------------

export function toDisplayValue(raw: number, factor: number): number {
  return raw / factor;
}

export function toRawValue(display: number, factor: number): number {
  return Math.round(display * factor);
}

export function formatDisplayValue(value: number, decimals: number): string {
  return value.toFixed(decimals);
}

export const COPTER_RTL_DOCS_URL =
  "https://ardupilot.org/copter/docs/rtl-mode.html";
export const PLANE_RTL_DOCS_URL =
  "https://ardupilot.org/plane/docs/rtl-mode.html";

// ---------------------------------------------------------------------------
// ScaledParamInput — displays/edits in user-friendly units
// ---------------------------------------------------------------------------

type ScaledParamInputProps = {
  paramName: string;
  params: ParamInputParams;
  label?: string;
  description?: string;
  displayUnit: string;
  factor: number;
  decimals?: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  sentinel?: number;
};

function ScaledParamInput({
  paramName,
  params,
  label,
  description,
  displayUnit,
  factor,
  decimals = 2,
  min,
  max,
  step,
  disabled,
  sentinel,
}: ScaledParamInputProps) {
  const rawValue = getStagedOrCurrent(paramName, params);
  const displayValue =
    rawValue != null
      ? sentinel !== undefined && rawValue === sentinel
        ? rawValue
        : toDisplayValue(rawValue, factor)
      : null;
  const isStaged = params.staged.has(paramName);
  const meta = getParamMeta(paramName, params.metadata);

  const resolvedLabel = label ?? meta?.humanName ?? paramName;
  const resolvedDescription = description ?? meta?.description;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-text-muted">
          {resolvedLabel}
        </span>
        {isStaged && (
          <StagedBadge paramName={paramName} unstage={params.unstage} />
        )}
        {meta?.rebootRequired && (
          <span className="rounded bg-danger/10 px-1 py-px text-[9px] font-medium text-danger">
            reboot
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          value={displayValue != null ? formatDisplayValue(displayValue, sentinel !== undefined && displayValue === sentinel ? 0 : decimals) : ""}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!Number.isNaN(v)) {
              const raw =
                sentinel !== undefined && v === sentinel
                  ? sentinel
                  : toRawValue(v, factor);
              params.stage(paramName, raw);
            }
          }}
          min={min}
          max={max}
          step={step}
          disabled={disabled ?? meta?.readOnly}
          className="w-full rounded border border-border bg-bg-input px-2 py-1.5 text-xs font-mono text-text-primary focus:border-accent focus:outline-none disabled:opacity-50"
        />
        <span className="shrink-0 text-[10px] text-text-muted">
          {displayUnit}
        </span>
      </div>
      {resolvedDescription && (
        <span className="text-[10px] text-text-muted">
          {resolvedDescription}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plane RTL autoland options
// ---------------------------------------------------------------------------

const PLANE_RTL_AUTOLAND_OPTIONS = [
  { value: 0, label: "Loiter at home" },
  { value: 1, label: "Land if DO_LAND_START defined" },
  { value: 2, label: "Always land at home" },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type RtlReturnSectionProps = {
  params: ParamInputParams;
  vehicleState: VehicleState | null;
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function RtlReturnSection({
  params,
  vehicleState,
}: RtlReturnSectionProps) {
  const plane = isPlane(vehicleState);
  const docsUrl = plane ? PLANE_RTL_DOCS_URL : COPTER_RTL_DOCS_URL;

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* Header */}
      <div className="rounded-lg border border-border-light bg-accent/5 p-4">
        <div className="flex items-center gap-2">
          <Home size={14} className="text-accent" />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                Return to Launch (RTL)
              </h3>
              {vehicleState && (
                <a
                  href={docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] text-accent hover:underline"
                >
                  How RTL works
                  <ExternalLink size={10} />
                </a>
              )}
            </div>
            <p className="mt-0.5 text-[10px] text-text-muted">
              {plane
                ? "Configure altitude and landing behavior when the plane returns home."
                : "Configure altitude, speed, and behavior when returning home. Home is the GPS location at arm time."}
            </p>
            {vehicleState && !plane && (
              <p className="mt-0.5 text-[10px] text-text-muted/70">
                If rally points are configured, RTL returns to the nearest one
                instead of home.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Copter RTL */}
      {/* ----------------------------------------------------------------- */}
      {vehicleState && !plane && (
        <>
          {/* Return Altitude */}
          <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Home size={14} className="text-accent" />
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                Return Altitude
              </h3>
            </div>
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-4">
                <ScaledParamInput
                  paramName="RTL_ALT"
                  params={params}
                  label="Return Altitude"
                  description="Minimum altitude before returning. 0 = maintain current."
                  displayUnit="m"
                  factor={100}
                  min={0}
                  step={1}
                />
                <ScaledParamInput
                  paramName="RTL_ALT_FINAL"
                  params={params}
                  label="Final Altitude"
                  description="Hover altitude above home after RTL. 0 = auto-land."
                  displayUnit="m"
                  factor={100}
                  min={0}
                  step={1}
                />
              </div>
              <ScaledParamInput
                paramName="RTL_CLIMB_MIN"
                params={params}
                label="Minimum Climb"
                description="Minimum altitude gain before returning. 0 = disabled."
                displayUnit="m"
                factor={1}
                min={0}
                step={1}
              />
              {getStagedOrCurrent("RTL_ALT", params) === 0 && (
                <div className="flex items-center gap-2 rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
                  <AlertTriangle
                    size={13}
                    strokeWidth={2.5}
                    className="shrink-0"
                  />
                  <span>
                    RTL altitude is 0 — vehicle will return at its current
                    altitude, which may be too low for obstacles.
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Return Speed & Timing */}
          <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Home size={14} className="text-accent" />
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                Return Speed & Timing
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <ScaledParamInput
                paramName="RTL_SPEED"
                params={params}
                label="Return Speed"
                description="Horizontal speed during return. 0 = use default waypoint speed."
                displayUnit="m/s"
                factor={100}
                min={0}
                step={0.5}
              />
              <ScaledParamInput
                paramName="RTL_LOIT_TIME"
                params={params}
                label="Loiter Time"
                description="Hover time above home before final descent or landing."
                displayUnit="s"
                factor={1000}
                decimals={1}
                min={0}
                step={1}
              />
            </div>
          </div>
        </>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Plane RTL */}
      {/* ----------------------------------------------------------------- */}
      {plane && (
        <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Plane size={14} className="text-accent" />
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              Plane RTL Configuration
            </h3>
          </div>
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-4">
              <ScaledParamInput
                paramName="ALT_HOLD_RTL"
                params={params}
                label="Return Altitude"
                description="Altitude during RTL. Set to −1 for current altitude."
                displayUnit="m"
                factor={100}
                sentinel={-1}
                min={-1}
                step={1}
              />
              <ParamSelect
                paramName="RTL_AUTOLAND"
                params={params}
                label="Auto-Land Behavior"
                description="Whether the plane lands automatically after reaching home."
                options={PLANE_RTL_AUTOLAND_OPTIONS}
              />
            </div>
          </div>
        </div>
      )}

      {/* No vehicle state fallback */}
      {!vehicleState && (
        <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4 text-center">
          <p className="text-xs text-text-muted">
            Connect to a vehicle to see RTL parameters for your vehicle type.
          </p>
        </div>
      )}
    </div>
  );
}
