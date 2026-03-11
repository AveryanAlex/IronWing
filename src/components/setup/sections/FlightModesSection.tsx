import { useState, useMemo } from "react";
import { Gamepad2, Zap, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { ParamSelect } from "../primitives/ParamSelect";
import { getStagedOrCurrent } from "../primitives/param-helpers";
import type { ParamInputParams } from "../primitives/param-helpers";
import type { VehicleState, Telemetry, FlightModeEntry } from "../../../telemetry";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODE_SLOT_COUNT = 6;
const MODE_PARAM_PREFIX = "FLTMODE";

const SIMPLE_DOCS_URL =
  "https://ardupilot.org/copter/docs/simpleandsuper-simple-modes.html";

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

const CHANNEL_OPTIONS = Array.from({ length: 16 }, (_, i) => ({
  value: i + 1,
  label: `Channel ${i + 1}`,
}));

// ---------------------------------------------------------------------------
// Helpers (exported for testing)
// ---------------------------------------------------------------------------

export function vehicleTypeToPreset(vehicleType: string | undefined): VehiclePreset | null {
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
  if (lower.includes("rover") || lower.includes("ground_rover") || lower.includes("boat"))
    return "rover";
  return null;
}

export function getActiveSlotIndex(telemetry: Telemetry | null, fltmodeCh: number): number | null {
  if (!telemetry?.rc_channels) return null;
  // FLTMODE_CH is 1-indexed, rc_channels array is 0-indexed
  const pwm = telemetry.rc_channels[fltmodeCh - 1];
  if (pwm == null || pwm === 0 || pwm === 65535) return null;
  for (let i = 0; i < PWM_RANGES.length; i++) {
    if (pwm >= PWM_RANGES[i].min && pwm <= PWM_RANGES[i].max) return i;
  }
  return null;
}

export function modeNameForValue(
  value: number,
  availableModes: FlightModeEntry[],
  fallback?: string,
): string {
  const entry = availableModes.find((m) => m.custom_mode === value);
  return entry?.name ?? fallback ?? `Mode ${value}`;
}

export function isCopterVehicle(vehicleType: string | undefined): boolean {
  if (!vehicleType) return false;
  const lower = vehicleType.toLowerCase();
  return (
    lower.includes("copter") ||
    lower.includes("quadrotor") ||
    lower.includes("helicopter") ||
    lower.includes("hexarotor") ||
    lower.includes("octorotor") ||
    lower.includes("tricopter")
  );
}

export function getBitmaskBit(params: ParamInputParams, paramName: string, bit: number): boolean {
  const val = getStagedOrCurrent(paramName, params);
  if (val == null) return false;
  return (val & (1 << bit)) !== 0;
}

export function toggleBitmaskBit(params: ParamInputParams, paramName: string, bit: number): void {
  const val = getStagedOrCurrent(paramName, params) ?? 0;
  params.stage(paramName, val ^ (1 << bit));
}

export function buildPresetPreview(
  presetKey: VehiclePreset,
  availableModes: FlightModeEntry[],
): { slot: number; paramName: string; modeName: string }[] {
  const p = RECOMMENDED_PRESETS[presetKey];
  return p.modes.map((modeNum, i) => ({
    slot: i + 1,
    paramName: `${MODE_PARAM_PREFIX}${i + 1}`,
    modeName: modeNameForValue(modeNum, availableModes, p.labels[i]),
  }));
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type FlightModesSectionProps = {
  params: ParamInputParams;
  vehicleState: VehicleState | null;
  telemetry: Telemetry | null;
  availableModes: FlightModeEntry[];
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SimpleToggleChip({
  label,
  active,
  onToggle,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
        active
          ? "bg-accent/20 text-accent ring-1 ring-accent/30"
          : "bg-bg-tertiary text-text-muted hover:bg-bg-tertiary/80 hover:text-text-secondary"
      }`}
    >
      {label}
    </button>
  );
}

function ModeSlotRow({
  index,
  params,
  modeOptions,
  isActive,
  showSimple,
}: {
  index: number;
  params: ParamInputParams;
  modeOptions: { value: number; label: string }[];
  isActive: boolean;
  showSimple: boolean;
}) {
  const paramName = `${MODE_PARAM_PREFIX}${index + 1}`;

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
      <ParamSelect
        paramName={paramName}
        params={params}
        label=""
        description=""
        options={modeOptions}
        className="flex-1"
      />

      {/* Simple / Super Simple per-slot toggle chips (copter only) */}
      {showSimple && (
        <div className="flex shrink-0 gap-1.5">
          <SimpleToggleChip
            label="Simple"
            active={getBitmaskBit(params, "SIMPLE", index)}
            onToggle={() => toggleBitmaskBit(params, "SIMPLE", index)}
          />
          <SimpleToggleChip
            label="Super"
            active={getBitmaskBit(params, "SUPER_SIMPLE", index)}
            onToggle={() => toggleBitmaskBit(params, "SUPER_SIMPLE", index)}
          />
        </div>
      )}
    </div>
  );
}

function PresetPreviewPanel({
  preset,
  availableModes,
  onApply,
  onDismiss,
}: {
  preset: VehiclePreset;
  availableModes: FlightModeEntry[];
  onApply: () => void;
  onDismiss: () => void;
}) {
  const preview = useMemo(
    () => buildPresetPreview(preset, availableModes),
    [preset, availableModes],
  );

  return (
    <div className="rounded-lg border border-accent/20 bg-accent/5 p-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
        Preview: {preset.charAt(0).toUpperCase() + preset.slice(1)} Defaults
      </div>
      <div className="flex flex-col gap-1">
        {preview.map((entry) => (
          <div
            key={entry.slot}
            className="flex items-center gap-2 text-xs text-text-secondary"
          >
            <span className="w-14 shrink-0 text-text-muted">Slot {entry.slot}</span>
            <span className="font-medium text-text-primary">{entry.modeName}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onApply}
          className="rounded-md bg-accent/15 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/25"
        >
          Stage These Modes
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

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function FlightModesSection({
  params,
  vehicleState,
  telemetry,
  availableModes,
}: FlightModesSectionProps) {
  const fltmodeCh = getStagedOrCurrent("FLTMODE_CH", params) ?? 5;
  const activeSlot = getActiveSlotIndex(telemetry, fltmodeCh);
  const preset = vehicleTypeToPreset(vehicleState?.vehicle_type);
  const currentModeName = vehicleState?.mode_name ?? "--";
  const copter = isCopterVehicle(vehicleState?.vehicle_type);
  const [presetPreviewOpen, setPresetPreviewOpen] = useState(false);

  const modeOptions = useMemo(
    () =>
      [...availableModes]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((m) => ({ value: m.custom_mode, label: m.name })),
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

      {/* Recommended preset with preview */}
      {preset && (
        <div className="rounded-lg border border-border-light bg-accent/5 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap size={14} className="text-accent" />
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                  Recommended Preset
                </h3>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPresetPreviewOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded-md bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
            >
              {preset.charAt(0).toUpperCase() + preset.slice(1)} Defaults
              {presetPreviewOpen ? (
                <ChevronUp size={12} />
              ) : (
                <ChevronDown size={12} />
              )}
            </button>
          </div>
          {presetPreviewOpen && (
            <div className="mt-3">
              <PresetPreviewPanel
                preset={preset}
                availableModes={availableModes}
                onApply={() => {
                  applyPreset(preset);
                  setPresetPreviewOpen(false);
                }}
                onDismiss={() => setPresetPreviewOpen(false)}
              />
            </div>
          )}
        </div>
      )}

      {/* Mode channel selector */}
      <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
        <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          Mode Channel
        </h3>
        <ParamSelect
          paramName="FLTMODE_CH"
          params={params}
          label="Mode Switch Channel"
          description="RC channel used to select flight mode (default 5)"
          options={CHANNEL_OPTIONS}
        />
      </div>

      {/* Mode slots */}
      <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Flight Mode Slots
          </h3>
          {copter && (
            <div className="flex gap-3 text-[10px] text-text-muted">
              <span>Simple</span>
              <span>Super Simple</span>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          {Array.from({ length: MODE_SLOT_COUNT }, (_, i) => (
            <ModeSlotRow
              key={i}
              index={i}
              params={params}
              modeOptions={modeOptions}
              isActive={activeSlot === i}
              showSimple={copter}
            />
          ))}
        </div>

        {/* Simple / Super Simple context note + docs link (copter only) */}
        {copter && (
          <div className="mt-3 border-t border-border pt-3">
            <p className="text-[11px] leading-relaxed text-text-muted">
              <span className="font-medium text-text-secondary">Simple</span>: controls
              relative to heading at arm time (compass).{" "}
              <span className="font-medium text-text-secondary">Super Simple</span>: controls
              relative to home direction (GPS required). Neither works in Acro or Drift.
            </p>
            <a
              href={SIMPLE_DOCS_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
            >
              Simple &amp; Super Simple Docs
              <ExternalLink size={10} />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
