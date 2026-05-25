<script lang="ts">
import { ChevronDown, ChevronRight } from "lucide-svelte";
import { fromStore } from "svelte/store";

import {
  getParamsStoreContext,
} from "../../../app/shell/runtime-context";
import { resolveDocsUrl } from "../../../data/ardupilot-docs";
import {
  buildParameterExpertView,
  type ParameterExpertRow,
} from "../../../lib/params/parameter-expert-view";
import type {
  SetupWorkspaceSection,
  SetupWorkspaceStoreState,
} from "../../../lib/stores/setup-workspace";
import ParameterExpertRowComponent from "../../params/ParameterExpertRow.svelte";
import SetupSectionShell from "../SetupSectionShell.svelte";
import { setupWorkspaceTestIds } from "../setup-workspace-test-ids";

type PeripheralGroupDef = {
  id: string;
  label: string;
  prefixes: string[];
  enableParams: string[];
};

type PeripheralSubgroup = {
  id: string;
  label: string;
  stagedCount: number;
  rows: ParameterExpertRow[];
};

type PeripheralGroupModel = {
  id: string;
  label: string;
  configured: boolean | null;
  rowCount: number;
  lockedCount: number;
  stagedCount: number;
  stateText: string;
  subgroups: PeripheralSubgroup[];
};

const EXCLUDED_PREFIXES = [
  "BATT_",
  "BATT2_",
  "SERVO",
  "MOT_",
  "FRAME_",
  "Q_ENABLE",
  "Q_OPTIONS",
  "Q_FRAME_",
  "Q_M_",
  "Q_A_",
  "Q_TILT_",
  "Q_TAILSIT_",
  "GPS_",
  "GPS1_",
  "GPS2_",
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
] as const;

const KNOWN_GROUPS: ReadonlyArray<PeripheralGroupDef> = [
  {
    id: "rangefinder",
    label: "Rangefinder",
    prefixes: ["RNGFND_", "RNGFND1_", "RNGFND2_", "RNGFND3_", "RNGFND4_"],
    enableParams: ["RNGFND_TYPE", "RNGFND1_TYPE", "RNGFND2_TYPE", "RNGFND3_TYPE", "RNGFND4_TYPE"],
  },
  {
    id: "airspeed",
    label: "Airspeed",
    prefixes: ["ARSPD_", "ARSPD2_"],
    enableParams: ["ARSPD_TYPE", "ARSPD2_TYPE"],
  },
  {
    id: "optical-flow",
    label: "Optical flow",
    prefixes: ["FLOW_", "FLOW1_", "FLOW2_"],
    enableParams: ["FLOW_TYPE", "FLOW1_TYPE", "FLOW2_TYPE"],
  },
  {
    id: "gimbal",
    label: "Camera gimbal",
    prefixes: ["MNT_", "MNT1_", "MNT2_"],
    enableParams: ["MNT_TYPE", "MNT1_TYPE", "MNT2_TYPE"],
  },
  {
    id: "compass",
    label: "Compass",
    prefixes: ["COMPASS_"],
    enableParams: ["COMPASS_ENABLE"],
  },
  {
    id: "can",
    label: "CAN bus",
    prefixes: ["CAN_", "CAN_D1_", "CAN_D2_", "CAN_P1_", "CAN_P2_"],
    enableParams: ["CAN_D1_PROTOCOL", "CAN_D2_PROTOCOL", "CAN_P1_DRIVER", "CAN_P2_DRIVER"],
  },
];

let {
  section,
  view,
}: {
  section: SetupWorkspaceSection;
  view: SetupWorkspaceStoreState;
} = $props();

const paramsStore = getParamsStoreContext();
const paramsState = fromStore(paramsStore);

