import { useState, useMemo, useCallback } from "react";
import {
  Battery,
  Zap,
  Gauge,
  FlaskConical,
  ChevronDown,
  AlertTriangle,
  Info,
  Activity,
  CircuitBoard,
  Cpu,
} from "lucide-react";
import { ParamSelect } from "../primitives/ParamSelect";
import { ParamNumberInput } from "../primitives/ParamNumberInput";
import { getStagedOrCurrent } from "../primitives/param-helpers";
import type { ParamInputParams } from "../primitives/param-helpers";
import type { Telemetry } from "../../../telemetry";
import {
  BOARD_PRESETS,
  SENSOR_PRESETS,
  BATTERY_CHEMISTRIES,
  calcBattArmVolt,
  calcBattLowVolt,
  calcBattCrtVolt,
} from "../../../data/battery-presets";

// ---------------------------------------------------------------------------
// BATT_MONITOR enum values (ArduPilot)
// ---------------------------------------------------------------------------

const MONITOR_OPTIONS = [
  { value: 0, label: "Disabled" },
  { value: 3, label: "Analog Voltage Only" },
  { value: 4, label: "Analog Voltage and Current" },
  { value: 7, label: "SMBus" },
  { value: 8, label: "DroneCAN" },
  { value: 9, label: "ESC" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isAnalogMonitor(monitorValue: number | null): boolean {
  return monitorValue === 3 || monitorValue === 4;
}

function hasCurrentSensing(monitorValue: number | null): boolean {
  return monitorValue === 4;
}

function isMonitorEnabled(monitorValue: number | null): boolean {
  return monitorValue != null && monitorValue > 0;
}

function fmtV(v: number | undefined): string {
  return v != null ? `${v.toFixed(2)} V` : "—";
}

function fmtA(a: number | undefined): string {
  return a != null ? `${a.toFixed(1)} A` : "—";
}

function fmtPct(p: number | undefined): string {
  return p != null ? `${Math.round(p)}%` : "—";
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type BatteryMonitorSectionProps = {
  params: ParamInputParams;
  telemetry: Telemetry | null;
};

// ---------------------------------------------------------------------------
// Board Preset Dropdown
// ---------------------------------------------------------------------------

function BoardPresetPanel({
  params,
  prefix,
}: {
  params: ParamInputParams;
  prefix: string;
}) {
  const voltPin = getStagedOrCurrent(`${prefix}VOLT_PIN`, params);
  const currPin = getStagedOrCurrent(`${prefix}CURR_PIN`, params);

  // Find matching preset from current pin values
  const activePresetIndex = useMemo(() => {
    if (voltPin == null && currPin == null) return -1;
    return BOARD_PRESETS.findIndex(
      (p) => p.voltPin === voltPin && p.currPin === currPin,
    );
  }, [voltPin, currPin]);

  const handlePresetChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const idx = Number(e.target.value);
      if (idx < 0) return;
      const preset = BOARD_PRESETS[idx];
      if (!preset) return;
      params.stage(`${prefix}VOLT_PIN`, preset.voltPin);
      params.stage(`${prefix}CURR_PIN`, preset.currPin);
    },
    [params, prefix],
  );

  return (
    <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <CircuitBoard size={14} className="text-accent" />
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          Board Preset
        </h3>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-text-muted">
            Board
          </span>
          <select
            value={activePresetIndex}
            onChange={handlePresetChange}
            className="rounded border border-border bg-bg-input px-2 py-1.5 text-xs font-mono text-text-primary focus:border-accent focus:outline-none"
          >
            <option value={-1}>Custom</option>
            {BOARD_PRESETS.map((p, i) => (
              <option key={p.label} value={i}>
                {p.label}
              </option>
            ))}
          </select>
          <span className="text-[10px] text-text-muted">
            Selects voltage and current sense pin assignments for your flight controller.
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <ParamNumberInput
            paramName={`${prefix}VOLT_PIN`}
            params={params}
            label="Voltage Pin"
            step={1}
          />
          <ParamNumberInput
            paramName={`${prefix}CURR_PIN`}
            params={params}
            label="Current Pin"
            step={1}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sensor Preset Dropdown
// ---------------------------------------------------------------------------

function SensorPresetPanel({
  params,
  prefix,
}: {
  params: ParamInputParams;
  prefix: string;
}) {
  const voltMult = getStagedOrCurrent(`${prefix}VOLT_MULT`, params);
  const ampPerVolt = getStagedOrCurrent(`${prefix}AMP_PERVLT`, params);

  const activePresetIndex = useMemo(() => {
    if (voltMult == null && ampPerVolt == null) return -1;
    return SENSOR_PRESETS.findIndex(
      (p) =>
        Math.abs((voltMult ?? 0) - p.voltMult) < 0.01 &&
        Math.abs((ampPerVolt ?? 0) - p.ampPerVolt) < 0.01,
    );
  }, [voltMult, ampPerVolt]);

  const handlePresetChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const idx = Number(e.target.value);
      if (idx < 0) return;
      const preset = SENSOR_PRESETS[idx];
      if (!preset) return;
      params.stage(`${prefix}VOLT_MULT`, preset.voltMult);
      params.stage(`${prefix}AMP_PERVLT`, preset.ampPerVolt);
    },
    [params, prefix],
  );

  return (
    <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Cpu size={14} className="text-accent" />
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          Sensor Preset
        </h3>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-text-muted">
            Power Module
          </span>
          <select
            value={activePresetIndex}
            onChange={handlePresetChange}
            className="rounded border border-border bg-bg-input px-2 py-1.5 text-xs font-mono text-text-primary focus:border-accent focus:outline-none"
          >
            <option value={-1}>Custom</option>
            {SENSOR_PRESETS.map((p, i) => (
              <option key={p.label} value={i}>
                {p.label}
              </option>
            ))}
          </select>
          <span className="text-[10px] text-text-muted">
            Auto-fills voltage multiplier and amps-per-volt for known power modules.
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Voltage Calibration Panel
// ---------------------------------------------------------------------------

function VoltageCalibrationPanel({
  params,
  prefix,
  telemetry,
}: {
  params: ParamInputParams;
  prefix: string;
  telemetry: Telemetry | null;
}) {
  return (
    <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Gauge size={14} className="text-accent" />
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          Voltage Calibration
        </h3>
      </div>

      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ParamNumberInput
            paramName={`${prefix}VOLT_MULT`}
            params={params}
            label="Voltage Multiplier"
            step={0.01}
          />
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-text-muted">
              Measured Voltage
            </span>
            <div className="flex h-[34px] items-center rounded border border-border bg-bg-secondary/60 px-2 text-xs font-mono text-text-primary">
              {fmtV(telemetry?.battery_voltage_v)}
            </div>
          </div>
        </div>
        <div className="flex items-start gap-2 rounded-md border border-border/50 bg-bg-secondary/30 px-3 py-2">
          <Info size={12} className="mt-0.5 shrink-0 text-accent" />
          <p className="text-[10px] text-text-muted">
            Measure actual voltage with a multimeter. Adjust the multiplier until
            the displayed voltage matches your multimeter reading.
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Current Calibration Panel
// ---------------------------------------------------------------------------

function CurrentCalibrationPanel({
  params,
  prefix,
  telemetry,
}: {
  params: ParamInputParams;
  prefix: string;
  telemetry: Telemetry | null;
}) {
  return (
    <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Zap size={14} className="text-accent" />
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          Current Calibration
        </h3>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ParamNumberInput
          paramName={`${prefix}AMP_PERVLT`}
          params={params}
          label="Amps Per Volt"
          step={0.01}
        />
        <ParamNumberInput
          paramName={`${prefix}AMP_OFFSET`}
          params={params}
          label="Amp Offset"
          step={0.01}
        />
      </div>

      <div className="mt-3 flex items-center gap-3 rounded-md border border-border/50 bg-bg-secondary/30 px-3 py-2">
        <Activity size={12} className="shrink-0 text-accent" />
        <div className="flex gap-3 text-xs font-mono text-text-primary">
          <span>
            Current: <span className="text-accent">{fmtA(telemetry?.battery_current_a)}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Battery Settings Panel (chemistry + thresholds)
// ---------------------------------------------------------------------------

function BatterySettingsPanel({
  params,
  prefix,
}: {
  params: ParamInputParams;
  prefix: string;
}) {
  const [selectedChemistry, setSelectedChemistry] = useState<number>(-1);
  const [cellCount, setCellCount] = useState<number>(4);

  const handleChemistryChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const idx = Number(e.target.value);
      setSelectedChemistry(idx);
      if (idx < 0) return;
      const chem = BATTERY_CHEMISTRIES[idx];
      if (!chem) return;
      // Auto-fill voltage thresholds
      params.stage(`${prefix}ARM_VOLT`, parseFloat(calcBattArmVolt(cellCount, chem.cellVoltMin).toFixed(2)));
      params.stage(`${prefix}LOW_VOLT`, parseFloat(calcBattLowVolt(cellCount, chem.cellVoltMin).toFixed(2)));
      params.stage(`${prefix}CRT_VOLT`, parseFloat(calcBattCrtVolt(cellCount, chem.cellVoltMin).toFixed(2)));
    },
    [params, prefix, cellCount],
  );

  const handleCellCountChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const cells = Number(e.target.value);
      if (Number.isNaN(cells) || cells < 1) return;
      setCellCount(cells);
      if (selectedChemistry < 0) return;
      const chem = BATTERY_CHEMISTRIES[selectedChemistry];
      if (!chem) return;
      params.stage(`${prefix}ARM_VOLT`, parseFloat(calcBattArmVolt(cells, chem.cellVoltMin).toFixed(2)));
      params.stage(`${prefix}LOW_VOLT`, parseFloat(calcBattLowVolt(cells, chem.cellVoltMin).toFixed(2)));
      params.stage(`${prefix}CRT_VOLT`, parseFloat(calcBattCrtVolt(cells, chem.cellVoltMin).toFixed(2)));
    },
    [params, prefix, selectedChemistry],
  );

  // Cross-validation: LOW > CRT
  const lowVolt = getStagedOrCurrent(`${prefix}LOW_VOLT`, params);
  const crtVolt = getStagedOrCurrent(`${prefix}CRT_VOLT`, params);
  const crossValidationWarning =
    lowVolt != null && crtVolt != null && lowVolt <= crtVolt;

  return (
    <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <FlaskConical size={14} className="text-accent" />
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          Battery Settings
        </h3>
      </div>

      <div className="flex flex-col gap-3">
        <ParamNumberInput
          paramName={`${prefix}CAPACITY`}
          params={params}
          label="Capacity"
          unit="mAh"
          min={0}
          step={100}
        />

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-text-muted">
              Chemistry
            </span>
            <select
              value={selectedChemistry}
              onChange={handleChemistryChange}
              className="rounded border border-border bg-bg-input px-2 py-1.5 text-xs font-mono text-text-primary focus:border-accent focus:outline-none"
            >
              <option value={-1}>Manual</option>
              {BATTERY_CHEMISTRIES.map((c, i) => (
                <option key={c.label} value={i}>
                  {c.label} ({c.cellVoltMin}–{c.cellVoltMax} V/cell)
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-text-muted">
              Cell Count
            </span>
            <input
              type="number"
              value={cellCount}
              onChange={handleCellCountChange}
              min={1}
              max={14}
              step={1}
              className="rounded border border-border bg-bg-input px-2 py-1.5 text-xs font-mono text-text-primary focus:border-accent focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <ParamNumberInput
            paramName={`${prefix}ARM_VOLT`}
            params={params}
            label="Arm Voltage"
            unit="V"
            step={0.1}
            min={0}
          />
          <ParamNumberInput
            paramName={`${prefix}LOW_VOLT`}
            params={params}
            label="Low Voltage"
            unit="V"
            step={0.1}
            min={0}
          />
          <ParamNumberInput
            paramName={`${prefix}CRT_VOLT`}
            params={params}
            label="Critical Voltage"
            unit="V"
            step={0.1}
            min={0}
          />
        </div>

        {crossValidationWarning && (
          <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2.5">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
            <p className="text-xs text-warning">
              Low voltage ({lowVolt?.toFixed(1)} V) must be greater than critical
              voltage ({crtVolt?.toFixed(1)} V). The vehicle will trigger failsafe
              at low voltage first, then critical voltage for emergency landing.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live Battery Status (read-only telemetry)
// ---------------------------------------------------------------------------

function LiveBatteryStatus({ telemetry }: { telemetry: Telemetry | null }) {
  const cells = telemetry?.battery_voltage_cells;

  return (
    <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Activity size={14} className="text-success" />
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          Live Battery Status
        </h3>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatusReadout label="Voltage" value={fmtV(telemetry?.battery_voltage_v)} />
        <StatusReadout label="Current" value={fmtA(telemetry?.battery_current_a)} />
        <StatusReadout label="Remaining" value={fmtPct(telemetry?.battery_pct)} />
        <StatusReadout
          label="Energy"
          value={
            telemetry?.energy_consumed_wh != null
              ? `${telemetry.energy_consumed_wh.toFixed(1)} Wh`
              : "—"
          }
        />
      </div>

      {cells && cells.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-text-muted">
            Cell Voltages
          </span>
          <div className="flex flex-wrap gap-2">
            {cells.map((v, i) => (
              <div
                key={i}
                className="flex flex-col items-center gap-0.5 rounded border border-border/50 bg-bg-secondary/50 px-2.5 py-1.5"
              >
                <span className="text-[9px] text-text-muted">C{i + 1}</span>
                <span className="text-xs font-mono text-text-primary">
                  {v.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!telemetry?.battery_voltage_v && (
        <div className="mt-2 text-[10px] text-text-muted">
          No battery telemetry available. Connect to a vehicle to see live data.
        </div>
      )}
    </div>
  );
}

function StatusReadout({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded border border-border/50 bg-bg-secondary/40 px-3 py-2">
      <span className="text-[9px] uppercase tracking-wider text-text-muted">
        {label}
      </span>
      <span className="text-sm font-mono text-text-primary">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single battery instance (BATT_ or BATT2_)
// ---------------------------------------------------------------------------

function BatteryInstance({
  params,
  prefix,
  telemetry,
  label,
}: {
  params: ParamInputParams;
  prefix: string;
  telemetry: Telemetry | null;
  label: string;
}) {
  const monitorValue = getStagedOrCurrent(`${prefix}MONITOR`, params);
  const analog = isAnalogMonitor(monitorValue);
  const hasCurrent = hasCurrentSensing(monitorValue);
  const enabled = isMonitorEnabled(monitorValue);

  return (
    <div className="flex flex-col gap-3">
      {/* Monitor Type */}
      <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Battery size={14} className="text-accent" />
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            {label} — Monitor Type
          </h3>
        </div>
        <ParamSelect
          paramName={`${prefix}MONITOR`}
          params={params}
          label="Monitor"
          options={MONITOR_OPTIONS}
          description="Select the type of battery monitor connected to this port."
        />
      </div>

      {/* Conditional panels based on monitor type */}
      {analog && (
        <>
          <BoardPresetPanel params={params} prefix={prefix} />
          <SensorPresetPanel params={params} prefix={prefix} />
          <VoltageCalibrationPanel
            params={params}
            prefix={prefix}
            telemetry={telemetry}
          />
          {hasCurrent && (
            <CurrentCalibrationPanel
              params={params}
              prefix={prefix}
              telemetry={telemetry}
            />
          )}
        </>
      )}

      {enabled && (
        <BatterySettingsPanel params={params} prefix={prefix} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collapsible BATT2 section
// ---------------------------------------------------------------------------

function Batt2Panel({
  params,
  telemetry,
}: {
  params: ParamInputParams;
  telemetry: Telemetry | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const batt2Monitor = getStagedOrCurrent("BATT2_MONITOR", params);
  const batt2Enabled = isMonitorEnabled(batt2Monitor);

  return (
    <div className="rounded-lg border border-border bg-bg-tertiary/30">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <Battery size={14} className="text-text-muted" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-text-primary">
              Battery 2
            </span>
            {batt2Enabled ? (
              <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success">
                Enabled
              </span>
            ) : (
              <span className="rounded-full bg-bg-tertiary px-2 py-0.5 text-[10px] font-medium text-text-muted">
                Disabled
              </span>
            )}
          </div>
          <p className="text-[11px] text-text-muted mt-0.5">
            Configure a secondary battery monitor
          </p>
        </div>
        <ChevronDown
          size={14}
          className={`shrink-0 text-text-muted transition-transform duration-200 ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>
      {expanded && (
        <div className="border-t border-border px-4 py-4">
          <BatteryInstance
            params={params}
            prefix="BATT2_"
            telemetry={telemetry}
            label="Battery 2"
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section Root
// ---------------------------------------------------------------------------

export function BatteryMonitorSection({
  params,
  telemetry,
}: BatteryMonitorSectionProps) {
  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Primary battery */}
      <BatteryInstance
        params={params}
        prefix="BATT_"
        telemetry={telemetry}
        label="Battery 1"
      />

      {/* Live status */}
      <LiveBatteryStatus telemetry={telemetry} />

      {/* Secondary battery (collapsible) */}
      <Batt2Panel params={params} telemetry={telemetry} />
    </div>
  );
}
