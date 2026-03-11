import { useState, useMemo, useCallback, useEffect } from "react";
import {
  Calculator,
  Info,
  CheckCheck,
  ListChecks,
  ArrowRight,
} from "lucide-react";
import { SetupCheckbox } from "../shared/SetupCheckbox";
import { getStagedOrCurrent } from "../primitives/param-helpers";
import type { ParamInputParams } from "../primitives/param-helpers";
import type { VehicleState } from "../../../telemetry";
import {
  isPlaneVehicleType as isPlane,
  hasQuadPlaneParams,
} from "../shared/vehicle-helpers";
import { SetupSectionIntro } from "../shared/SetupSectionIntro";
import {
  computeTriState,
  toggleGroup,
  toggleItem,
  selectAll as selectAllHelper,
  selectNone as selectNoneHelper,
} from "./initial-params-selection";
import type { TriState } from "./initial-params-selection";
import {
  BATTERY_CHEMISTRIES,
  calcMotThrustExpo,
  calcGyroFilter,
  calcRateFilterD,
  calcYawFilterT,
  calcAccelPRMax,
  calcAccelYMax,
  calcAcroYawP,
  calcBattArmVolt,
  calcBattLowVolt,
  calcBattCrtVolt,
  calcBattVoltMax,
  calcBattVoltMin,
  INS_ACCEL_FILTER,
  ATC_RAT_PIT_FLTE,
  ATC_RAT_RLL_FLTE,
  ATC_RAT_YAW_FLTD,
  ATC_RAT_YAW_FLTE,
  MOT_THST_HOVER,
  ATC_THR_MIX_MAN,
} from "../../../data/battery-presets";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROP_SIZES = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const CELL_COUNTS = [3, 4, 5, 6];

// Safety defaults
const SAFETY_DEFAULTS: Record<string, number> = {
  BATT_FS_LOW_ACT: 2, // RTL
  BATT_FS_CRT_ACT: 1, // Land
  FENCE_ENABLE: 1,
  FENCE_TYPE: 7, // Alt + Circle + Polygon
  FENCE_ACTION: 1, // RTL or Land
  FENCE_ALT_MAX: 100, // 100m
};

// ---------------------------------------------------------------------------
// QuadPlane prefix mapping
// ---------------------------------------------------------------------------

/** Params that use Q_A_ prefix on QuadPlane (ATC_RAT_ → Q_A_RAT_) */
const ATC_PARAMS = [
  "ATC_RAT_PIT_FLTD",
  "ATC_RAT_PIT_FLTE",
  "ATC_RAT_PIT_FLTT",
  "ATC_RAT_RLL_FLTD",
  "ATC_RAT_RLL_FLTE",
  "ATC_RAT_RLL_FLTT",
  "ATC_RAT_YAW_FLTD",
  "ATC_RAT_YAW_FLTE",
  "ATC_RAT_YAW_FLTT",
  "ATC_ACCEL_P_MAX",
  "ATC_ACCEL_R_MAX",
  "ATC_ACCEL_Y_MAX",
  "ATC_THR_MIX_MAN",
];

/** Params that use Q_M_ prefix on QuadPlane (MOT_ → Q_M_) */
const MOT_PARAMS = [
  "MOT_THST_EXPO",
  "MOT_THST_HOVER",
  "MOT_BAT_VOLT_MAX",
  "MOT_BAT_VOLT_MIN",
];

/** Map a param name to its QuadPlane-prefixed variant. */
function toQuadPlaneParam(name: string, isQuadPlane: boolean): string {
  if (!isQuadPlane) return name;
  if (ATC_PARAMS.includes(name)) return name.replace("ATC_", "Q_A_");
  if (MOT_PARAMS.includes(name)) return name.replace("MOT_", "Q_M_");
  return name;
}

// ---------------------------------------------------------------------------
// Compute all recommended parameters
// ---------------------------------------------------------------------------

type ComputedParam = {
  /** Canonical (non-prefixed) param name — used for display grouping */
  canonical: string;
  /** Actual param name to stage (may include Q_ prefix) */
  name: string;
  /** Human-friendly label */
  label: string;
  /** Proposed value */
  proposed: number;
  /** Group for visual grouping */
  group: "motor" | "filter" | "battery" | "safety" | "accel";
};

