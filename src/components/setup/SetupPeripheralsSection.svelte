<script lang="ts">
import { fromStore } from "svelte/store";

import {
  getParamsStoreContext,
} from "../../app/shell/runtime-context";
import { resolveDocsUrl } from "../../data/ardupilot-docs";
import {
  buildParameterExpertView,
  type ParameterExpertRow,
} from "../../lib/params/parameter-expert-view";
import type {
  SetupWorkspaceSection,
  SetupWorkspaceStoreState,
} from "../../lib/stores/setup-workspace";
import ParameterExpertRowComponent from "../params/ParameterExpertRow.svelte";
import SetupSectionShell from "./SetupSectionShell.svelte";
import { setupWorkspaceTestIds } from "./setup-workspace-test-ids";

type PeripheralGroupDef = {
  id: string;
  label: string;
  prefixes: string[];
  enableParams: string[];
};

type PeripheralSubgroup = {
  id: string;
  label: string;
  rows: ParameterExpertRow[];
};

type PeripheralGroupModel = {
  id: string;
  label: string;
  configured: boolean | null;
  rowCount: number;
  lockedCount: number;
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
  onSelectRecovery,
}: {
  section: SetupWorkspaceSection;
  view: SetupWorkspaceStoreState;
  onSelectRecovery: () => void;
} = $props();

const paramsStore = getParamsStoreContext();
const paramsState = fromStore(paramsStore);

let showConfiguredOnly = $state(false);
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
let allGroups = $derived(buildAllGroups());
let visibleGroups = $derived(showConfiguredOnly ? allGroups.filter((group) => group.configured === true) : allGroups);
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

  return {
    id: group.id,
    label: group.label,
    configured,
    rowCount: subgroups.reduce((count, subgroup) => count + subgroup.rows.length, 0),
    lockedCount,
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

      return {
        id: prefix,
        label: prefix,
        configured,
        rowCount: subgroups.reduce((count, subgroup) => count + subgroup.rows.length, 0),
        lockedCount,
        stateText: configured === true ? "Configured" : configured === false ? "Disabled" : "Inspectable",
        subgroups,
      } satisfies PeripheralGroupModel;
    })
    .sort((left, right) => left.label.localeCompare(right.label));
}

function buildAllGroups(): PeripheralGroupModel[] {
  return [
    ...KNOWN_GROUPS.map((group) => buildKnownGroup(group)).filter((group): group is PeripheralGroupModel => group !== null),
    ...buildExtraGroups(),
  ];
}

function stageItem(row: ParameterExpertRow, nextValue: number) {
  paramsStore.stageParameterEdit(row, nextValue);
}

function discardItem(name: string) {
  paramsStore.discardStagedEdit(name);
}
</script>

<SetupSectionShell
  eyebrow={section.title}
  title="Curated peripheral inventory with configured-only filtering"
  description="Peripheral setup stays inventory-first here: known hardware families and discovered extras remain grouped, visible, and staged through the shared review tray without dropping into a generic raw-parameter browser."
  testId={setupWorkspaceTestIds.peripheralsSection}
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
    {#if docsUrl}
      <a
        class="rounded-md border border-border bg-bg-primary/80 px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent"
        data-testid={setupWorkspaceTestIds.peripheralsDocsLink}
        href={docsUrl}
        rel="noreferrer"
        target="_blank"
      >
        Optional-hardware docs
      </a>
    {/if}
  {/snippet}

  {#snippet body()}
      <div
        class="grid gap-3 rounded-lg border border-border bg-bg-primary/80 p-3 md:grid-cols-3"
        data-testid={setupWorkspaceTestIds.peripheralsSummary}
      >
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Visible groups</p>
      <p class="mt-2 text-sm font-semibold text-text-primary">{visibleGroups.length}</p>
      <p class="mt-1 text-sm text-text-secondary">Known hardware families and discovered extras stay separated by inventory group.</p>
    </div>
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Filter state</p>
      <p class="mt-2 text-sm font-semibold text-text-primary">{showConfiguredOnly ? "Configured only" : "All discovered groups"}</p>
      <p class="mt-1 text-sm text-text-secondary">
        Groups without truthful enable-state evidence disappear under configured-only mode instead of being guessed as active.
      </p>
    </div>
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Metadata fallback</p>
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
          ? "Disable the filter to inspect all discovered peripheral families, or recover through Full Parameters if you need raw access."
          : "This snapshot did not expose enough peripheral rows for a curated inventory. Recover through Full Parameters if you need direct access."}
      </p>
      <button
        class="mt-4 rounded-md border border-warning/50 bg-bg-primary/80 px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent"
        data-testid={setupWorkspaceTestIds.peripheralsRecovery}
        onclick={onSelectRecovery}
        type="button"
      >
        Open Full Parameters recovery
      </button>
    </div>
  {:else}
    <div class="space-y-4">
      {#each visibleGroups as group (group.id)}
        <section
          class="rounded-lg border border-border bg-bg-primary/70 p-3"
          data-testid={`${setupWorkspaceTestIds.peripheralsGroupPrefix}-${group.id}`}
        >
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Inventory group</p>
              <h4 class="mt-2 text-lg font-semibold text-text-primary">{group.label}</h4>
              <p class="mt-2 text-sm text-text-secondary">
                {group.stateText} · {group.rowCount} row{group.rowCount === 1 ? "" : "s"}
                {#if group.lockedCount > 0}
                  · {group.lockedCount} read-only fallback row{group.lockedCount === 1 ? "" : "s"}
                {/if}
              </p>
            </div>
            <span class={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${group.configured === true ? "border-accent/30 bg-accent/10 text-accent" : "border-border bg-bg-secondary text-text-secondary"}`}>
              {group.stateText}
            </span>
          </div>

          <div class="mt-4 space-y-4">
            {#each group.subgroups as subgroup (subgroup.id)}
              <div class="rounded-lg border border-border bg-bg-primary/70 p-3">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Subgroup</p>
                    <h5 class="mt-2 text-base font-semibold text-text-primary">{subgroup.label}</h5>
                  </div>
                  <span class="rounded-full border border-border bg-bg-secondary px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-text-secondary">
                    {subgroup.rows.length} row{subgroup.rows.length === 1 ? "" : "s"}
                  </span>
                </div>

                <div class="mt-4 space-y-3">
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
              </div>
            {/each}
          </div>
        </section>
      {/each}
    </div>
  {/if}
  {/snippet}
</SetupSectionShell>
