import {
  Activity,
  Crosshair,
  Move3D,
  SlidersHorizontal,
  Plane,
  Gauge,
} from "lucide-react";
import { ParamNumberInput } from "../primitives/ParamNumberInput";
import { ParamSelect } from "../primitives/ParamSelect";
import { getStagedOrCurrent } from "../primitives/param-helpers";
import type { ParamInputParams } from "../primitives/param-helpers";
import type { VehicleState } from "../../../telemetry";
import {
  isPlaneVehicleType as isPlane,
  isCopterVehicleType as isCopter,
} from "../shared/vehicle-helpers";
import { SetupSectionIntro } from "../shared/SetupSectionIntro";
import { SectionCardHeader } from "../shared/SectionCardHeader";
import { resolveDocsUrl } from "../../../data/ardupilot-docs";

// ---------------------------------------------------------------------------
// Rate PID axis config
// ---------------------------------------------------------------------------

type RateAxis = {
  label: string;
  prefix: string;
};

const RATE_AXES: RateAxis[] = [
  { label: "Roll", prefix: "ATC_RAT_RLL" },
  { label: "Pitch", prefix: "ATC_RAT_PIT" },
  { label: "Yaw", prefix: "ATC_RAT_YAW" },
];

const RATE_PRIMARY_GAINS = [
  { suffix: "_P", label: "P", step: 0.001 },
  { suffix: "_I", label: "I", step: 0.001 },
  { suffix: "_D", label: "D", step: 0.0001 },
  { suffix: "_FF", label: "FF", step: 0.001 },
];

const RATE_FILTERS = [
  { suffix: "_FLTD", label: "D Filter", unit: "Hz", step: 1 },
  { suffix: "_FLTE", label: "Error Filter", unit: "Hz", step: 1 },
  { suffix: "_FLTT", label: "Target Filter", unit: "Hz", step: 1 },
  { suffix: "_IMAX", label: "I Max", step: 0.01 },
];

// ---------------------------------------------------------------------------
// Rate PID axis card
// ---------------------------------------------------------------------------

