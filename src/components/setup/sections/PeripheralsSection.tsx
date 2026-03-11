import { useState, useMemo } from "react";
import {
  Puzzle,
  ChevronDown,
  ChevronRight,
  Radar,
  Wind,
  Eye,
  Camera,
  Compass,
  Cable,
  Filter,
} from "lucide-react";
import { ParamSelect } from "../primitives/ParamSelect";
import { ParamNumberInput } from "../primitives/ParamNumberInput";
import { ParamBitmaskInput } from "../primitives/ParamBitmaskInput";
import { ParamToggle } from "../primitives/ParamToggle";
import { getStagedOrCurrent, getParamMeta } from "../primitives/param-helpers";
import type { ParamInputParams } from "../primitives/param-helpers";
import type { ParamMeta } from "../../../param-metadata";
import type { LucideIcon } from "lucide-react";
import { SetupSectionIntro } from "../shared/SetupSectionIntro";
import { resolveDocsUrl } from "../../../data/ardupilot-docs";

// ---------------------------------------------------------------------------
// Exclusion prefixes — params already owned by other sections
// ---------------------------------------------------------------------------

const EXCLUDED_PREFIXES = [
  "BATT_",
  "BATT2_",
  "SERVO",
  "MOT_",
  "FRAME_",
  "Q_FRAME_",
  "Q_M_",
  "GPS_",
  "GPS1_",
  "GPS2_",
  "GPS_",
  "SERIAL",
  "RC",
  "RCMAP_",
  "RSSI_",
  "FLTMODE",
  "SIMPLE",
  "SUPER_SIMPLE",
  "FS_",
  "THR_FAILSAFE",
  "THR_FS_",
  "RTL_",
  "ALT_HOLD_RTL",
  "FENCE_",
  "ARMING_",
  "BRD_",
  "LOG_",
  "INS_",
  "AHRS_",
  "EK2_",
  "EK3_",
  "PILOT_",
  "WPNAV_",
  "LOIT_",
  "ATC_",
  "PSC_",
  "ACCEL_",
  "ACRO_",
  "ANGLE_",
  "LAND_",
  "SCHED_",
  "SR0_",
  "SR1_",
  "SR2_",
  "SR3_",
  "STAT_",
  "SYSID_",
  "TELEM_",
  "GND_",
  "MIS_",
  "WP_",
  "RALLY_",
  "SCR_",
  "NTF_",
];

// ---------------------------------------------------------------------------
// Known peripheral group definitions
// ---------------------------------------------------------------------------

type PeripheralGroupDef = {
  id: string;
  label: string;
  icon: LucideIcon;
  prefixes: string[];
  enableParams: string[];
};

