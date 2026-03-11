import { useMemo } from "react";
import { Box, Compass, Info, AlertTriangle } from "lucide-react";
import { ParamSelect } from "../primitives/ParamSelect";
import { getStagedOrCurrent, getParamMeta } from "../primitives/param-helpers";
import type { ParamInputParams } from "../primitives/param-helpers";
import { MotorDiagram } from "../MotorDiagram";
import { getAllLayouts } from "../../../data/motor-layouts";
import type { VehicleState } from "../../../telemetry";
import {
  isCopterVehicleType as isCopter,
  isPlaneVehicleType as isPlane,
  hasQuadPlaneParams,
  getVehicleSlug,
} from "../shared/vehicle-helpers";
import { SetupSectionIntro } from "../shared/SetupSectionIntro";
import { SectionCardHeader } from "../shared/SectionCardHeader";
import { resolveDocsUrl } from "../../../data/ardupilot-docs";

// ---------------------------------------------------------------------------
// Frame type filtering by class
// ---------------------------------------------------------------------------

const layoutsByClass = new Map<number, Set<number>>();
for (const layout of getAllLayouts()) {
  let types = layoutsByClass.get(layout.frameClass);
  if (!types) {
    types = new Set();
    layoutsByClass.set(layout.frameClass, types);
  }
  types.add(layout.frameType);
}

function useFilteredTypeOptions(
  frameTypeParam: string,
  frameClass: number | null,
  params: ParamInputParams,
): { value: number; label: string }[] | undefined {
  const meta = getParamMeta(frameTypeParam, params.metadata);
  return useMemo(() => {
    if (frameClass == null || !meta?.values) return undefined;
    const validTypes = layoutsByClass.get(frameClass);
    if (!validTypes) return undefined;
    return meta.values
      .filter((v) => validTypes.has(v.code))
      .map((v) => ({ value: v.code, label: v.label }));
  }, [frameClass, meta]);
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type FrameOrientationSectionProps = {
  params: ParamInputParams;
  vehicleState: VehicleState | null;
};

// ---------------------------------------------------------------------------
// Frame panel
// ---------------------------------------------------------------------------

function FrameSelectionPanel({
  params,
  vehicleState,
}: {
  params: ParamInputParams;
  vehicleState: VehicleState | null;
}) {
  const copter = isCopter(vehicleState);
  const plane = isPlane(vehicleState);
  const quadPlane = plane && hasQuadPlaneParams(params);
  const showFrameSelection = copter || quadPlane;

  const frameClassParam = quadPlane ? "Q_FRAME_CLASS" : "FRAME_CLASS";
  const frameTypeParam = quadPlane ? "Q_FRAME_TYPE" : "FRAME_TYPE";

  const frameClass = getStagedOrCurrent(frameClassParam, params);
  const frameType = getStagedOrCurrent(frameTypeParam, params);

  const filteredTypeOptions = useFilteredTypeOptions(frameTypeParam, frameClass, params);

  const currentFrameClass = params.store?.params[frameClassParam]?.value ?? null;
  const frameClassChanged =
    currentFrameClass !== null &&
    frameClass !== null &&
    frameClass !== currentFrameClass;

  return (
    <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
      <SectionCardHeader
        icon={Box}
        title={quadPlane ? "QuadPlane Frame" : "Frame Configuration"}
      />

      {showFrameSelection ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ParamSelect
              paramName={frameClassParam}
              params={params}
              label="Frame Class"
            />
            <ParamSelect
              paramName={frameTypeParam}
              params={params}
              label="Frame Type"
              options={filteredTypeOptions}
            />
          </div>

          {frameClassChanged && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2.5">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
              <p className="text-xs text-warning">
                Frame class change requires a vehicle reboot. Apply staged
                changes and reboot before testing motors.
              </p>
            </div>
          )}

          {frameClass != null && frameType != null && (
            <div className="mt-4 flex flex-col items-center gap-2 rounded-md border border-border/50 bg-bg-secondary/40 py-4">
              <MotorDiagram
                frameClass={frameClass}
                frameType={frameType}
                size={180}
              />
              <span className="text-[10px] text-text-muted">
                Motor layout preview
              </span>
            </div>
          )}
        </>
      ) : plane ? (
        <div className="flex items-start gap-2 rounded-md border border-border bg-bg-secondary/50 px-3 py-2.5">
          <Info size={14} className="mt-0.5 shrink-0 text-accent" />
          <p className="text-xs text-text-secondary">
            Fixed-wing aircraft do not use frame class or type configuration.
            The airframe layout is determined by the firmware loaded on your
            flight controller.
          </p>
        </div>
      ) : (
        /* Fallback: vehicleState null or unrecognised — show copter defaults */
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ParamSelect
            paramName="FRAME_CLASS"
            params={params}
            label="Frame Class"
          />
          <ParamSelect
            paramName="FRAME_TYPE"
            params={params}
            label="Frame Type"
            options={filteredTypeOptions}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Board orientation panel
// ---------------------------------------------------------------------------

function BoardOrientationPanel({ params }: { params: ParamInputParams }) {
  return (
    <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
      <SectionCardHeader icon={Compass} title="Board Orientation" />

      <ParamSelect
        paramName="AHRS_ORIENTATION"
        params={params}
        label="Orientation"
        description="Set the physical orientation of the flight controller on your frame. The arrow on the FC should point forward. If mounted differently, select the rotation that matches."
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section root
// ---------------------------------------------------------------------------

export function FrameOrientationSection({
  params,
  vehicleState,
}: FrameOrientationSectionProps) {
  const slug = getVehicleSlug(vehicleState);
  const frameDocsUrl = resolveDocsUrl("frame_type", slug);

  return (
    <div className="flex flex-col gap-4 p-4">
      <SetupSectionIntro
        icon={Box}
        title="Frame & Orientation"
        description="Configure your vehicle's frame type and board orientation. The frame class determines motor layout and mixing, while board orientation tells the flight controller how it's mounted."
        docsUrl={frameDocsUrl}
        docsLabel="Frame Configuration"
      />
      <FrameSelectionPanel params={params} vehicleState={vehicleState} />
      <BoardOrientationPanel params={params} />
    </div>
  );
}
