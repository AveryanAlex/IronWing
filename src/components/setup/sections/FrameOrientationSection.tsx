import { useMemo, type ReactNode } from "react";
import { Box, Compass, Info, AlertTriangle } from "lucide-react";
import { ParamSelect } from "../primitives/ParamSelect";
import { getParamMeta, type ParamInputParams } from "../primitives/param-helpers";
import { MotorDiagram } from "../MotorDiagram";
import { getAllLayouts } from "../../../data/motor-layouts";
import type { VehicleState } from "../../../telemetry";
import {
  deriveVtolProfile,
  getVehicleSlug,
} from "../shared/vehicle-helpers";
import { getVtolLayoutModel } from "../shared/vtol-layouts";
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

const Q_ENABLE_FALLBACK_OPTIONS = [
  { value: 0, label: "Disabled" },
  { value: 1, label: "Enabled (QuadPlane)" },
];

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

function Callout({
  tone,
  children,
}: {
  tone: "info" | "warning";
  children: ReactNode;
}) {
  const Icon = tone === "warning" ? AlertTriangle : Info;
  const classes =
    tone === "warning"
      ? "border-warning/30 bg-warning/10 text-warning"
      : "border-border bg-bg-secondary/50 text-text-secondary";

  return (
    <div className={`flex items-start gap-2 rounded-md border px-3 py-2.5 ${classes}`}>
      <Icon size={14} className="mt-0.5 shrink-0" />
      <div className="text-xs leading-relaxed">{children}</div>
    </div>
  );
}

function quadPlaneTitle(subtype: ReturnType<typeof deriveVtolProfile>["subtype"]): string {
  switch (subtype) {
    case "tiltrotor":
      return "Tilt-Rotor QuadPlane Frame";
    case "tailsitter":
      return "Tailsitter QuadPlane Frame";
    default:
      return "QuadPlane Frame";
  }
}