const KNOWN_PERIPHERAL_GROUPS: PeripheralGroupDef[] = [
  {
    id: "rangefinder",
    label: "Rangefinder",
    icon: Radar,
    prefixes: ["RNGFND_", "RNGFND1_", "RNGFND2_", "RNGFND3_", "RNGFND4_"],
    enableParams: ["RNGFND_TYPE", "RNGFND1_TYPE"],
  },
  {
    id: "airspeed",
    label: "Airspeed",
    icon: Wind,
    prefixes: ["ARSPD_", "ARSPD2_"],
    enableParams: ["ARSPD_TYPE"],
  },
  {
    id: "optical_flow",
    label: "Optical Flow",
    icon: Eye,
    prefixes: ["FLOW_", "FLOW1_", "FLOW2_"],
    enableParams: ["FLOW_TYPE"],
  },
  {
    id: "gimbal",
    label: "Camera Gimbal",
    icon: Camera,
    prefixes: ["MNT_", "MNT1_", "MNT2_"],
    enableParams: ["MNT_TYPE", "MNT1_TYPE"],
  },
  {
    id: "compass",
    label: "Compass Config",
    icon: Compass,
    prefixes: ["COMPASS_"],
    enableParams: ["COMPASS_ENABLE"],
  },
  {
    id: "can",
    label: "CAN Bus",
    icon: Cable,
    prefixes: ["CAN_", "CAN_D1_", "CAN_D2_", "CAN_P1_", "CAN_P2_"],
    enableParams: ["CAN_D1_PROTOCOL", "CAN_P1_DRIVER"],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isExcluded(paramName: string): boolean {
  return EXCLUDED_PREFIXES.some((prefix) => paramName.startsWith(prefix));
}

function isGroupConfigured(
  group: PeripheralGroupDef,
  params: ParamInputParams,
): boolean {
  for (const ep of group.enableParams) {
    const val = getStagedOrCurrent(ep, params);
    if (val != null && val > 0) return true;
  }
  return false;
}

function getParamsForPrefixes(
  prefixes: string[],
  params: ParamInputParams,
): string[] {
  if (!params.store) return [];
  const names = Object.keys(params.store.params);
  return names
    .filter((name) => prefixes.some((p) => name.startsWith(p)))
    .sort();
}

/**
 * Group param names by their sub-prefix.
 * e.g. RNGFND_TYPE, RNGFND_MIN → "RNGFND"
 *      RNGFND2_TYPE, RNGFND2_MIN → "RNGFND2"
 */
function groupBySubPrefix(paramNames: string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const name of paramNames) {
    const match = name.match(/^([A-Z]+\d*_)/);
    const sub = match ? match[1].replace(/_$/, "") : name;
    const list = groups.get(sub) ?? [];
    list.push(name);
    groups.set(sub, list);
  }
  return groups;
}

function chooseControl(
  meta: ParamMeta | null,
): "bitmask" | "toggle" | "select" | "number" {
  if (meta?.bitmask && meta.bitmask.length > 0) return "bitmask";
  if (meta?.values && meta.values.length > 0) {
    if (
      meta.values.length === 2 &&
      meta.values.some((v) => v.code === 0) &&
      meta.values.some((v) => v.code === 1)
    ) {
      return "toggle";
    }
    return "select";
  }
  return "number";
}

// ---------------------------------------------------------------------------
// PeripheralParam — renders a single param with the appropriate control
// ---------------------------------------------------------------------------

function PeripheralParam({
  paramName,
  params,
}: {
  paramName: string;
  params: ParamInputParams;
}) {
  const meta = getParamMeta(paramName, params.metadata);
  const control = chooseControl(meta);

  switch (control) {
    case "bitmask":
      return <ParamBitmaskInput paramName={paramName} params={params} />;
    case "toggle":
      return <ParamToggle paramName={paramName} params={params} />;
    case "select":
      return <ParamSelect paramName={paramName} params={params} />;
    case "number":
      return <ParamNumberInput paramName={paramName} params={params} />;
  }
}

// ---------------------------------------------------------------------------
// PeripheralGroup — collapsible card for a group of peripheral params
// ---------------------------------------------------------------------------

function PeripheralGroup({
  group,
  params,
}: {
  group: PeripheralGroupDef;
  params: ParamInputParams;
}) {
  const [expanded, setExpanded] = useState(false);

  const paramNames = useMemo(
    () => getParamsForPrefixes(group.prefixes, params),
    [group.prefixes, params],
  );
  const subGroups = useMemo(() => groupBySubPrefix(paramNames), [paramNames]);
  const configured = isGroupConfigured(group, params);
  const stagedCount = paramNames.filter((n) => params.staged.has(n)).length;

  const Icon = group.icon;

  if (paramNames.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-bg-tertiary/50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 rounded-lg px-4 py-3 text-left transition-colors hover:bg-bg-tertiary/80"
      >
        {expanded ? (
          <ChevronDown size={14} className="shrink-0 text-text-muted" />
        ) : (
          <ChevronRight size={14} className="shrink-0 text-text-muted" />
        )}
        <Icon size={14} className="shrink-0 text-accent" />
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          {group.label}
        </h3>
        <span className="text-[10px] text-text-muted">({paramNames.length})</span>

        {configured ? (
          <span className="ml-auto rounded bg-success/10 px-1.5 py-px text-[9px] font-medium text-success">
            configured
          </span>
        ) : (
          <span className="ml-auto rounded bg-bg-tertiary px-1.5 py-px text-[9px] font-medium text-text-muted">
            disabled
          </span>
        )}
        {stagedCount > 0 && (
          <span className="rounded-full bg-warning/20 px-1.5 text-[10px] font-medium text-warning">
            {stagedCount}
          </span>
        )}
      </button>

      {expanded && (
        <div className="border-t border-border px-4 py-3">
          {subGroups.size > 1 ? (
            Array.from(subGroups.entries()).map(([subPrefix, names]) => (
              <SubPrefixGroup
                key={subPrefix}
                subPrefix={subPrefix}
                paramNames={names}
                params={params}
              />
            ))
          ) : (
            <div className="flex flex-col gap-4">
              {paramNames.map((name) => (
                <PeripheralParam key={name} paramName={name} params={params} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SubPrefixGroup — collapsible sub-section within a peripheral group
// ---------------------------------------------------------------------------

function SubPrefixGroup({
  subPrefix,
  paramNames,
  params,
}: {
  subPrefix: string;
  paramNames: string[];
  params: ParamInputParams;
}) {
  const [expanded, setExpanded] = useState(true);
  const stagedCount = paramNames.filter((n) => params.staged.has(n)).length;

  return (
    <div className="mb-3 last:mb-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="mb-2 flex items-center gap-1.5 text-left"
      >
        {expanded ? (
          <ChevronDown size={12} className="text-text-muted" />
        ) : (
          <ChevronRight size={12} className="text-text-muted" />
        )}
        <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          {subPrefix}
        </span>
        <span className="text-[10px] text-text-muted">({paramNames.length})</span>
        {stagedCount > 0 && (
          <span className="rounded-full bg-warning/20 px-1 text-[9px] font-medium text-warning">
            {stagedCount}
          </span>
        )}
      </button>
      {expanded && (
        <div className="ml-3 flex flex-col gap-4 border-l border-border pl-3">
          {paramNames.map((name) => (
            <PeripheralParam key={name} paramName={name} params={params} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type PeripheralsSectionProps = {
  params: ParamInputParams;
};

// ---------------------------------------------------------------------------
// PeripheralsSection — main export
// ---------------------------------------------------------------------------

export function PeripheralsSection({ params }: PeripheralsSectionProps) {
  const [showConfiguredOnly, setShowConfiguredOnly] = useState(false);

  const visibleGroups = useMemo(() => {
    if (!showConfiguredOnly) return KNOWN_PERIPHERAL_GROUPS;
    return KNOWN_PERIPHERAL_GROUPS.filter((g) => isGroupConfigured(g, params));
  }, [showConfiguredOnly, params]);

  const additionalGroups = useMemo(() => {
    if (!params.store) return [];

    const knownPrefixes = new Set<string>();
    for (const g of KNOWN_PERIPHERAL_GROUPS) {
      for (const p of g.prefixes) {
        knownPrefixes.add(p);
      }
    }

    const discoveredPrefixes = new Map<string, string[]>();
    for (const name of Object.keys(params.store.params)) {
      if (isExcluded(name)) continue;

      const coveredByKnown = Array.from(knownPrefixes).some((kp) =>
        name.startsWith(kp),
      );
      if (coveredByKnown) continue;

      const match = name.match(/^([A-Z]+\d*_)/);
      if (!match) continue;
      const prefix = match[1];

      const list = discoveredPrefixes.get(prefix) ?? [];
      list.push(name);
      discoveredPrefixes.set(prefix, list);
    }

    const extras: PeripheralGroupDef[] = [];
    for (const [prefix, names] of discoveredPrefixes) {
      if (names.length < 2) continue;

      const enableCandidates = names.filter(
        (n) => n.endsWith("_TYPE") || n.endsWith("_ENABLE"),
      );

      extras.push({
        id: `auto_${prefix.replace(/_$/, "").toLowerCase()}`,
        label: prefix.replace(/_$/, ""),
        icon: Puzzle,
        prefixes: [prefix],
        enableParams: enableCandidates.length > 0 ? enableCandidates : [],
      });
    }

    return extras.sort((a, b) => a.label.localeCompare(b.label));
  }, [params]);

  const visibleAdditional = useMemo(() => {
    if (!showConfiguredOnly) return additionalGroups;
    return additionalGroups.filter((g) => {
      if (g.enableParams.length === 0) return true;
      return isGroupConfigured(g, params);
    });
  }, [showConfiguredOnly, additionalGroups, params]);

  const totalGroups = visibleGroups.length + visibleAdditional.length;
  const peripheralsDocsUrl = resolveDocsUrl("optional_hardware");

  return (
    <div className="flex flex-col gap-4 p-4">
      <SetupSectionIntro
        icon={Puzzle}
        title="Peripherals"
        description="Auto-generated parameter groups for connected peripherals. Expand a group to configure its parameters. Controls are chosen automatically based on parameter metadata."
        docsUrl={peripheralsDocsUrl}
        docsLabel="Peripheral Hardware Docs"
        actionSlot={
          <button
            onClick={() => setShowConfiguredOnly(!showConfiguredOnly)}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
              showConfiguredOnly
                ? "bg-accent/10 text-accent"
                : "bg-bg-tertiary text-text-muted hover:bg-bg-tertiary/80"
            }`}
          >
            <Filter size={12} />
            {showConfiguredOnly ? "Configured Only" : "Show All"}
          </button>
        }
      />

      {/* Known peripheral groups */}
      {visibleGroups.map((group) => (
        <PeripheralGroup key={group.id} group={group} params={params} />
      ))}

      {/* Auto-discovered additional groups */}
      {visibleAdditional.length > 0 && (
        <>
          <div className="mt-2 flex items-center gap-2">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              Additional Peripherals
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>
          {visibleAdditional.map((group) => (
            <PeripheralGroup key={group.id} group={group} params={params} />
          ))}
        </>
      )}

      {totalGroups === 0 && (
        <div className="flex flex-col items-center gap-2 py-8 text-text-muted">
          <Puzzle size={24} className="opacity-30" />
          <span className="text-xs">
            {showConfiguredOnly
              ? "No configured peripherals found. Disable filter to see all."
              : "No peripheral parameters found."}
          </span>
        </div>
      )}
    </div>
  );
}
