import { useMemo } from "react";
import {
    Activity,
    Crosshair,
    Move3D,
    SlidersHorizontal,
    Plane,
    Gauge,
    Info,
} from "lucide-react";
import { ParamNumberInput } from "../primitives/ParamNumberInput";
import { ParamSelect } from "../primitives/ParamSelect";
import { getStagedOrCurrent } from "../primitives/param-helpers";
import type { ParamInputParams } from "../primitives/param-helpers";
import type { VehicleState } from "../../../telemetry";
import {
    deriveVtolProfile,
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

const QUADPLANE_MOTOR_TUNING_FIELDS = [
    {
        name: "Q_M_THST_EXPO",
        label: "Thrust Expo",
        step: 0.01,
        min: 0,
    },
    {
        name: "Q_M_THST_HOVER",
        label: "Hover Thrust",
        step: 0.01,
        min: 0,
        max: 1,
    },
    {
        name: "Q_M_BAT_VOLT_MAX",
        label: "Battery Volt Max",
        step: 0.1,
        min: 0,
    },
    {
        name: "Q_M_BAT_VOLT_MIN",
        label: "Battery Volt Min",
        step: 0.1,
        min: 0,
    },
];

function hasStoreParam(params: ParamInputParams, name: string): boolean {
    return params.store?.params[name] !== undefined;
}

function mapToQuadPlaneRateAxis(axis: RateAxis): RateAxis {
    return {
        ...axis,
        prefix: axis.prefix.replace("ATC_", "Q_A_"),
    };
}

function hasAnyRateFields(prefix: string, params: ParamInputParams): boolean {
    return [...RATE_PRIMARY_GAINS, ...RATE_FILTERS].some((field) =>
        hasStoreParam(params, `${prefix}${field.suffix}`),
    );
}

// ---------------------------------------------------------------------------
// Rate PID axis card
// ---------------------------------------------------------------------------

function RateAxisCard({
    axis,
    params,
    hideMissingFields = false,
}: {
    axis: RateAxis;
    params: ParamInputParams;
    hideMissingFields?: boolean;
}) {
    const gainFields = RATE_PRIMARY_GAINS.filter(
        (field) => !hideMissingFields || hasStoreParam(params, `${axis.prefix}${field.suffix}`),
    );
    const filterFields = RATE_FILTERS.filter(
        (field) => !hideMissingFields || hasStoreParam(params, `${axis.prefix}${field.suffix}`),
    );

    if (gainFields.length === 0 && filterFields.length === 0) {
        return null;
    }

    return (
        <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
            <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                {axis.label} Rate
            </h4>

            {gainFields.length > 0 && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {gainFields.map((g) => (
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
            )}

            {filterFields.length > 0 && (
                <div className="mt-3 border-t border-border pt-3">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {filterFields.map((f) => (
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
            )}
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
    const profile = useMemo(
        () => deriveVtolProfile(vehicleState, params),
        [vehicleState, params],
    );

    const hntchEnabled = getStagedOrCurrent("INS_HNTCH_ENABLE", params);
    const quadPlaneRateAxes = useMemo(
        () => RATE_AXES.map(mapToQuadPlaneRateAxis).filter((axis) => hasAnyRateFields(axis.prefix, params)),
        [params.store],
    );
    const quadPlaneMotorFields = useMemo(
        () => QUADPLANE_MOTOR_TUNING_FIELDS.filter((field) => hasStoreParam(params, field.name)),
        [params.store],
    );

    const hasQuadPlaneRateTuning = quadPlaneRateAxes.length > 0;
    const hasQuadPlaneMotorTuning = quadPlaneMotorFields.length > 0;
    const showQuadPlaneTuning =
        profile.isPlane && profile.quadPlaneEnabled && (hasQuadPlaneRateTuning || hasQuadPlaneMotorTuning);
    const showQuadPlaneGapBanner =
        profile.isPlane && profile.quadPlaneEnabled && !showQuadPlaneTuning;
    const missingQuadPlaneFamilies = [
        hasQuadPlaneRateTuning ? null : "Q_A_* rate tuning",
        hasQuadPlaneMotorTuning ? null : "Q_M_* lift-motor tuning",
    ].filter((value): value is string => value != null);

    const tuningDocsUrl = resolveDocsUrl("tuning");
    const description = showQuadPlaneTuning
        ? "Tune QuadPlane hover-rate and lift-motor behavior with the VTOL-specific Q_A_* and Q_M_* parameter families"
        : copter
            ? "Tune rate, angle, and position controllers for your multirotor"
            : plane
                ? profile.quadPlaneEnabled
                    ? "QuadPlane tuning appears here once the VTOL-specific Q_A_* and Q_M_* parameter families are available"
                    : "Tune servo and speed controllers for your fixed-wing aircraft"
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

            {showQuadPlaneGapBanner && (
                <div className="flex items-start gap-2 rounded-lg border border-accent/20 bg-accent/5 p-3">
                    <Info size={14} className="mt-0.5 shrink-0 text-accent" />
                    <div className="text-xs leading-relaxed text-text-secondary">
                        QuadPlane is enabled, but the VTOL tuning surface has not finished loading yet.
                        Refresh parameters after the reboot so the dedicated
                        <code className="mx-1 rounded bg-accent/10 px-1 py-px font-mono text-[10px]">Q_A_*</code>
                        and
                        <code className="mx-1 rounded bg-accent/10 px-1 py-px font-mono text-[10px]">Q_M_*</code>
                        controls can replace the fixed-wing fallback cards.
                    </div>
                </div>
            )}

            {/* ================================================================= */}
            {/* COPTER PANELS                                                     */}
            {/* ================================================================= */}
            {copter && (
                <>
                    <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
                        <SectionCardHeader icon={Crosshair} title="Rate PIDs — Inner loop rate controllers (deg/s)" />
                        <div className="flex flex-col gap-3">
                            {RATE_AXES.map((axis) => (
                                <RateAxisCard key={axis.prefix} axis={axis} params={params} />
                            ))}
                        </div>
                    </div>

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

                    <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
                        <SectionCardHeader icon={Move3D} title="Position Controller — Altitude and position hold tuning" />

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
            {/* QUADPLANE VTOL PANELS                                             */}
            {/* ================================================================= */}
            {showQuadPlaneTuning && (
                <>
                    {hasQuadPlaneRateTuning && (
                        <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
                            <SectionCardHeader icon={Crosshair} title="VTOL Rate PIDs — Q_A_* hover and attitude tuning" />
                            <div className="mb-3 flex items-start gap-2 rounded-md bg-accent/10 px-3 py-2.5">
                                <Info size={13} className="mt-0.5 shrink-0 text-accent" />
                                <span className="text-xs text-accent">
                                    QuadPlane lift and hover controllers use the VTOL-specific
                                    <code className="mx-1 rounded bg-accent/10 px-1 py-px font-mono text-[10px]">Q_A_*</code>
                                    family instead of the fixed-wing servo tuning surface.
                                </span>
                            </div>
                            <div className="flex flex-col gap-3">
                                {quadPlaneRateAxes.map((axis) => (
                                    <RateAxisCard
                                        key={axis.prefix}
                                        axis={axis}
                                        params={params}
                                        hideMissingFields={true}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {hasQuadPlaneMotorTuning && (
                        <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
                            <SectionCardHeader icon={Gauge} title="Lift Motor Response — Q_M_* hover model" />
                            <div className="mb-3 flex items-start gap-2 rounded-md bg-accent/10 px-3 py-2.5">
                                <Info size={13} className="mt-0.5 shrink-0 text-accent" />
                                <span className="text-xs text-accent">
                                    Lift-motor thrust response and voltage compensation are owned by the
                                    <code className="mx-1 rounded bg-accent/10 px-1 py-px font-mono text-[10px]">Q_M_*</code>
                                    family for QuadPlane airframes.
                                </span>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                {quadPlaneMotorFields.map((field) => (
                                    <ParamNumberInput
                                        key={field.name}
                                        paramName={field.name}
                                        params={params}
                                        label={field.label}
                                        step={field.step}
                                        min={field.min}
                                        max={field.max}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {missingQuadPlaneFamilies.length > 0 && (
                        <div className="flex items-start gap-2 rounded-lg border border-border bg-bg-tertiary/50 p-3 text-xs text-text-secondary">
                            <Info size={14} className="mt-0.5 shrink-0 text-text-muted" />
                            <span>
                                Missing VTOL tuning families stay explicit here instead of falling back to fixed-wing cards:
                                {" "}
                                {missingQuadPlaneFamilies.join(" and ")}.
                            </span>
                        </div>
                    )}
                </>
            )}

            {/* ================================================================= */}
            {/* PLANE PANELS                                                      */}
            {/* ================================================================= */}
            {plane && !showQuadPlaneTuning && (
                <>
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
            {/* FILTER PANEL (shared — all vehicle families)                      */}
            {/* ================================================================= */}
            {vehicleState && (
                <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
                    <SectionCardHeader icon={SlidersHorizontal} title="Filters — Gyro, accelerometer, and harmonic notch" />

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