let showConfiguredOnly = $state(false);
let expandedGroupIds = $state<string[]>([]);
let collapsedSubgroupIds = $state<string[]>([]);
let params = $derived(paramsState.current);
let actionsBlocked = $derived(view.checkpoint.blocksActions || section.availability === "blocked");
let rowReadiness = $derived(actionsBlocked ? "degraded" : view.readiness);
let docsUrl = $derived(resolveDocsUrl("optional_hardware"));
let expertView = $derived(buildParameterExpertView({
  paramStore: params.paramStore,
  metadata: params.metadata,
  stagedEdits: params.stagedEdits,
  retainedFailures: params.retainedFailures,
  filter: "all",
  searchText: "",
}));
let rowIndex = $derived.by(() => {
  const index = new Map<string, ParameterExpertRow>();
  for (const group of expertView.groups) {
    for (const row of group.rows) {
      index.set(row.name, withSafetyFallback(row));
    }
  }
  return index;
});
let knownGroups = $derived(KNOWN_GROUPS.map((group) => buildKnownGroup(group)).filter((group): group is PeripheralGroupModel => group !== null));
let extraGroups = $derived(buildExtraGroups());
let allGroups = $derived([...knownGroups, ...extraGroups]);
let visibleKnownGroups = $derived(showConfiguredOnly ? knownGroups.filter((group) => group.configured === true) : knownGroups);
let visibleExtraGroups = $derived(showConfiguredOnly ? extraGroups.filter((group) => group.configured === true) : extraGroups);
let visibleGroups = $derived([...visibleKnownGroups, ...visibleExtraGroups]);
let metadataFallbackCount = $derived(allGroups.reduce((count, group) => count + group.lockedCount, 0));

function envelopeKey() {
  const activeEnvelope = view.activeEnvelope;
  if (!activeEnvelope) {
    return "no-scope";
  }

  return `${activeEnvelope.session_id}:${activeEnvelope.source_kind}:${activeEnvelope.seek_epoch}:${activeEnvelope.reset_revision}`;
}

function withSafetyFallback(row: ParameterExpertRow): ParameterExpertRow {
  const meta = params.metadata?.get(row.name);
  const hasHumanName = typeof meta?.humanName === "string" && meta.humanName.trim().length > 0;
  const enumBroken = Array.isArray(meta?.values) && meta.values.length > 0 && row.enumOptions.length === 0;
  const bitmaskBroken = Array.isArray(meta?.bitmask) && meta.bitmask.length > 0 && row.bitmaskOptions.length === 0;

  if (hasHumanName && !enumBroken && !bitmaskBroken) {
    return row;
  }

  return {
    ...row,
    label: row.rawName,
    description:
      row.description
      ?? "Metadata is incomplete for this peripheral row, so the curated inventory keeps it visible but read-only.",
    readOnly: true,
  } satisfies ParameterExpertRow;
}

function stagedOrCurrentValue(name: string): number | null {
  const stagedValue = params.stagedEdits[name]?.nextValue;
  if (typeof stagedValue === "number" && Number.isFinite(stagedValue)) {
    return stagedValue;
  }

  return params.paramStore?.params[name]?.value ?? null;
}

function groupConfigured(enableParams: string[]): boolean | null {
  if (enableParams.length === 0) {
    return null;
  }

  let sawAny = false;
  for (const name of enableParams) {
    const value = stagedOrCurrentValue(name);
    if (value === null) {
      continue;
    }

    sawAny = true;
    if (value > 0) {
      return true;
    }
  }

  return sawAny ? false : null;
}

function isExcluded(name: string): boolean {
  return EXCLUDED_PREFIXES.some((prefix) => name.startsWith(prefix));
}

function namesForPrefixes(prefixes: string[]): string[] {
  return Object.keys(params.paramStore?.params ?? {}).filter((name) => prefixes.some((prefix) => name.startsWith(prefix)));
}

function subgroupId(name: string): string {
  const parts = name.split("_");
  return parts.length > 1 ? parts.slice(0, -1).join("_") : name;
}