function RateAxisCard({
  axis,
  params,
}: {
  axis: RateAxis;
  params: ParamInputParams;
}) {
  return (
    <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
      <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
        {axis.label} Rate
      </h4>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {RATE_PRIMARY_GAINS.map((g) => (
          <ParamNumberInput
            key={g.suffix}
            paramName={`${axis.prefix}${g.suffix}`}
            params={params}
            label={g.label}
            step={g.step}
            min={0}
          />
        ))}
      </div>

      <div className="mt-3 border-t border-border pt-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {RATE_FILTERS.map((f) => (
            <ParamNumberInput
              key={f.suffix}
              paramName={`${axis.prefix}${f.suffix}`}
              params={params}
              label={f.label}
              unit={f.unit}
              step={f.step}
              min={0}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plane PID axis config
// ---------------------------------------------------------------------------

type PlaneAxisConfig = {
  label: string;
  params: { name: string; label: string; step: number }[];
};

const PLANE_AXES: PlaneAxisConfig[] = [
  {
    label: "Roll → Servo (RLL2SRV)",
    params: [
      { name: "RLL2SRV_P", label: "P", step: 0.01 },
      { name: "RLL2SRV_I", label: "I", step: 0.01 },
      { name: "RLL2SRV_D", label: "D", step: 0.001 },
      { name: "RLL2SRV_FF", label: "FF", step: 0.001 },
      { name: "RLL2SRV_IMAX", label: "I Max", step: 0.01 },
      { name: "RLL2SRV_TCONST", label: "Time Constant", step: 0.05 },
    ],
  },
  {
    label: "Pitch → Servo (PTCH2SRV)",
    params: [
      { name: "PTCH2SRV_P", label: "P", step: 0.01 },
      { name: "PTCH2SRV_I", label: "I", step: 0.01 },
      { name: "PTCH2SRV_D", label: "D", step: 0.001 },
      { name: "PTCH2SRV_FF", label: "FF", step: 0.001 },
      { name: "PTCH2SRV_IMAX", label: "I Max", step: 0.01 },
      { name: "PTCH2SRV_TCONST", label: "Time Constant", step: 0.05 },
    ],
  },
  {
    label: "Yaw Damper (YAW2SRV)",
    params: [
      { name: "YAW2SRV_DAMP", label: "Damping", step: 0.01 },
      { name: "YAW2SRV_INT", label: "Integrator", step: 0.01 },
      { name: "YAW2SRV_RLL", label: "Roll Compensation", step: 0.01 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Harmonic notch mode options
// ---------------------------------------------------------------------------

const HNTCH_MODE_OPTIONS = [
  { value: 0, label: "Fixed" },
  { value: 1, label: "Throttle" },
  { value: 2, label: "RPM Sensor" },
  { value: 3, label: "ESC Telemetry" },
  { value: 4, label: "Dynamic FFT" },
  { value: 5, label: "Second RPM Sensor" },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type PidTuningSectionProps = {
  params: ParamInputParams;
  vehicleState: VehicleState | null;
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PidTuningSection({
  params,
  vehicleState,
}: PidTuningSectionProps) {
  const plane = isPlane(vehicleState);
  const copter = isCopter(vehicleState);

  const hntchEnabled = getStagedOrCurrent("INS_HNTCH_ENABLE", params);

  const tuningDocsUrl = resolveDocsUrl("tuning");
  const description = copter
    ? "Tune rate, angle, and position controllers for your multirotor"
    : plane
      ? "Tune servo and speed controllers for your fixed-wing aircraft"
      : "Connect to a vehicle to see tuning parameters for your vehicle type";

  return (
    <div className="flex flex-col gap-3 p-4">
      <SetupSectionIntro
        icon={Activity}
        title="PID Tuning"
        description={description}
        docsUrl={tuningDocsUrl}
        docsLabel="Tuning Docs"
      />

      {/* ================================================================= */}
      {/* COPTER PANELS                                                     */}
      {/* ================================================================= */}
      {copter && (
        <>
          {/* --------------------------------------------------------------- */}
          {/* Rate PIDs (Roll / Pitch / Yaw)                                  */}
          {/* --------------------------------------------------------------- */}
          <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
            <SectionCardHeader icon={Crosshair} title="Rate PIDs — Inner loop rate controllers (deg/s)" />
            <div className="flex flex-col gap-3">
              {RATE_AXES.map((axis) => (
                <RateAxisCard key={axis.prefix} axis={axis} params={params} />
              ))}
            </div>
          </div>

          {/* --------------------------------------------------------------- */}
          {/* Angle PIDs                                                      */}
          {/* --------------------------------------------------------------- */}
          <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
            <SectionCardHeader icon={Move3D} title="Angle Controller — Outer loop angle gains" />
            <div className="grid grid-cols-3 gap-4">
              <ParamNumberInput
                paramName="ATC_ANG_RLL_P"
                params={params}
                label="Roll P"
                step={0.1}
                min={0}
              />
              <ParamNumberInput
                paramName="ATC_ANG_PIT_P"
                params={params}
                label="Pitch P"
                step={0.1}
                min={0}
              />
              <ParamNumberInput
                paramName="ATC_ANG_YAW_P"
                params={params}
                label="Yaw P"
                step={0.1}
                min={0}
              />
            </div>
          </div>

          {/* --------------------------------------------------------------- */}
          {/* Position Controller                                             */}
          {/* --------------------------------------------------------------- */}
          <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
            <SectionCardHeader icon={Move3D} title="Position Controller — Altitude and position hold tuning" />

            {/* Vertical: Accel Z, Vel Z, Pos Z */}
            <div className="mb-3">
              <h4 className="mb-2 text-[10px] font-medium uppercase tracking-wider text-text-muted/70">
                Vertical (Altitude)
              </h4>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                <ParamNumberInput
                  paramName="PSC_ACCZ_P"
                  params={params}
                  label="Accel Z — P"
                  step={0.01}
                  min={0}
                />
                <ParamNumberInput
                  paramName="PSC_ACCZ_I"
                  params={params}
                  label="Accel Z — I"
                  step={0.01}
                  min={0}
                />
                <ParamNumberInput
                  paramName="PSC_ACCZ_D"
                  params={params}
                  label="Accel Z — D"
                  step={0.001}
                  min={0}
                />
                <ParamNumberInput
                  paramName="PSC_VELZ_P"
                  params={params}
                  label="Velocity Z — P"
                  step={0.1}
                  min={0}
                />
                <ParamNumberInput
                  paramName="PSC_POSZ_P"
                  params={params}
                  label="Position Z — P"
                  step={0.1}
                  min={0}
                />
              </div>
            </div>

            {/* Horizontal: Vel XY, Pos XY */}
            <div className="border-t border-border pt-3">
              <h4 className="mb-2 text-[10px] font-medium uppercase tracking-wider text-text-muted/70">
                Horizontal (Position Hold)
              </h4>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <ParamNumberInput
                  paramName="PSC_VELXY_P"
                  params={params}
                  label="Velocity XY — P"
                  step={0.1}
                  min={0}
                />
                <ParamNumberInput
                  paramName="PSC_VELXY_I"
                  params={params}
                  label="Velocity XY — I"
                  step={0.01}
                  min={0}
                />
                <ParamNumberInput
                  paramName="PSC_VELXY_D"
                  params={params}
                  label="Velocity XY — D"
                  step={0.01}
                  min={0}
                />
                <ParamNumberInput
                  paramName="PSC_POSXY_P"
                  params={params}
                  label="Position XY — P"
                  step={0.1}
                  min={0}
                />
              </div>
            </div>
          </div>
        </>
      )}

      {/* ================================================================= */}
      {/* PLANE PANELS                                                      */}
      {/* ================================================================= */}
      {plane && (
        <>
          {/* --------------------------------------------------------------- */}
          {/* Servo Tuning (Roll, Pitch, Yaw)                                */}
          {/* --------------------------------------------------------------- */}
          <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
            <SectionCardHeader icon={Plane} title="Servo Tuning — Roll, pitch, and yaw control surface tuning" />
            <div className="flex flex-col gap-4">
              {PLANE_AXES.map((axis) => (
                <div
                  key={axis.label}
                  className="rounded-lg border border-border bg-bg-secondary/30 p-3"
                >
                  <h4 className="mb-2 text-[10px] font-medium uppercase tracking-wider text-text-muted/70">
                    {axis.label}
                  </h4>
                  <div className="grid grid-cols-3 gap-3 lg:grid-cols-6">
                    {axis.params.map((p) => (
                      <ParamNumberInput
                        key={p.name}
                        paramName={p.name}
                        params={params}
                        label={p.label}
                        step={p.step}
                        min={0}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* --------------------------------------------------------------- */}
          {/* Speed Configuration                                             */}
          {/* --------------------------------------------------------------- */}
          <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
            <SectionCardHeader icon={Gauge} title="Speed Configuration" />
            <div className="grid grid-cols-2 gap-4">
              <ParamNumberInput
                paramName="ARSPD_FBW_MIN"
                params={params}
                label="Min Airspeed (FBW)"
                unit="m/s"
                step={0.5}
                min={0}
              />
              <ParamNumberInput
                paramName="ARSPD_FBW_MAX"
                params={params}
                label="Max Airspeed (FBW)"
                unit="m/s"
                step={0.5}
                min={0}
              />
              <ParamNumberInput
                paramName="TRIM_THROTTLE"
                params={params}
                label="Cruise Throttle"
                unit="%"
                step={1}
                min={0}
                max={100}
              />
              <ParamNumberInput
                paramName="TRIM_ARSPD_CM"
                params={params}
                label="Cruise Airspeed"
                unit="cm/s"
                step={50}
                min={0}
              />
            </div>
          </div>
        </>
      )}

      {/* ================================================================= */}
      {/* FILTER PANEL (shared — both copter & plane)                       */}
      {/* ================================================================= */}
      {vehicleState && (
        <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
          <SectionCardHeader icon={SlidersHorizontal} title="Filters — Gyro, accelerometer, and harmonic notch" />

          {/* Main filter cutoffs */}
          <div className="grid grid-cols-2 gap-4">
            <ParamNumberInput
              paramName="INS_GYRO_FILTER"
              params={params}
              label="Gyro Low-Pass"
              unit="Hz"
              step={1}
              min={0}
            />
            <ParamNumberInput
              paramName="INS_ACCEL_FILTER"
              params={params}
              label="Accelerometer Low-Pass"
              unit="Hz"
              step={1}
              min={0}
            />
          </div>

          {/* Harmonic Notch Filter */}
          <div className="mt-3 border-t border-border pt-3">
            <h4 className="mb-2 text-[10px] font-medium uppercase tracking-wider text-text-muted/70">
              Harmonic Notch Filter
            </h4>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
              <ParamSelect
                paramName="INS_HNTCH_ENABLE"
                params={params}
                label="Enable"
                options={[
                  { value: 0, label: "Disabled" },
                  { value: 1, label: "Enabled" },
                ]}
              />
              <ParamSelect
                paramName="INS_HNTCH_MODE"
                params={params}
                label="Frequency Source"
                options={HNTCH_MODE_OPTIONS}
              />
              <ParamNumberInput
                paramName="INS_HNTCH_FREQ"
                params={params}
                label="Center Frequency"
                unit="Hz"
                step={1}
                min={0}
                disabled={hntchEnabled === 0}
              />
              <ParamNumberInput
                paramName="INS_HNTCH_BW"
                params={params}
                label="Bandwidth"
                unit="Hz"
                step={1}
                min={0}
                disabled={hntchEnabled === 0}
              />
              <ParamNumberInput
                paramName="INS_HNTCH_REF"
                params={params}
                label="Reference"
                step={0.01}
                min={0}
                disabled={hntchEnabled === 0}
              />
            </div>
          </div>
        </div>
      )}

      {/* No vehicle fallback */}
      {!vehicleState && (
        <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4 text-center">
          <p className="text-xs text-text-muted">
            Connect to a vehicle to see PID tuning parameters for your vehicle
            type.
          </p>
        </div>
      )}
    </div>
  );
}