function computeRecommendedParams(
  propInches: number,
  cells: number,
  chemistryIdx: number,
  isQuadPlane: boolean,
): ComputedParam[] {
  const chem = BATTERY_CHEMISTRIES[chemistryIdx];
  const gyro = calcGyroFilter(propInches);
  const rateD = calcRateFilterD(gyro);
  const yawT = calcYawFilterT(gyro);
  const accelPR = calcAccelPRMax(propInches);
  const accelY = calcAccelYMax(propInches);

  const qp = (name: string) => toQuadPlaneParam(name, isQuadPlane);
  const r = (v: number, d = 2) => parseFloat(v.toFixed(d));

  const params: ComputedParam[] = [
    // Motor
    { canonical: "MOT_THST_EXPO", name: qp("MOT_THST_EXPO"), label: "Thrust Expo", proposed: calcMotThrustExpo(propInches), group: "motor" },
    { canonical: "MOT_THST_HOVER", name: qp("MOT_THST_HOVER"), label: "Thrust Hover", proposed: MOT_THST_HOVER, group: "motor" },
    { canonical: "MOT_BAT_VOLT_MAX", name: qp("MOT_BAT_VOLT_MAX"), label: "Battery Volt Max", proposed: r(calcBattVoltMax(cells, chem.cellVoltMax)), group: "motor" },
    { canonical: "MOT_BAT_VOLT_MIN", name: qp("MOT_BAT_VOLT_MIN"), label: "Battery Volt Min", proposed: r(calcBattVoltMin(cells, chem.cellVoltMin)), group: "motor" },

    // Filters
    { canonical: "INS_GYRO_FILTER", name: "INS_GYRO_FILTER", label: "Gyro Filter", proposed: gyro, group: "filter" },
    { canonical: "INS_ACCEL_FILTER", name: "INS_ACCEL_FILTER", label: "Accel Filter", proposed: INS_ACCEL_FILTER, group: "filter" },

    // Pitch rate filters
    { canonical: "ATC_RAT_PIT_FLTD", name: qp("ATC_RAT_PIT_FLTD"), label: "Pitch Rate D Filter", proposed: rateD, group: "filter" },
    { canonical: "ATC_RAT_PIT_FLTE", name: qp("ATC_RAT_PIT_FLTE"), label: "Pitch Rate Error Filter", proposed: ATC_RAT_PIT_FLTE, group: "filter" },
    { canonical: "ATC_RAT_PIT_FLTT", name: qp("ATC_RAT_PIT_FLTT"), label: "Pitch Rate Target Filter", proposed: rateD, group: "filter" },

    // Roll rate filters
    { canonical: "ATC_RAT_RLL_FLTD", name: qp("ATC_RAT_RLL_FLTD"), label: "Roll Rate D Filter", proposed: rateD, group: "filter" },
    { canonical: "ATC_RAT_RLL_FLTE", name: qp("ATC_RAT_RLL_FLTE"), label: "Roll Rate Error Filter", proposed: ATC_RAT_RLL_FLTE, group: "filter" },
    { canonical: "ATC_RAT_RLL_FLTT", name: qp("ATC_RAT_RLL_FLTT"), label: "Roll Rate Target Filter", proposed: rateD, group: "filter" },

    // Yaw rate filters
    { canonical: "ATC_RAT_YAW_FLTD", name: qp("ATC_RAT_YAW_FLTD"), label: "Yaw Rate D Filter", proposed: ATC_RAT_YAW_FLTD, group: "filter" },
    { canonical: "ATC_RAT_YAW_FLTE", name: qp("ATC_RAT_YAW_FLTE"), label: "Yaw Rate Error Filter", proposed: ATC_RAT_YAW_FLTE, group: "filter" },
    { canonical: "ATC_RAT_YAW_FLTT", name: qp("ATC_RAT_YAW_FLTT"), label: "Yaw Rate Target Filter", proposed: yawT, group: "filter" },

    // Accel limits
    { canonical: "ATC_ACCEL_P_MAX", name: qp("ATC_ACCEL_P_MAX"), label: "Pitch Accel Max", proposed: accelPR, group: "accel" },
    { canonical: "ATC_ACCEL_R_MAX", name: qp("ATC_ACCEL_R_MAX"), label: "Roll Accel Max", proposed: accelPR, group: "accel" },
    { canonical: "ATC_ACCEL_Y_MAX", name: qp("ATC_ACCEL_Y_MAX"), label: "Yaw Accel Max", proposed: accelY, group: "accel" },
    { canonical: "ATC_THR_MIX_MAN", name: qp("ATC_THR_MIX_MAN"), label: "Throttle Mix Manual", proposed: ATC_THR_MIX_MAN, group: "accel" },

    // Battery
    { canonical: "BATT_ARM_VOLT", name: "BATT_ARM_VOLT", label: "Arm Voltage", proposed: r(calcBattArmVolt(cells, chem.cellVoltMin)), group: "battery" },
    { canonical: "BATT_LOW_VOLT", name: "BATT_LOW_VOLT", label: "Low Voltage", proposed: r(calcBattLowVolt(cells, chem.cellVoltMin)), group: "battery" },
    { canonical: "BATT_CRT_VOLT", name: "BATT_CRT_VOLT", label: "Critical Voltage", proposed: r(calcBattCrtVolt(cells, chem.cellVoltMin)), group: "battery" },

    // Safety defaults
    ...Object.entries(SAFETY_DEFAULTS).map(([name, value]) => ({
      canonical: name,
      name,
      label: name.replace(/_/g, " "),
      proposed: value,
      group: "safety" as const,
    })),
  ];

  // Acro yaw P (depends on accel Y)
  params.push({
    canonical: "ACRO_YAW_P",
    name: "ACRO_YAW_P",
    label: "Acro Yaw P",
    proposed: r(calcAcroYawP(accelY)),
    group: "accel",
  });

  return params;
}