function buildSubgroups(names: string[]): PeripheralSubgroup[] {
  const grouped = new Map<string, ParameterExpertRow[]>();

  for (const name of names) {
    const row = rowIndex.get(name) ?? null;
    if (!row) {
      continue;
    }

    const key = subgroupId(name);
    const rows = grouped.get(key) ?? [];
    rows.push(row);
    grouped.set(key, rows);
  }

  return [...grouped.entries()]
    .map(([id, rows]) => ({
      id,
      label: id,
      stagedCount: rows.filter((row) => row.isStaged || row.failureMessage !== null).length,
      rows: rows.sort((left, right) => left.order - right.order || left.name.localeCompare(right.name)),
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function buildKnownGroup(group: PeripheralGroupDef): PeripheralGroupModel | null {
  const names = namesForPrefixes(group.prefixes);
  if (names.length === 0) {
    return null;
  }

  const subgroups = buildSubgroups(names);
  const configured = groupConfigured(group.enableParams);
  const lockedCount = subgroups.flatMap((entry) => entry.rows).filter((row) => row.readOnly === true).length;
  const stagedCount = subgroups.reduce((count, entry) => count + entry.stagedCount, 0);

  return {
    id: group.id,
    label: group.label,
    configured,
    rowCount: subgroups.reduce((count, subgroup) => count + subgroup.rows.length, 0),
    lockedCount,
    stagedCount,
    stateText: configured === true ? "Configured" : configured === false ? "Disabled" : "Inspectable",
    subgroups,
  };
}

function buildExtraGroups(): PeripheralGroupModel[] {
  const names = Object.keys(params.paramStore?.params ?? {});
  const groups = new Map<string, string[]>();

  for (const name of names) {
    if (isExcluded(name)) {
      continue;
    }

    const coveredByKnown = KNOWN_GROUPS.some((group) => group.prefixes.some((prefix) => name.startsWith(prefix)));
    if (coveredByKnown) {
      continue;
    }

    const [prefix] = name.split("_");
    if (!prefix || prefix.trim().length === 0) {
      continue;
    }

    const bucket = groups.get(prefix) ?? [];
    bucket.push(name);
    groups.set(prefix, bucket);
  }

  return [...groups.entries()]
    .filter(([, groupNames]) => groupNames.length >= 2)
    .map(([prefix, groupNames]) => {
      const enableParams = groupNames.filter((name) => name.endsWith("_TYPE") || name.endsWith("_ENABLE"));
      const subgroups = buildSubgroups(groupNames);
      const configured = groupConfigured(enableParams);
      const lockedCount = subgroups.flatMap((entry) => entry.rows).filter((row) => row.readOnly === true).length;
      const stagedCount = subgroups.reduce((count, entry) => count + entry.stagedCount, 0);

      return {
        id: prefix,
        label: prefix,
        configured,
        rowCount: subgroups.reduce((count, subgroup) => count + subgroup.rows.length, 0),
        lockedCount,
        stagedCount,
        stateText: configured === true ? "Configured" : configured === false ? "Disabled" : "Inspectable",
        subgroups,
      } satisfies PeripheralGroupModel;
    })
    .sort((left, right) => left.label.localeCompare(right.label));
}

function stageItem(row: ParameterExpertRow, nextValue: number) {
  paramsStore.stageParameterEdit(row, nextValue);
}

function discardItem(name: string) {
  paramsStore.discardStagedEdit(name);
}

function isGroupExpanded(group: PeripheralGroupModel) {
  return expandedGroupIds.includes(group.id) || group.stagedCount > 0;
}

function toggleGroup(groupId: string) {
  if (expandedGroupIds.includes(groupId)) {
    expandedGroupIds = expandedGroupIds.filter((id) => id !== groupId);
  } else {
    expandedGroupIds = [...expandedGroupIds, groupId];
  }
}

function subgroupKey(groupId: string, subgroupId: string) {
  return `${groupId}:${subgroupId}`;
}

function isSubgroupExpanded(groupId: string, subgroup: PeripheralSubgroup) {
  return subgroup.stagedCount > 0 || !collapsedSubgroupIds.includes(subgroupKey(groupId, subgroup.id));
}

function toggleSubgroup(groupId: string, subgroupId: string) {
  const key = subgroupKey(groupId, subgroupId);
  if (collapsedSubgroupIds.includes(key)) {
    collapsedSubgroupIds = collapsedSubgroupIds.filter((id) => id !== key);
  } else {
    collapsedSubgroupIds = [...collapsedSubgroupIds, key];
  }
}
</script>

<SetupSectionShell
  sectionId={section.id}
  eyebrow={section.title}
  title="Curated peripheral inventory with configured-only filtering"
  description="Peripheral setup stays inventory-first here: known hardware families and discovered extras remain grouped, visible, and staged through the shared review tray without dropping into a generic raw-parameter browser."
  testId={setupWorkspaceTestIds.peripheralsSection}
  docs={[{ url: docsUrl, label: "ArduPilot Docs", testId: setupWorkspaceTestIds.peripheralsDocsLink }]}
>
  {#snippet actions()}
    <button
      class={`rounded-md border px-4 py-2 text-sm font-semibold transition ${showConfiguredOnly ? "border-accent/30 bg-accent/10 text-accent" : "border-border bg-bg-primary/80 text-text-primary hover:border-accent hover:text-accent"}`}
      data-testid={setupWorkspaceTestIds.peripheralsFilter}
      onclick={() => (showConfiguredOnly = !showConfiguredOnly)}
      type="button"
    >
      {showConfiguredOnly ? "Configured only" : "Show all groups"}
    </button>
  {/snippet}

  {#snippet body()}
      <div
        class="grid gap-3 rounded-lg border border-border bg-bg-primary/80 p-3 md:grid-cols-3"
        data-testid={setupWorkspaceTestIds.peripheralsSummary}
      >
    <div>
      <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">Visible groups</p>
      <p class="mt-2 text-sm font-semibold text-text-primary">{visibleGroups.length}</p>
      <p class="mt-1 text-sm text-text-secondary">Known hardware families and discovered extras stay separated by inventory group.</p>
    </div>
    <div>
      <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">Filter state</p>
      <p class="mt-2 text-sm font-semibold text-text-primary">{showConfiguredOnly ? "Configured only" : "All discovered groups"}</p>
      <p class="mt-1 text-sm text-text-secondary">
        Groups without truthful enable-state evidence disappear under configured-only mode instead of being guessed as active.
      </p>
    </div>
    <div>
      <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">Metadata fallback</p>
      <p class="mt-2 text-sm font-semibold text-text-primary">{metadataFallbackCount} locked row{metadataFallbackCount === 1 ? "" : "s"}</p>
      <p class="mt-1 text-sm text-text-secondary">
        Raw-name fallback keeps partial-metadata rows visible and read-only rather than inventing friendly labels.
      </p>
    </div>
  </div>

  {#if visibleGroups.length === 0}
    <div
      class="rounded-lg border border-warning/40 bg-warning/10 px-4 py-4 text-sm leading-6 text-warning"
      data-testid={setupWorkspaceTestIds.peripheralsEmpty}
    >
      <p class="font-semibold text-text-primary">
        {showConfiguredOnly ? "No configured peripheral groups match the current scope." : "No peripheral inventory groups are available for this scope."}
      </p>
      <p class="mt-2">
        {showConfiguredOnly
          ? "Disable the filter to inspect all discovered peripheral families."
          : "This snapshot did not expose enough peripheral rows for a curated inventory."}
      </p>
    </div>
  {:else}
    <div class="space-y-3">
      {#each visibleKnownGroups as group (group.id)}
        {@render groupCard(group)}
      {/each}

      {#if visibleExtraGroups.length > 0}
        {#if visibleKnownGroups.length > 0}
          <div class="flex items-center gap-3 py-2">
            <div class="h-px flex-1 bg-border"></div>
            <span class="text-xs font-semibold uppercase tracking-widest text-text-muted">Additional peripherals</span>
            <div class="h-px flex-1 bg-border"></div>
          </div>
        {/if}

        {#each visibleExtraGroups as group (group.id)}
          {@render groupCard(group)}
        {/each}
      {/if}
    </div>
  {/if}
  {/snippet}
</SetupSectionShell>

{#snippet groupCard(group: PeripheralGroupModel)}
  <section class="overflow-hidden rounded-lg border border-border bg-bg-primary/70">
    <button
      aria-expanded={isGroupExpanded(group)}
      class="flex w-full items-center gap-2 px-4 py-3 text-left transition hover:bg-bg-tertiary/50"
      data-testid={`${setupWorkspaceTestIds.peripheralsGroupPrefix}-${group.id}`}
      onclick={() => toggleGroup(group.id)}
      type="button"
    >
      {#if isGroupExpanded(group)}
        <ChevronDown aria-hidden="true" class="shrink-0 text-text-muted" size={14} />
      {:else}
        <ChevronRight aria-hidden="true" class="shrink-0 text-text-muted" size={14} />
      {/if}
      <span class="min-w-0 flex-1">
        <span class="text-xs font-semibold uppercase tracking-widest text-text-muted">{group.label}</span>
        <span class="ml-2 text-xs text-text-muted">({group.rowCount})</span>
        {#if group.lockedCount > 0}
          <span class="ml-2 text-xs text-warning">{group.lockedCount} read-only</span>
        {/if}
      </span>
      {#if group.stagedCount > 0}
        <span class="rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-xs font-semibold text-warning">
          {group.stagedCount} staged
        </span>
      {/if}
      <span class={`rounded-md px-2 py-0.5 text-xs font-medium ${group.configured === true ? "bg-success/10 text-success" : "bg-bg-tertiary text-text-muted"}`}>
        {group.stateText.toLowerCase()}
      </span>
    </button>

    {#if isGroupExpanded(group)}
      <div class="border-t border-border px-4 py-3">
        {#if group.subgroups.length > 1}
          <div class="space-y-3">
            {#each group.subgroups as subgroup (subgroup.id)}
              <div>
                <button
                  aria-expanded={isSubgroupExpanded(group.id, subgroup)}
                  class="mb-2 flex items-center gap-1.5 text-left"
                  onclick={() => toggleSubgroup(group.id, subgroup.id)}
                  type="button"
                >
                  {#if isSubgroupExpanded(group.id, subgroup)}
                    <ChevronDown aria-hidden="true" class="text-text-muted" size={12} />
                  {:else}
                    <ChevronRight aria-hidden="true" class="text-text-muted" size={12} />
                  {/if}
                  <span class="text-xs font-semibold uppercase tracking-widest text-text-muted">{subgroup.label}</span>
                  <span class="text-xs text-text-muted">({subgroup.rows.length})</span>
                  {#if subgroup.stagedCount > 0}
                    <span class="rounded-full border border-warning/30 bg-warning/10 px-1.5 text-xs font-semibold text-warning">
                      {subgroup.stagedCount}
                    </span>
                  {/if}
                </button>

                {#if isSubgroupExpanded(group.id, subgroup)}
                  <div class="ml-3 flex flex-col border-l border-border pl-3">
                    {#each subgroup.rows as row (row.renderId)}
                      <ParameterExpertRowComponent
                        envelopeKey={envelopeKey()}
                        onDiscard={discardItem}
                        onStage={stageItem}
                        readiness={rowReadiness}
                        {row}
                      />
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {:else if group.subgroups[0]}
          <div class="flex flex-col">
            {#each group.subgroups[0].rows as row (row.renderId)}
              <ParameterExpertRowComponent
                envelopeKey={envelopeKey()}
                onDiscard={discardItem}
                onStage={stageItem}
                readiness={rowReadiness}
                {row}
              />
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </section>
{/snippet}
