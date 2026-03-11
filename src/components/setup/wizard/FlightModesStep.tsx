import { useState, useMemo } from "react";
import { Gamepad2, Zap, Check } from "lucide-react";
import type { useParams } from "../../../hooks/use-params";
import type { VehicleState, Telemetry, FlightModeEntry } from "../../../telemetry";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type FlightModesStepProps = {
  params: ReturnType<typeof useParams>;
  vehicleState: VehicleState | null;
  telemetry: Telemetry | null;
  availableModes: FlightModeEntry[];
  onConfirm: () => void;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODE_SLOT_COUNT = 6;
const MODE_PARAM_PREFIX = "FLTMODE";

const PWM_RANGES: { label: string; min: number; max: number }[] = [
  { label: "\u2264 1230", min: 0, max: 1230 },
  { label: "1231\u20131360", min: 1231, max: 1360 },
  { label: "1361\u20131490", min: 1361, max: 1490 },
  { label: "1491\u20131620", min: 1491, max: 1620 },
  { label: "1621\u20131749", min: 1621, max: 1749 },
  { label: "\u2265 1750", min: 1750, max: 65535 },
];

type VehiclePreset = "copter" | "plane" | "rover";

const RECOMMENDED_PRESETS: Record<VehiclePreset, { modes: number[]; labels: string[] }> = {
  copter: {
    modes: [0, 2, 5, 6, 9, 3],
    labels: ["Stabilize", "AltHold", "Loiter", "RTL", "Land", "Auto"],
  },
  plane: {
    modes: [0, 5, 6, 11, 12, 10],
    labels: ["Manual", "FBW-A", "FBW-B", "RTL", "Loiter", "Auto"],
  },
  rover: {
    modes: [0, 4, 11, 5, 10, 15],
    labels: ["Manual", "Hold", "RTL", "Loiter", "Auto", "Guided"],
  },
};

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

function vehicleTypeToPreset(vehicleType: string | undefined): VehiclePreset | null {
  if (!vehicleType) return null;
  const lower = vehicleType.toLowerCase();
  if (
    lower.includes("copter") ||
    lower.includes("quadrotor") ||
    lower.includes("helicopter") ||
    lower.includes("hexarotor") ||
    lower.includes("octorotor") ||
    lower.includes("tricopter")
  ) {
    return "copter";
  }
  if (lower.includes("plane") || lower.includes("fixed_wing")) return "plane";
  if (lower.includes("rover") || lower.includes("ground_rover") || lower.includes("boat")) return "rover";
  return null;
}

function getActiveSlotIndex(telemetry: Telemetry | null, fltmodeCh: number): number | null {
  if (!telemetry?.rc_channels) return null;
  // FLTMODE_CH is 1-indexed, rc_channels array is 0-indexed
  const pwm = telemetry.rc_channels[fltmodeCh - 1];
  if (pwm == null || pwm === 0 || pwm === 65535) return null;
  for (let i = 0; i < PWM_RANGES.length; i++) {
    if (pwm >= PWM_RANGES[i].min && pwm <= PWM_RANGES[i].max) return i;
  }
  return null;
}

function modeNameForValue(value: number | null, availableModes: FlightModeEntry[]): string {
  if (value === null) return "--";
  const entry = availableModes.find((m) => m.custom_mode === value);
  return entry?.name ?? `Mode ${value}`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ModeSlotRow({
  index,
  params,
  availableModes,
  isActive,
}: {
  index: number;
  params: ReturnType<typeof useParams>;
  availableModes: FlightModeEntry[];
  isActive: boolean;
}) {
  const paramName = `${MODE_PARAM_PREFIX}${index + 1}`;
  const currentValue = getStagedOrCurrent(params, paramName);
  const originalValue = getParam(params, paramName);
  const isStaged = params.staged.has(paramName);

  return (
    <div
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
        isActive
          ? "bg-accent/10 ring-1 ring-accent/30"
          : "bg-bg-tertiary/50 hover:bg-bg-tertiary"
      }`}
    >
      {/* Slot number + PWM range */}
      <div className="flex w-24 shrink-0 flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          {isActive && (
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
          )}
          <span
            className={`text-xs font-semibold ${isActive ? "text-accent" : "text-text-primary"}`}
          >
            Mode {index + 1}
          </span>
        </div>
        <span className="text-[10px] text-text-muted">{PWM_RANGES[index].label}</span>
      </div>

      {/* Mode selector */}
      <select
        value={currentValue != null ? String(currentValue) : ""}
        onChange={(e) => {
          const val = Number(e.target.value);
          params.stage(paramName, val);
        }}
        className="flex-1 rounded border border-border bg-bg-input px-2 py-1.5 text-xs font-mono text-text-primary focus:border-accent focus:outline-none"
      >
        {currentValue != null &&
          !availableModes.some((m) => m.custom_mode === currentValue) && (
            <option value={String(currentValue)}>
              {currentValue} (unknown)
            </option>
          )}
        {availableModes.map((mode) => (
          <option key={mode.custom_mode} value={String(mode.custom_mode)}>
            {mode.name}
          </option>
        ))}
      </select>

      {/* Staged indicator */}
      {isStaged && (
        <span className="shrink-0 text-[10px] text-warning">
          {originalValue != null ? modeNameForValue(originalValue, availableModes) : "--"}
          {" \u2192 "}
          {modeNameForValue(currentValue, availableModes)}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function FlightModesStep({
  params,
  vehicleState,
  telemetry,
  availableModes,
  onConfirm,
}: FlightModesStepProps) {
  const [confirmed, setConfirmed] = useState(false);

  const fltmodeCh = getParam(params, "FLTMODE_CH") ?? 5;
  const activeSlot = getActiveSlotIndex(telemetry, fltmodeCh);
  const preset = vehicleTypeToPreset(vehicleState?.vehicle_type);

  const currentModeName = vehicleState?.mode_name ?? "--";

  const sortedModes = useMemo(
    () => [...availableModes].sort((a, b) => a.name.localeCompare(b.name)),
    [availableModes],
  );

  const applyPreset = (presetKey: VehiclePreset) => {
    const p = RECOMMENDED_PRESETS[presetKey];
    for (let i = 0; i < MODE_SLOT_COUNT; i++) {
      params.stage(`${MODE_PARAM_PREFIX}${i + 1}`, p.modes[i]);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* Current mode banner */}
      <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Gamepad2 size={14} className="text-accent" />
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Current Flight Mode
          </h3>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-wider text-text-muted">
              Active Mode
            </span>
            <span className="text-sm font-medium text-text-primary">{currentModeName}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-wider text-text-muted">
              Mode Channel
            </span>
            <span className="text-sm font-medium text-text-primary">CH {fltmodeCh}</span>
          </div>
          {activeSlot != null && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] uppercase tracking-wider text-text-muted">
                Active Slot
              </span>
              <span className="text-sm font-medium text-accent">Mode {activeSlot + 1}</span>
            </div>
          )}
        </div>
      </div>

      {/* Recommended preset */}
      {preset && (
        <div className="rounded-lg border border-border-light bg-accent/5 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap size={14} className="text-accent" />
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                  Recommended Preset
                </h3>
                <p className="mt-0.5 text-[10px] text-text-muted">
                  {RECOMMENDED_PRESETS[preset].labels.join(" \u2022 ")}
                </p>
              </div>
            </div>
            <button
              onClick={() => applyPreset(preset)}
              className="rounded-md bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
            >
              Apply {preset.charAt(0).toUpperCase() + preset.slice(1)} Defaults
            </button>
          </div>
        </div>
      )}

      {/* Mode slots */}
      <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
        <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          Flight Mode Slots
        </h3>
        <div className="flex flex-col gap-1.5">
          {Array.from({ length: MODE_SLOT_COUNT }, (_, i) => (
            <ModeSlotRow
              key={i}
              index={i}
              params={params}
              availableModes={sortedModes}
              isActive={activeSlot === i}
            />
          ))}
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
        <span className="text-xs font-medium text-text-primary">Flight modes reviewed</span>
      </label>
    </div>
  );
}
