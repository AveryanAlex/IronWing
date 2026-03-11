import { useState } from "react";
import { ShieldAlert, Radio, Battery, Wifi, Zap, AlertTriangle, Check } from "lucide-react";
import type { useParams } from "../../../hooks/use-params";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type FailsafeStepProps = {
  params: ReturnType<typeof useParams>;
  onConfirm: () => void;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RADIO_FS_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "Disabled" },
  { value: 1, label: "RTL" },
  { value: 3, label: "Land" },
  { value: 4, label: "SmartRTL \u2192 RTL" },
  { value: 5, label: "SmartRTL \u2192 Land" },
];

const BATTERY_FS_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "Disabled" },
  { value: 1, label: "RTL" },
  { value: 3, label: "Land" },
  { value: 4, label: "SmartRTL \u2192 RTL" },
  { value: 5, label: "SmartRTL \u2192 Land" },
];

const GCS_FS_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "Disabled" },
  { value: 1, label: "RTL" },
  { value: 3, label: "SmartRTL \u2192 RTL" },
  { value: 4, label: "SmartRTL \u2192 Land" },
  { value: 5, label: "Land" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getParam(params: ReturnType<typeof useParams>, name: string): number | null {
  return params.store?.params[name]?.value ?? null;
}

function getStagedOrCurrent(params: ReturnType<typeof useParams>, name: string): number | null {
  const staged = params.staged.get(name);
  if (staged !== undefined) return staged;
  return getParam(params, name);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DisabledWarning({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
      <AlertTriangle size={13} strokeWidth={2.5} className="shrink-0" />
      <span>{label} failsafe is disabled</span>
    </div>
  );
}

function ParamDropdown({
  label,
  paramName,
  options,
  params,
}: {
  label: string;
  paramName: string;
  options: { value: number; label: string }[];
  params: ReturnType<typeof useParams>;
}) {
  const value = getStagedOrCurrent(params, paramName);
  const isStaged = params.staged.has(paramName);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-text-muted">{label}</span>
        {isStaged && (
          <span className="rounded bg-warning/10 px-1 py-px text-[9px] font-medium text-warning">
            staged
          </span>
        )}
      </div>
      <select
        value={value != null ? String(value) : ""}
        onChange={(e) => params.stage(paramName, Number(e.target.value))}
        className="rounded border border-border bg-bg-input px-2 py-1.5 text-xs font-mono text-text-primary focus:border-accent focus:outline-none"
      >
        {value != null && !options.some((o) => o.value === value) && (
          <option value={String(value)}>{value} (custom)</option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={String(opt.value)}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ParamNumericInput({
  label,
  paramName,
  params,
  unit,
  min,
  max,
  step,
  placeholder,
}: {
  label: string;
  paramName: string;
  params: ReturnType<typeof useParams>;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}) {
  const value = getStagedOrCurrent(params, paramName);
  const isStaged = params.staged.has(paramName);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-text-muted">{label}</span>
        {isStaged && (
          <span className="rounded bg-warning/10 px-1 py-px text-[9px] font-medium text-warning">
            staged
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          value={value != null ? String(value) : ""}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!Number.isNaN(v)) params.stage(paramName, v);
          }}
          min={min}
          max={max}
          step={step}
          placeholder={placeholder}
          className="w-full rounded border border-border bg-bg-input px-2 py-1.5 text-xs font-mono text-text-primary focus:border-accent focus:outline-none"
        />
        {unit && <span className="shrink-0 text-[10px] text-text-muted">{unit}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function FailsafeStep({ params, onConfirm }: FailsafeStepProps) {
  const [confirmed, setConfirmed] = useState(false);

  const radioFsEnabled = getStagedOrCurrent(params, "FS_THR_ENABLE") ?? 0;
  const gcsFsEnabled = getStagedOrCurrent(params, "FS_GCS_ENABLE") ?? 0;

  const applyDefaults = () => {
    params.stage("FS_THR_ENABLE", 1);
    params.stage("BATT_FS_LOW_ACT", 1);
    params.stage("FS_GCS_ENABLE", 1);
  };

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* Header with recommended defaults */}
      <div className="rounded-lg border border-border-light bg-accent/5 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert size={14} className="text-accent" />
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                Failsafe Configuration
              </h3>
              <p className="mt-0.5 text-[10px] text-text-muted">
                Configure automatic actions when communication or power is lost
              </p>
            </div>
          </div>
          <button
            onClick={applyDefaults}
            className="flex items-center gap-1.5 rounded-md bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
          >
            <Zap size={12} />
            Apply Recommended Defaults
          </button>
        </div>
      </div>

      {/* Radio failsafe */}
      <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Radio size={14} className="text-accent" />
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Radio Failsafe
          </h3>
        </div>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-4">
            <ParamDropdown
              label="Action"
              paramName="FS_THR_ENABLE"
              options={RADIO_FS_OPTIONS}
              params={params}
            />
            <ParamNumericInput
              label="Throttle PWM Threshold"
              paramName="FS_THR_VALUE"
              params={params}
              unit="PWM"
              min={910}
              max={1100}
              step={1}
              placeholder="975"
            />
          </div>
          {radioFsEnabled === 0 && <DisabledWarning label="Radio" />}
        </div>
      </div>

      {/* Battery failsafe */}
      <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Battery size={14} className="text-accent" />
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Battery Failsafe
          </h3>
        </div>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-4">
            <ParamDropdown
              label="Low Battery Action"
              paramName="BATT_FS_LOW_ACT"
              options={BATTERY_FS_OPTIONS}
              params={params}
            />
            <ParamNumericInput
              label="Low Voltage Threshold"
              paramName="BATT_LOW_VOLT"
              params={params}
              unit="V"
              min={0}
              step={0.1}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <ParamNumericInput
              label="Low mAh Remaining"
              paramName="BATT_LOW_MAH"
              params={params}
              unit="mAh"
              min={0}
              step={50}
            />
            <div />
          </div>
          <div className="border-t border-border pt-3" />
          <div className="grid grid-cols-2 gap-4">
            <ParamDropdown
              label="Critical Battery Action"
              paramName="BATT_FS_CRT_ACT"
              options={BATTERY_FS_OPTIONS}
              params={params}
            />
            <ParamNumericInput
              label="Critical Voltage Threshold"
              paramName="BATT_CRT_VOLT"
              params={params}
              unit="V"
              min={0}
              step={0.1}
            />
          </div>
        </div>
      </div>

      {/* GCS failsafe */}
      <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Wifi size={14} className="text-accent" />
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            GCS Failsafe
          </h3>
        </div>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-4">
            <ParamDropdown
              label="Action"
              paramName="FS_GCS_ENABLE"
              options={GCS_FS_OPTIONS}
              params={params}
            />
            <div />
          </div>
          {gcsFsEnabled === 0 && <DisabledWarning label="GCS" />}
        </div>
      </div>

      {/* Confirmation checkbox */}
      <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-bg-tertiary/50 px-4 py-3 transition-colors hover:bg-bg-tertiary">
        <div
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
            confirmed
              ? "border-accent bg-accent text-white"
              : "border-text-muted bg-bg-input"
          }`}
        >
          {confirmed && <Check size={10} strokeWidth={3} />}
        </div>
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => {
            setConfirmed(e.target.checked);
            if (e.target.checked) onConfirm();
          }}
          className="sr-only"
        />
        <span className="text-xs font-medium text-text-primary">Failsafe settings reviewed</span>
      </label>
    </div>
  );
}