function quadPlaneSubtypeCopy(
  subtype: ReturnType<typeof deriveVtolProfile>["subtype"],
): string | null {
  switch (subtype) {
    case "tiltrotor":
      return "Tilt-rotor QuadPlane detected. Lift-motor frame class and type still come from the QuadPlane Q_FRAME_* parameters.";
    case "tailsitter":
      return "Tailsitter QuadPlane detected. Frame class and type still come from the QuadPlane Q_FRAME_* parameters after the VTOL params refresh.";
    default:
      return null;
  }
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
  const profile = useMemo(
    () => deriveVtolProfile(vehicleState, params),
    [vehicleState, params],
  );
  const vtolLayoutModel = useMemo(
    () => getVtolLayoutModel(profile),
    [profile],
  );

  const frameClassParam = profile.frameClassParam;
  const frameTypeParam = profile.frameTypeParam;
  const frameClass = profile.frameClassValue;
  const frameType = profile.frameTypeValue;
  const filteredTypeOptions = useFilteredTypeOptions(
    frameTypeParam ?? "FRAME_TYPE",
    frameClass,
    params,
  );

  const qEnableOptions = useMemo(() => {
    const meta = getParamMeta("Q_ENABLE", params.metadata);
    return (
      meta?.values?.map((value) => ({
        value: value.code,
        label: value.label,
      })) ?? Q_ENABLE_FALLBACK_OPTIONS
    );
  }, [params.metadata]);

  const frameClassMeta = frameClassParam
    ? getParamMeta(frameClassParam, params.metadata)
    : null;
  const frameTypeMeta = frameTypeParam
    ? getParamMeta(frameTypeParam, params.metadata)
    : null;

  const frameMetadataIncomplete =
    profile.frameParamFamily === "quadplane" &&
    (!frameClassMeta?.values?.length || !frameTypeMeta?.values?.length);

  if (profile.frameParamFamily && frameClassParam && frameTypeParam) {
    const resolvedFrameClassParam = frameClassParam;
    const resolvedFrameTypeParam = frameTypeParam;
    const sectionTitle =
      profile.frameParamFamily === "quadplane"
        ? quadPlaneTitle(profile.subtype)
        : "Frame Configuration";
    const subtypeCopy = quadPlaneSubtypeCopy(profile.subtype);

    return (
      <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
        <SectionCardHeader icon={Box} title={sectionTitle} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ParamSelect
            paramName={resolvedFrameClassParam}
            params={params}
            label="Frame Class"
          />
          <ParamSelect
            paramName={resolvedFrameTypeParam}
            params={params}
            label="Frame Type"
            options={filteredTypeOptions}
          />
        </div>

        {subtypeCopy && <div className="mt-3"><Callout tone="info">{subtypeCopy}</Callout></div>}

        {profile.hasUnsupportedSubtype && (
          <div className="mt-3">
            <Callout tone="warning">
              Both tilt-rotor and tailsitter flags are enabled. Keep using the
              QuadPlane frame parameters, but confirm the airframe setup after a
              full parameter refresh before testing motors.
            </Callout>
          </div>
        )}

        {profile.rebootRequiredBeforeTesting && (
          <div className="mt-3">
            <Callout tone="warning">
              Frame or VTOL configuration changed. Apply staged changes and
              reboot before testing motors.
            </Callout>
          </div>
        )}

        {frameMetadataIncomplete && (
          <div className="mt-3">
            <Callout tone="info">
              QuadPlane frame metadata is incomplete, so unsupported values may
              appear as raw numbers until metadata refresh completes.
            </Callout>
          </div>
        )}

        {vtolLayoutModel?.message && vtolLayoutModel.status !== "unsupported" && (
          <div className="mt-3">
            <Callout tone="info">
              {vtolLayoutModel.message}
            </Callout>
          </div>
        )}

        {frameClass != null && frameType != null && (
          <div className="mt-4 flex flex-col items-center gap-2 rounded-md border border-border/50 bg-bg-secondary/40 py-4">
            <MotorDiagram
              model={profile.frameParamFamily === "quadplane" ? vtolLayoutModel : undefined}
              frameClass={profile.frameParamFamily === "quadplane" ? null : frameClass}
              frameType={profile.frameParamFamily === "quadplane" ? null : frameType}
              size={180}
            />
            <span className="text-[10px] text-text-muted">
              {vtolLayoutModel?.status === "unsupported"
                ? "Unsupported VTOL layout"
                : vtolLayoutModel?.source === "custom"
                  ? "Custom VTOL layout preview"
                  : "Motor layout preview"}
            </span>
          </div>
        )}
      </div>
    );
  }

  if (profile.isPlane) {
    return (
      <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
        <SectionCardHeader icon={Box} title="QuadPlane Configuration" />

        {profile.hasVtolToggle ? (
          <ParamSelect
            paramName="Q_ENABLE"
            params={params}
            label="VTOL / QuadPlane"
            description="Enable QuadPlane to expose VTOL frame, motor, and tuning parameters on Plane firmware."
            options={qEnableOptions}
          />
        ) : (
          <Callout tone="info">
            This Plane parameter set does not expose the QuadPlane enable
            control yet. Refresh parameters if you recently changed firmware or
            vehicle type.
          </Callout>
        )}

        <div className="mt-3">
          {profile.planeVtolState === "plain-plane" && profile.hasVtolToggle && (
            <Callout tone="info">
              Plane firmware can expose a QuadPlane setup path here. Enable
              <code className="mx-1 rounded bg-bg-secondary px-1 py-px font-mono text-[10px] text-text-primary">Q_ENABLE</code>
              then apply the change, reboot, and refresh parameters to continue
              with VTOL frame configuration.
            </Callout>
          )}

          {profile.planeVtolState === "enable-pending" && (
            <Callout tone="warning">
              QuadPlane enable is staged. Apply the change, reboot the vehicle,
              refresh parameters, then return here before testing motors.
            </Callout>
          )}

          {profile.planeVtolState === "awaiting-refresh" && (
            <Callout tone="warning">
              QuadPlane is enabled, but the VTOL frame parameters are not loaded
              yet. Reboot the vehicle if needed and refresh parameters to expose
              <code className="mx-1 rounded bg-warning/10 px-1 py-px font-mono text-[10px]">Q_FRAME_CLASS</code>
              and
              <code className="mx-1 rounded bg-warning/10 px-1 py-px font-mono text-[10px]">Q_FRAME_TYPE</code>
              before testing motors.
            </Callout>
          )}

          {profile.planeVtolState === "partial-refresh" && (
            <Callout tone="warning">
              QuadPlane parameters are only partially available right now.
              Refresh parameters before changing VTOL frame settings so the UI
              does not guess the wrong layout.
            </Callout>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
      <SectionCardHeader icon={Box} title="Frame Configuration" />
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
