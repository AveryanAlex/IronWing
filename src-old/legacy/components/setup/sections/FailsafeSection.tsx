import { useState, useMemo } from "react";
import {
    ShieldAlert,
    Radio,
    Battery,
    Wifi,
    Navigation,
    ShieldOff,
    Zap,
    AlertTriangle,
    ChevronDown,
    Info,
    RotateCcw,
} from "lucide-react";
import { ParamSelect } from "../primitives/ParamSelect";
import { ParamNumberInput } from "../primitives/ParamNumberInput";
import { ParamToggle } from "../primitives/ParamToggle";
import { getStagedOrCurrent } from "../primitives/param-helpers";
import type { ParamInputParams } from "../primitives/param-helpers";
import type { VehicleState } from "../../../telemetry";
import {
    getVehicleSlug,
    isPlaneVehicleType as isPlane,
    isRoverVehicleType as isRover,
} from "../shared/vehicle-helpers";
import { resolveDocsUrl } from "../../../data/ardupilot-docs";
import { SetupSectionIntro } from "../shared/SetupSectionIntro";
import { SectionCardHeader } from "../shared/SectionCardHeader";
import { PreviewStagePanel } from "../shared/PreviewStagePanel";
import type { PreviewRow } from "../shared/PreviewStagePanel";

export const COPTER_RADIO_FS_OPTIONS = [
    { value: 0, label: "Disabled" },
    { value: 1, label: "RTL" },
    { value: 2, label: "Continue Mission (Auto)" },
    { value: 3, label: "Land" },
    { value: 4, label: "SmartRTL → RTL" },
    { value: 5, label: "SmartRTL → Land" },
    { value: 6, label: "Auto DO_LAND_START → RTL" },
    { value: 7, label: "Brake → Land" },
];

export const COPTER_BATTERY_FS_OPTIONS = [
    { value: 0, label: "Warn Only" },
    { value: 1, label: "Land" },
    { value: 2, label: "RTL" },
    { value: 3, label: "SmartRTL → RTL" },
    { value: 4, label: "SmartRTL → Land" },
    { value: 5, label: "Terminate (dangerous)" },
    { value: 6, label: "Auto DO_LAND_START → RTL" },
    { value: 7, label: "Brake → Land" },
];

export const COPTER_GCS_FS_OPTIONS = [
    { value: 0, label: "Disabled" },
    { value: 1, label: "RTL" },
    { value: 2, label: "Continue Mission (Auto)" },
    { value: 3, label: "SmartRTL → RTL" },
    { value: 4, label: "SmartRTL → Land" },
    { value: 5, label: "Land" },
    { value: 6, label: "Auto DO_LAND_START → RTL" },
    { value: 7, label: "Brake → Land" },
];

export const ROVER_FS_ACTION_OPTIONS = [
    { value: 0, label: "Disabled" },
    { value: 1, label: "RTL" },
    { value: 2, label: "Hold" },
    { value: 3, label: "SmartRTL → RTL" },
    { value: 4, label: "SmartRTL → Hold" },
];

const COPTER_EKF_FS_OPTIONS = [
    { value: 0, label: "Disabled" },
    { value: 1, label: "Land" },
    { value: 2, label: "AltHold" },
    { value: 3, label: "Land even in Stabilize" },
];

type DefaultEntry = { paramName: string; value: number; label: string };

export const FAILSAFE_DEFAULTS_COPTER: DefaultEntry[] = [
    { paramName: "FS_THR_ENABLE", value: 1, label: "Radio → RTL" },
    { paramName: "FS_EKF_ACTION", value: 1, label: "EKF → Land" },
    { paramName: "BATT_FS_LOW_ACT", value: 2, label: "Low Battery → RTL" },
    { paramName: "BATT_FS_CRT_ACT", value: 1, label: "Critical Battery → Land" },
    { paramName: "FS_CRASH_CHECK", value: 1, label: "Crash Detection → Enabled" },
];

export const FAILSAFE_DEFAULTS_PLANE: DefaultEntry[] = [
    { paramName: "THR_FAILSAFE", value: 1, label: "Radio → Enabled" },
    { paramName: "BATT_FS_LOW_ACT", value: 2, label: "Low Battery → RTL" },
    { paramName: "BATT_FS_CRT_ACT", value: 1, label: "Critical Battery → Land" },
];