// ---------------------------------------------------------------------------
// Group labels and order
// ---------------------------------------------------------------------------

const GROUP_META: Record<string, { label: string; order: number }> = {
  motor: { label: "Motor", order: 0 },
  filter: { label: "Filters", order: 1 },
  accel: { label: "Acceleration & Tuning", order: 2 },
  battery: { label: "Battery Voltages", order: 3 },
  safety: { label: "Safety Defaults", order: 4 },
};

export { isPlane, hasQuadPlaneParams };

function fmtValue(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(2);
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type InitialParamsSectionProps = {
  params: ParamInputParams;
  vehicleState: VehicleState | null;
  navigateToParam?: (paramName: string) => void;
};

// ---------------------------------------------------------------------------
// Tri-state → SetupCheckbox adapter
// ---------------------------------------------------------------------------

function triStateToChecked(state: TriState): boolean | "mixed" {
  return state === "all" ? true : state === "some" ? "mixed" : false;
}

// ---------------------------------------------------------------------------
// Diff row component
// ---------------------------------------------------------------------------

function DiffRow({
  param,
  currentValue,
  selected,
  onToggle,
  onNavigate,
}: {
  param: ComputedParam;
  currentValue: number | null;
  selected: boolean;
  onToggle: () => void;
  onNavigate?: (paramName: string) => void;
}) {
  const delta =
    currentValue !== null ? param.proposed - currentValue : null;
  const changed = delta !== null && Math.abs(delta) > 0.001;

  return (
    <div className="flex w-full items-center gap-2 rounded px-2 py-1 text-[11px] font-mono transition-colors hover:bg-bg-tertiary/60">
      <SetupCheckbox checked={selected} onChange={onToggle} />

      {/* Param name — navigable */}
      {onNavigate ? (
        <button
          type="button"
          onClick={() => onNavigate(param.name)}
          className="w-44 truncate text-left text-accent hover:underline"
          title={`Jump to ${param.name}`}
        >
          {param.name}
        </button>
      ) : (
        <span className="w-44 truncate text-text-primary" title={param.name}>
          {param.name}
        </span>
      )}

      {/* Label */}
      <span className="hidden w-32 truncate text-text-muted sm:block">
        {param.label}
      </span>

      {/* Current */}
      <span className="w-16 text-right text-text-muted">
        {currentValue !== null ? fmtValue(currentValue) : "—"}
      </span>

      <ArrowRight size={10} className="shrink-0 text-text-muted" />

      {/* Proposed */}
      <span
        className={`w-16 text-right font-semibold ${changed ? "text-warning" : "text-text-secondary"}`}
      >
        {fmtValue(param.proposed)}
      </span>

      {/* Delta */}
      <span className="w-16 text-right text-[10px] text-text-muted">
        {delta !== null && changed
          ? `${delta > 0 ? "+" : ""}${fmtValue(delta)}`
          : ""}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main section component
// ---------------------------------------------------------------------------

export function InitialParamsSection({
  params,
  vehicleState,
  navigateToParam,
}: InitialParamsSectionProps) {
  const [propSize, setPropSize] = useState(9);
  const [cellCount, setCellCount] = useState(4);
  const [chemistryIdx, setChemistryIdx] = useState(0); // LiPo default

  const plane = isPlane(vehicleState);
  const isQuadPlane = plane && hasQuadPlaneParams(params);
  const isPlainFixedWing = plane && !isQuadPlane;

  const recommended = useMemo(
    () => computeRecommendedParams(propSize, cellCount, chemistryIdx, isQuadPlane),
    [propSize, cellCount, chemistryIdx, isQuadPlane],
  );

  const allNames = useMemo(() => recommended.map((p) => p.name), [recommended]);

  const [selected, setSelected] = useState<Set<string>>(() => new Set(allNames));

  useEffect(() => {
    setSelected(new Set(allNames));
  }, [allNames]);

  const globalTriState: TriState = useMemo(
    () => computeTriState(allNames, selected),
    [allNames, selected],
  );

  const handleGlobalToggle = useCallback(() => {
    setSelected(globalTriState === "all" ? selectNoneHelper() : selectAllHelper(allNames));
  }, [globalTriState, allNames]);

  const handleGroupToggle = useCallback((groupNames: readonly string[]) => {
    setSelected((prev) => toggleGroup(groupNames, prev));
  }, []);

  const handleRowToggle = useCallback((name: string) => {
    setSelected((prev) => toggleItem(name, prev));
  }, []);

  const grouped = useMemo(() => {
    const groups = new Map<string, ComputedParam[]>();
    for (const p of recommended) {
      const list = groups.get(p.group) ?? [];
      list.push(p);
      groups.set(p.group, list);
    }
    return [...groups.entries()].sort(
      ([a], [b]) => (GROUP_META[a]?.order ?? 99) - (GROUP_META[b]?.order ?? 99),
    );
  }, [recommended]);

  const stageSelected = useCallback(() => {
    for (const p of recommended) {
      if (selected.has(p.name)) {
        params.stage(p.name, p.proposed);
      }
    }
  }, [recommended, selected, params]);

  const stageAll = useCallback(() => {
    for (const p of recommended) {
      params.stage(p.name, p.proposed);
    }
  }, [recommended, params]);

  const selectedCount = selected.size;
  const totalCount = recommended.length;

  if (isPlainFixedWing) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <SetupSectionIntro
          icon={Calculator}
          title="Initial Parameters Calculator"
          description="The initial parameters calculator targets multirotor and QuadPlane vehicles. Fixed-wing tuning parameters differ significantly — use the Full Parameters tab for manual configuration."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <SetupSectionIntro
        icon={Calculator}
        title="Initial Parameters Calculator"
        description="Computes recommended starting parameters from your vehicle's physical characteristics. Based on MissionPlanner ConfigInitialParams formulas."
      />

      {/* QuadPlane notice */}
      {isQuadPlane && (
        <div className="flex items-start gap-2 rounded-lg border border-accent/20 bg-accent/5 px-3 py-2 text-xs text-accent">
          <Info size={14} className="mt-0.5 shrink-0" />
          <span>
            QuadPlane detected — motor and attitude controller params will use{" "}
            <code className="rounded bg-accent/10 px-1 font-mono text-[10px]">Q_A_</code> and{" "}
            <code className="rounded bg-accent/10 px-1 font-mono text-[10px]">Q_M_</code> prefixes.
          </span>
        </div>
      )}

      {/* Input Panel */}
      <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
        <div className="mb-3 flex items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Vehicle Inputs
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {/* Prop size */}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-text-secondary">
              Prop Size (inches)
            </label>
            <select
              value={propSize}
              onChange={(e) => setPropSize(Number(e.target.value))}
              className="w-full rounded-md border border-border bg-bg-secondary px-2 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
            >
              {PROP_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}"
                </option>
              ))}
            </select>
          </div>

          {/* Cell count */}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-text-secondary">
              Battery Cells
            </label>
            <select
              value={cellCount}
              onChange={(e) => setCellCount(Number(e.target.value))}
              className="w-full rounded-md border border-border bg-bg-secondary px-2 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
            >
              {CELL_COUNTS.map((c) => (
                <option key={c} value={c}>
                  {c}S
                </option>
              ))}
            </select>
          </div>

          {/* Chemistry */}
          <div>
            <label className="mb-1 block text-[11px] font-medium text-text-secondary">
              Battery Type
            </label>
            <select
              value={chemistryIdx}
              onChange={(e) => setChemistryIdx(Number(e.target.value))}
              className="w-full rounded-md border border-border bg-bg-secondary px-2 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
            >
              {BATTERY_CHEMISTRIES.map((c, i) => (
                <option key={c.label} value={i}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Reference callout */}
      <div className="flex items-start gap-2 rounded-lg border border-border bg-bg-tertiary/30 px-3 py-2 text-[11px] text-text-muted">
        <Info size={12} className="mt-0.5 shrink-0 text-text-muted" />
        <span>
          Reference: 9" prop + 4S LiPo → MOT_THST_EXPO ≈ 0.58, INS_GYRO_FILTER = 46, INS_ACCEL_FILTER = 10
        </span>
      </div>

      {/* Output Panel — Diff Preview */}
      <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Computed Parameters
          </span>
          <span className="ml-auto text-[10px] text-text-muted">
            {selectedCount}/{totalCount} selected
          </span>
        </div>

        {/* Column header with global tri-state checkbox */}
        <div className="mb-1 flex items-center gap-2 border-b border-border/50 px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-text-muted">
          <SetupCheckbox checked={triStateToChecked(globalTriState)} onChange={handleGlobalToggle} size={13} />
          <span className="w-44">Parameter</span>
          <span className="hidden w-32 sm:block">Label</span>
          <span className="w-16 text-right">Current</span>
          <span className="w-[10px] shrink-0" />
          <span className="w-16 text-right">New</span>
          <span className="w-16 text-right">Delta</span>
        </div>

        {/* Grouped params */}
        <div className="flex flex-col gap-2">
          {grouped.map(([groupKey, groupParams]) => {
            const groupNames = groupParams.map((p) => p.name);
            const groupTriState = computeTriState(groupNames, selected);
            return (
              <div key={groupKey}>
                <button
                  type="button"
                  onClick={() => handleGroupToggle(groupNames)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-left transition-colors hover:bg-bg-tertiary/60"
                >
                  <SetupCheckbox checked={triStateToChecked(groupTriState)} size={12} />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-accent/70">
                    {GROUP_META[groupKey]?.label ?? groupKey}
                  </span>
                  <span className="text-[9px] text-text-muted">
                    {groupNames.filter((n) => selected.has(n)).length}/{groupNames.length}
                  </span>
                </button>
                <div className="flex flex-col">
                  {groupParams.map((p) => (
                    <DiffRow
                      key={p.name}
                      param={p}
                      currentValue={getStagedOrCurrent(p.name, params)}
                      selected={selected.has(p.name)}
                      onToggle={() => handleRowToggle(p.name)}
                      onNavigate={navigateToParam}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={stageAll}
          className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
        >
          <CheckCheck size={14} />
          Stage All Recommended
        </button>
        <button
          type="button"
          onClick={stageSelected}
          disabled={selectedCount === 0}
          className="flex items-center gap-1.5 rounded-md border border-accent bg-transparent px-3 py-1.5 text-xs font-medium text-accent transition-opacity hover:bg-accent/10 disabled:opacity-40"
        >
          <ListChecks size={14} />
          Stage Selected ({selectedCount})
        </button>
      </div>
    </div>
  );
}
