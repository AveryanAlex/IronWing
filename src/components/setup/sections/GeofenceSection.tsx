import {
  Fence,
  AlertTriangle,
  MapPin,
  ArrowUpFromDot,
  ArrowDownToDot,
  Info,
} from "lucide-react";
import { ParamToggle } from "../primitives/ParamToggle";
import { ParamBitmaskInput } from "../primitives/ParamBitmaskInput";
import { ParamNumberInput } from "../primitives/ParamNumberInput";
import { ParamSelect } from "../primitives/ParamSelect";
import { getStagedOrCurrent } from "../primitives/param-helpers";
import type { ParamInputParams } from "../primitives/param-helpers";
import type { VehicleState } from "../../../telemetry";

// ---------------------------------------------------------------------------
// Vehicle type helpers
// ---------------------------------------------------------------------------

function isCopter(vehicleState: VehicleState | null): boolean {
  if (!vehicleState) return false;
  const t = vehicleState.vehicle_type.toLowerCase();
  return (
    t.includes("quadrotor") ||
    t.includes("helicopter") ||
    t.includes("hexarotor") ||
    t.includes("octorotor") ||
    t.includes("tricopter") ||
    t.includes("coaxial")
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type GeofenceSectionProps = {
  params: ParamInputParams;
  vehicleState: VehicleState | null;
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function GeofenceSection({ params, vehicleState }: GeofenceSectionProps) {
  const copter = isCopter(vehicleState);

  const fenceEnabled = (getStagedOrCurrent("FENCE_ENABLE", params) ?? 0) !== 0;
  const fenceType = getStagedOrCurrent("FENCE_TYPE", params) ?? 0;
  const hasCircleOrPolygon = (fenceType & 0b0110) !== 0; // bits 1 (circle) or 2 (polygon)

  // Cross-validation: ALT_MAX > ALT_MIN
  const altMax = getStagedOrCurrent("FENCE_ALT_MAX", params);
  const altMin = getStagedOrCurrent("FENCE_ALT_MIN", params);
  const showAltWarning =
    altMax != null &&
    altMin != null &&
    altMax > 0 &&
    altMin > 0 &&
    altMax <= altMin;

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* ----------------------------------------------------------------- */}
      {/* Enable Panel */}
      {/* ----------------------------------------------------------------- */}
      <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Fence size={14} className="text-accent" />
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Fence Enable
          </h3>
        </div>
        <ParamToggle
          paramName="FENCE_ENABLE"
          params={params}
          label="Enable Geofence"
          description="Activate the virtual fence boundary around the vehicle"
        />
        {fenceEnabled && hasCircleOrPolygon && (
          <div className="mt-3 flex items-center gap-2 rounded-md bg-accent/10 px-3 py-2 text-xs text-accent">
            <Info size={13} strokeWidth={2.5} className="shrink-0" />
            <span>
              Enabling fence with circle or polygon requires GPS lock to arm
            </span>
          </div>
        )}
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Fence Type Panel */}
      {/* ----------------------------------------------------------------- */}
      <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
        <div className="mb-3 flex items-center gap-2">
          <MapPin size={14} className="text-accent" />
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Fence Type
          </h3>
        </div>
        <ParamBitmaskInput
          paramName="FENCE_TYPE"
          params={params}
          label="Fence Boundary Types"
          description="Select which boundary types to enforce"
        />
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Fence Parameters Panel (shown when enabled) */}
      {/* ----------------------------------------------------------------- */}
      {fenceEnabled && (
        <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
          <div className="mb-3 flex items-center gap-2">
            <ArrowUpFromDot size={14} className="text-accent" />
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              Fence Parameters
            </h3>
          </div>
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-4">
              <ParamNumberInput
                paramName="FENCE_ALT_MAX"
                params={params}
                label="Max Altitude"
                unit="m"
                min={0}
                step={1}
                placeholder="100"
              />
              {copter && (
                <ParamNumberInput
                  paramName="FENCE_ALT_MIN"
                  params={params}
                  label="Min Altitude"
                  unit="m"
                  step={1}
                  placeholder="0"
                />
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              {copter && (
                <ParamNumberInput
                  paramName="FENCE_RADIUS"
                  params={params}
                  label="Circle Radius"
                  unit="m"
                  min={0}
                  step={1}
                  placeholder="300"
                />
              )}
              <ParamNumberInput
                paramName="FENCE_MARGIN"
                params={params}
                label="Margin"
                unit="m"
                min={0}
                step={1}
                placeholder="2"
                description="Buffer distance before triggering breach action"
              />
            </div>

            {/* Cross-validation: ALT_MAX > ALT_MIN */}
            {showAltWarning && (
              <div className="flex items-center gap-2 rounded-md bg-danger/10 px-3 py-2 text-xs text-danger">
                <AlertTriangle size={13} strokeWidth={2.5} className="shrink-0" />
                <span>
                  Max altitude must be greater than min altitude
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Breach Action Panel */}
      {/* ----------------------------------------------------------------- */}
      <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
        <div className="mb-3 flex items-center gap-2">
          <ArrowDownToDot size={14} className="text-accent" />
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Breach Action
          </h3>
        </div>
        <ParamSelect
          paramName="FENCE_ACTION"
          params={params}
          label="Action on Breach"
          description="Action taken when the vehicle crosses the fence boundary"
        />
        {!fenceEnabled && (
          <div className="mt-3 flex items-center gap-2 rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
            <AlertTriangle size={13} strokeWidth={2.5} className="shrink-0" />
            <span>Fence is disabled — breach action will not trigger</span>
          </div>
        )}
      </div>
    </div>
  );
}