export const FAILSAFE_DEFAULTS_ROVER: DefaultEntry[] = [
    { paramName: "FS_ACTION", value: 1, label: "Radio / GCS → RTL" },
    { paramName: "FS_TIMEOUT", value: 5, label: "GCS Timeout → 5 s" },
    { paramName: "BATT_FS_LOW_ACT", value: 2, label: "Low Battery → RTL" },
    { paramName: "BATT_FS_CRT_ACT", value: 1, label: "Critical Battery → Land" },
];

export type DefaultsPreviewEntry = {
    paramName: string;
    label: string;
    newValue: number;
    currentValue: number | null;
    willChange: boolean;
};

export function buildDefaultsPreview(
    plane: boolean,
    rover: boolean,
    params: ParamInputParams,
): DefaultsPreviewEntry[] {
    const table = plane
        ? FAILSAFE_DEFAULTS_PLANE
        : rover
            ? FAILSAFE_DEFAULTS_ROVER
            : FAILSAFE_DEFAULTS_COPTER;
    return table.map((d) => {
        const current = getStagedOrCurrent(d.paramName, params);
        return {
            paramName: d.paramName,
            label: d.label,
            newValue: d.value,
            currentValue: current,
            willChange: current !== d.value,
        };
    });
}

function DisabledWarning({ label }: { label: string }) {
    return (
        <div className="flex items-center gap-2 rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
            <AlertTriangle size={13} strokeWidth={2.5} className="shrink-0" />
            <span>{label} failsafe is disabled</span>
        </div>
    );
}

function VoltageWarning() {
    return (
        <div className="flex items-center gap-2 rounded-md bg-danger/10 px-3 py-2 text-xs text-danger">
            <AlertTriangle size={13} strokeWidth={2.5} className="shrink-0" />
            <span>
                Low voltage threshold should be higher than critical voltage threshold
            </span>
        </div>
    );
}

type FailsafeSectionProps = {
    params: ParamInputParams;
    vehicleState: VehicleState | null;
    navigateToParam?: (paramName: string) => void;
};

