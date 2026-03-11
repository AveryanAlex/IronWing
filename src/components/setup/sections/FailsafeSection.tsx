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
  ChevronUp,
  ExternalLink,
  Info,
  RotateCcw,
} from "lucide-react";
import { ParamSelect } from "../primitives/ParamSelect";
import { ParamNumberInput } from "../primitives/ParamNumberInput";
import { ParamToggle } from "../primitives/ParamToggle";
import { getStagedOrCurrent } from "../primitives/param-helpers";
import type { ParamInputParams } from "../primitives/param-helpers";
import type { VehicleState } from "../../../telemetry";

function isPlane(vehicleState: VehicleState | null): boolean {
  if (!vehicleState) return false;
  return vehicleState.vehicle_type.toLowerCase().includes("fixed_wing");
}

export const BATTERY_DOCS_URL =
  "https://ardupilot.org/copter/docs/failsafe-battery.html";

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

const COPTER_EKF_FS_OPTIONS = [
  { value: 0, label: "Disabled" },
  { value: 1, label: "Land" },
  { value: 2, label: "AltHold" },
  { value: 3, label: "Land even in Stabilize" },
];

type DefaultEntry = { paramName: string; value: number; label: string };

export const FAILSAFE_DEFAULTS_COPTER: DefaultEntry[] = [
  { paramName: "FS_THR_ENABLE", value: 1, label: "Radio → RTL" },
  { paramName: "FS_GCS_ENABLE", value: 1, label: "GCS → RTL" },
  { paramName: "FS_EKF_ACTION", value: 1, label: "EKF → Land" },
  { paramName: "BATT_FS_LOW_ACT", value: 2, label: "Low Battery → RTL" },
  { paramName: "BATT_FS_CRT_ACT", value: 1, label: "Critical Battery → Land" },
  { paramName: "FS_CRASH_CHECK", value: 1, label: "Crash Detection → Enabled" },
];

export const FAILSAFE_DEFAULTS_PLANE: DefaultEntry[] = [
  { paramName: "THR_FAILSAFE", value: 1, label: "Radio → Enabled" },
  { paramName: "FS_LONG_ACTN", value: 1, label: "GCS Long → RTL" },
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
  params: ParamInputParams,
): DefaultsPreviewEntry[] {
  const table = plane ? FAILSAFE_DEFAULTS_PLANE : FAILSAFE_DEFAULTS_COPTER;
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

function DefaultsPreviewPanel({
  preview,
  onApply,
  onDismiss,
}: {
  preview: DefaultsPreviewEntry[];
  onApply: () => void;
  onDismiss: () => void;
}) {
  const changeCount = preview.filter((e) => e.willChange).length;

  return (
    <div className="rounded-lg border border-accent/20 bg-accent/5 p-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
        Preview: {changeCount} of {preview.length} will change
      </div>
      <div className="flex flex-col gap-1">
        {preview.map((entry) => (
          <div
            key={entry.paramName}
            className={`flex items-center gap-2 text-xs ${
              entry.willChange ? "text-text-primary" : "text-text-muted"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                entry.willChange ? "bg-accent" : "bg-text-muted/30"
              }`}
            />
            <span className="w-36 shrink-0 font-medium">{entry.paramName}</span>
            <span>{entry.label}</span>
            {!entry.willChange && (
              <span className="ml-auto text-[10px] text-text-muted">already set</span>
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onApply}
          disabled={changeCount === 0}
          className="rounded-md bg-accent/15 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/25 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Stage {changeCount} Change{changeCount !== 1 ? "s" : ""}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-md px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:text-text-secondary"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

type FailsafeSectionProps = {
  params: ParamInputParams;
  vehicleState: VehicleState | null;
};

export function FailsafeSection({ params, vehicleState }: FailsafeSectionProps) {
  const plane = isPlane(vehicleState);
  const [defaultsPreviewOpen, setDefaultsPreviewOpen] = useState(false);

  const radioFsParam = plane ? "THR_FAILSAFE" : "FS_THR_ENABLE";
  const radioFsValue = getStagedOrCurrent(radioFsParam, params) ?? 0;

  const gcsFsParam = plane ? "FS_LONG_ACTN" : "FS_GCS_ENABLE";
  const gcsFsValue = getStagedOrCurrent(gcsFsParam, params) ?? 0;

  const ekfFsValue = getStagedOrCurrent("FS_EKF_ACTION", params) ?? 0;

  const lowVolt = getStagedOrCurrent("BATT_LOW_VOLT", params);
  const crtVolt = getStagedOrCurrent("BATT_CRT_VOLT", params);
  const showVoltageWarning =
    lowVolt != null && crtVolt != null && crtVolt > 0 && lowVolt > 0 && lowVolt <= crtVolt;

  const preview = useMemo(
    () => buildDefaultsPreview(plane, params),
    [plane, params],
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
      {/* Header with recommended defaults */}
      <div className="rounded-lg border border-border-light bg-accent/5 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert size={14} className="text-accent" />
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                Failsafe Configuration
              </h3>
              <p className="mt-0.5 text-[10px] text-text-muted">
                Automatic actions when communication or power is lost
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDefaultsPreviewOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-md bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
          >
            <Zap size={12} />
            Apply Recommended Defaults
            {defaultsPreviewOpen ? (
              <ChevronUp size={12} />
            ) : (
              <ChevronDown size={12} />
            )}
          </button>
        </div>
        {defaultsPreviewOpen && (
          <div className="mt-3">
            <DefaultsPreviewPanel
              preview={preview}
              onApply={() => {
                applyDefaults();
                setDefaultsPreviewOpen(false);
              }}
              onDismiss={() => setDefaultsPreviewOpen(false)}
            />
          </div>
        )}
      </div>

      {/* RC / Radio Failsafe */}
      <div className="rounded-lg border border-border bg-bg-tertiary/50 p-3">
        <div className="mb-2.5 flex items-center gap-2">
          <Radio size={14} className="text-accent" />
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Radio Failsafe
          </h3>
        </div>
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
          {radioFsValue === 0 && <DisabledWarning label="Radio" />}
        </div>
      </div>

      {/* Battery Failsafe */}
      <div className="rounded-lg border border-border bg-bg-tertiary/50 p-3">
        <div className="mb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Battery size={14} className="text-accent" />
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              Battery Failsafe
            </h3>
          </div>
          <a
            href={BATTERY_DOCS_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[10px] text-accent hover:underline"
          >
            ArduPilot Docs
            <ExternalLink size={9} />
          </a>
        </div>

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
      <div className="rounded-lg border border-border bg-bg-tertiary/50 p-3">
        <div className="mb-2.5 flex items-center gap-2">
          <Wifi size={14} className="text-accent" />
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            GCS Failsafe
          </h3>
        </div>
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

      {/* EKF Failsafe (copter only) */}
      {!plane && (
        <div className="rounded-lg border border-border bg-bg-tertiary/50 p-3">
          <div className="mb-2.5 flex items-center gap-2">
            <Navigation size={14} className="text-accent" />
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              EKF Failsafe
            </h3>
          </div>
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
      {!plane && (
        <div className="rounded-lg border border-border bg-bg-tertiary/50 p-3">
          <div className="mb-2.5 flex items-center gap-2">
            <ShieldOff size={14} className="text-accent" />
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              Crash Detection
            </h3>
          </div>
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