export function FailsafeSection({ params, vehicleState, navigateToParam }: FailsafeSectionProps) {
    const plane = isPlane(vehicleState);
    const rover = isRover(vehicleState);
    const vehicleSlug = getVehicleSlug(vehicleState);
    const [defaultsPreviewOpen, setDefaultsPreviewOpen] = useState(false);

    const radioFsParam = plane ? "THR_FAILSAFE" : rover ? "FS_ACTION" : "FS_THR_ENABLE";
    const radioFsValue = getStagedOrCurrent(radioFsParam, params) ?? 0;

    const gcsFsParam = plane ? "FS_LONG_ACTN" : rover ? "FS_ACTION" : "FS_GCS_ENABLE";
    const gcsFsValue = getStagedOrCurrent(gcsFsParam, params) ?? 0;

    const ekfFsValue = getStagedOrCurrent("FS_EKF_ACTION", params) ?? 0;

    const lowVolt = getStagedOrCurrent("BATT_LOW_VOLT", params);
    const crtVolt = getStagedOrCurrent("BATT_CRT_VOLT", params);
    const showVoltageWarning =
        lowVolt != null && crtVolt != null && crtVolt > 0 && lowVolt > 0 && lowVolt <= crtVolt;

    const preview = useMemo(
        () => buildDefaultsPreview(plane, rover, params),
        [plane, rover, params],
    );

    const previewRows: PreviewRow[] = useMemo(
        () =>
            preview.map((entry) => ({
                key: entry.paramName,
                label: entry.label,
                paramName: entry.paramName,
                willChange: entry.willChange,
            })),
        [preview],
    );

    const applyDefaults = () => {
        for (const entry of preview) {
            if (entry.willChange) {
                params.stage(entry.paramName, entry.newValue);
            }
        }
    };

    return (
        <div className="flex flex-col gap-2.5 p-4">
            {/* Section intro with recommended defaults */}
            <SetupSectionIntro
                icon={ShieldAlert}
                title="Failsafe Configuration"
                description="Automatic actions when communication or power is lost"
                docsUrl={resolveDocsUrl("failsafe_landing_page", vehicleSlug)}
                docsLabel="Failsafe Docs"
                actionSlot={
                    <button
                        type="button"
                        onClick={() => setDefaultsPreviewOpen((v) => !v)}
                        className="flex items-center gap-1.5 rounded-md bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
                    >
                        <Zap size={12} />
                        Apply Recommended Defaults
                        <ChevronDown
                            size={12}
                            className={`transition-transform duration-200 ${defaultsPreviewOpen ? "rotate-180" : ""}`}
                        />
                    </button>
                }
            >
                {defaultsPreviewOpen && (
                    <PreviewStagePanel
                        rows={previewRows}
                        onStage={() => {
                            applyDefaults();
                            setDefaultsPreviewOpen(false);
                        }}
                        onCancel={() => setDefaultsPreviewOpen(false)}
                        onRowClick={
                            navigateToParam
                                ? (row) => {
                                    if (row.paramName) navigateToParam(row.paramName);
                                }
                                : undefined
                        }
                    />
                )}
            </SetupSectionIntro>

            {/* RC / Radio Failsafe */}
            <div className="rounded-lg border border-border bg-bg-tertiary/50 p-3">
                <SectionCardHeader
                    icon={Radio}
                    title={rover ? "Radio / GCS Failsafe" : "Radio Failsafe"}
                    docsUrl={resolveDocsUrl("failsafe_radio", vehicleSlug)}
                    docsLabel="Radio Failsafe Docs"
                />
                <div className="flex flex-col gap-2.5">
                    {plane ? (
                        <div className="grid grid-cols-2 gap-3">
                            <ParamSelect
                                paramName="THR_FAILSAFE"
                                params={params}
                                label="Action"
                                options={[
                                    { value: 0, label: "Disabled" },
                                    { value: 1, label: "Enabled" },
                                ]}
                            />
                            <ParamNumberInput
                                paramName="THR_FS_VALUE"
                                params={params}
                                label="Throttle PWM Threshold"
                                unit="PWM"
                                min={910}
                                max={1100}
                                step={1}
                                placeholder="950"
                            />
                        </div>
                    ) : rover ? (
                        <div className="grid grid-cols-2 gap-3">
                            <ParamSelect
                                paramName="FS_ACTION"
                                params={params}
                                label="Action"
                                options={ROVER_FS_ACTION_OPTIONS}
                            />
                            <ParamNumberInput
                                paramName="FS_TIMEOUT"
                                params={params}
                                label="Timeout"
                                unit="s"
                                min={0}
                                step={1}
                                placeholder="5"
                            />
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-3">
                            <ParamSelect
                                paramName="FS_THR_ENABLE"
                                params={params}
                                label="Action"
                                options={COPTER_RADIO_FS_OPTIONS}
                            />
                            <ParamNumberInput
                                paramName="FS_THR_VALUE"
                                params={params}
                                label="Throttle PWM Threshold"
                                unit="PWM"
                                min={910}
                                max={1100}
                                step={1}
                                placeholder="975"
                            />
                        </div>
                    )}
                    {radioFsValue === 0 && <DisabledWarning label={rover ? "Radio / GCS" : "Radio"} />}
                </div>
            </div>

            {/* Battery Failsafe */}
            <div className="rounded-lg border border-border bg-bg-tertiary/50 p-3">
                <SectionCardHeader
                    icon={Battery}
                    title="Battery Failsafe"
                    docsUrl={resolveDocsUrl("failsafe_battery", vehicleSlug)}
                    docsLabel="Battery Failsafe Docs"
                />

                <div className="flex flex-col gap-2.5">
                    {/* Low battery */}
                    <div className="grid grid-cols-3 gap-3">
                        <ParamSelect
                            paramName="BATT_FS_LOW_ACT"
                            params={params}
                            label="Low Battery Action"
                            options={COPTER_BATTERY_FS_OPTIONS}
                        />
                        <ParamNumberInput
                            paramName="BATT_LOW_VOLT"
                            params={params}
                            label="Low Voltage"
                            unit="V"
                            min={0}
                            step={0.1}
                        />
                        <ParamNumberInput
                            paramName="BATT_LOW_MAH"
                            params={params}
                            label="Low mAh Remaining"
                            unit="mAh"
                            min={0}
                            step={50}
                        />
                    </div>

                    <div className="border-t border-border" />

                    {/* Critical battery */}
                    <div className="grid grid-cols-3 gap-3">
                        <ParamSelect
                            paramName="BATT_FS_CRT_ACT"
                            params={params}
                            label="Critical Battery Action"
                            options={COPTER_BATTERY_FS_OPTIONS}
                        />
                        <ParamNumberInput
                            paramName="BATT_CRT_VOLT"
                            params={params}
                            label="Critical Voltage"
                            unit="V"
                            min={0}
                            step={0.1}
                        />
                        <ParamNumberInput
                            paramName="BATT_CRT_MAH"
                            params={params}
                            label="Critical mAh Remaining"
                            unit="mAh"
                            min={0}
                            step={50}
                        />
                    </div>

                    {showVoltageWarning && <VoltageWarning />}

                    {/* Escalation helper + reboot note */}
                    <div className="flex flex-col gap-1.5 border-t border-border pt-2.5">
                        <div className="flex items-start gap-1.5 text-[11px] leading-relaxed text-text-muted">
                            <Info size={12} className="mt-0.5 shrink-0 text-text-muted" />
                            <span>
                                Two-tier system: <span className="font-medium text-text-secondary">Low</span> triggers
                                first (recommended: RTL). <span className="font-medium text-text-secondary">Critical</span> escalates
                                if voltage keeps dropping (recommended: Land).
                            </span>
                        </div>
                        <div className="flex items-start gap-1.5 text-[11px] leading-relaxed text-text-muted">
                            <RotateCcw size={11} className="mt-0.5 shrink-0 text-text-muted" />
                            <span>
                                Once triggered, battery failsafe cannot be reset in flight — requires reboot.
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* GCS Failsafe */}
            {!rover && (
                <div className="rounded-lg border border-border bg-bg-tertiary/50 p-3">
                    <SectionCardHeader
                        icon={Wifi}
                        title="GCS Failsafe"
                        docsUrl={resolveDocsUrl("failsafe_gcs", vehicleSlug)}
                        docsLabel="GCS Failsafe Docs"
                    />
                    <div className="flex flex-col gap-2.5">
                        {plane ? (
                            <div className="grid grid-cols-2 gap-3">
                                <ParamSelect
                                    paramName="FS_LONG_ACTN"
                                    params={params}
                                    label="Long Failsafe Action"
                                />
                                <ParamSelect
                                    paramName="FS_SHORT_ACTN"
                                    params={params}
                                    label="Short Failsafe Action"
                                />
                            </div>
                        ) : (
                            <ParamSelect
                                paramName="FS_GCS_ENABLE"
                                params={params}
                                label="Action"
                                options={COPTER_GCS_FS_OPTIONS}
                            />
                        )}
                        {gcsFsValue === 0 && <DisabledWarning label="GCS" />}
                    </div>
                </div>
            )}

            {/* EKF Failsafe (copter only) */}
            {!plane && !rover && (
                <div className="rounded-lg border border-border bg-bg-tertiary/50 p-3">
                    <SectionCardHeader
                        icon={Navigation}
                        title="EKF Failsafe"
                        docsUrl={resolveDocsUrl("failsafe_ekf", vehicleSlug)}
                        docsLabel="EKF Failsafe Docs"
                    />
                    <div className="flex flex-col gap-2.5">
                        <div className="grid grid-cols-2 gap-3">
                            <ParamSelect
                                paramName="FS_EKF_ACTION"
                                params={params}
                                label="Action"
                                options={COPTER_EKF_FS_OPTIONS}
                            />
                            <ParamNumberInput
                                paramName="FS_EKF_THRESH"
                                params={params}
                                label="Variance Threshold"
                                min={0.1}
                                max={1.0}
                                step={0.1}
                                placeholder="0.8"
                            />
                        </div>
                        {ekfFsValue === 0 && <DisabledWarning label="EKF" />}
                    </div>
                </div>
            )}

            {/* Crash Detection (copter only) */}
            {!plane && !rover && (
                <div className="rounded-lg border border-border bg-bg-tertiary/50 p-3">
                    <SectionCardHeader
                        icon={ShieldOff}
                        title="Crash Detection"
                        docsUrl={resolveDocsUrl("failsafe_crash_check", vehicleSlug)}
                        docsLabel="Crash Detection Docs"
                    />
                    <ParamToggle
                        paramName="FS_CRASH_CHECK"
                        params={params}
                        label="Crash Check"
                        description="Automatically disarm if a crash is detected"
                    />
                </div>
            )}
        </div>
    );
}
