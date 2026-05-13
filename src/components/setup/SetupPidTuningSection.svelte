<script lang="ts">
import { fromStore } from "svelte/store";

import {
  getParamsStoreContext,
  getSessionStoreContext,
} from "../../app/shell/runtime-context";
import { resolveDocsUrl } from "../../data/ardupilot-docs";
import {
  buildParameterExpertView,
  type ParameterExpertRow,
} from "../../lib/params/parameter-expert-view";
import { deriveVehicleProfile } from "../../lib/setup/vehicle-profile";
import type {
  SetupWorkspaceSection,
  SetupWorkspaceStoreState,
} from "../../lib/stores/setup-workspace";
import ParameterExpertRowComponent from "../params/ParameterExpertRow.svelte";
import SetupSectionShell from "./SetupSectionShell.svelte";
import { setupWorkspaceTestIds } from "./setup-workspace-test-ids";

type CuratedPidGroup = {
  id: string;
  title: string;
  description: string;
  rows: ParameterExpertRow[];
};

type CuratedPidView = {
  familyStateText: string;
  familyDetailText: string;
  groups: CuratedPidGroup[];
  banners: Array<{ id: string; text: string; tone: "warning" | "muted" }>;
  recoveryReasons: string[];
  metadataFallbackCount: number;
};

const COPTER_GROUP_DEFINITIONS: ReadonlyArray<{
  id: string;
  title: string;
  description: string;
  names: string[];
}> = [
  {
    id: "rate",
    title: "Rate controllers",
    description: "Inner-loop roll, pitch, and yaw response stays grouped instead of dropping into a raw prefix browser.",
    names: [
      "ATC_RAT_RLL_P",
      "ATC_RAT_RLL_I",
      "ATC_RAT_RLL_D",
      "ATC_RAT_RLL_FF",
      "ATC_RAT_RLL_FLTD",
      "ATC_RAT_RLL_FLTE",
      "ATC_RAT_RLL_FLTT",
      "ATC_RAT_PIT_P",
      "ATC_RAT_PIT_I",
      "ATC_RAT_PIT_D",
      "ATC_RAT_PIT_FF",
      "ATC_RAT_PIT_FLTD",
      "ATC_RAT_PIT_FLTE",
      "ATC_RAT_PIT_FLTT",
      "ATC_RAT_YAW_P",
      "ATC_RAT_YAW_I",
      "ATC_RAT_YAW_D",
      "ATC_RAT_YAW_FF",
      "ATC_RAT_YAW_FLTD",
      "ATC_RAT_YAW_FLTE",
      "ATC_RAT_YAW_FLTT",
    ],
  },
  {
    id: "outer-loop",
    title: "Angle and position hold",
    description: "Outer-loop angle and position response stays surfaced as a purposeful copter tuning group.",
    names: [
      "ATC_ANG_RLL_P",
      "ATC_ANG_PIT_P",
      "ATC_ANG_YAW_P",
      "PSC_ACCZ_P",
      "PSC_ACCZ_I",
      "PSC_ACCZ_D",
      "PSC_VELZ_P",
      "PSC_POSZ_P",
      "PSC_VELXY_P",
      "PSC_VELXY_I",
      "PSC_VELXY_D",
      "PSC_POSXY_P",
    ],
  },
  {
    id: "filters",
    title: "Filters and notch control",
    description: "Shared gyro, accelerometer, and notch controls remain visible here even when some enum metadata is degraded.",
    names: [
      "INS_GYRO_FILTER",
      "INS_ACCEL_FILTER",
      "INS_HNTCH_ENABLE",
      "INS_HNTCH_MODE",
      "INS_HNTCH_FREQ",
      "INS_HNTCH_BW",
      "INS_HNTCH_REF",
    ],
  },
];

const PLANE_GROUP_DEFINITIONS: ReadonlyArray<{
  id: string;
  title: string;
  description: string;
  names: string[];
}> = [
  {
    id: "servo",
    title: "Servo response",
    description: "Fixed-wing roll, pitch, and yaw servo tuning stays grouped by control surface family.",
    names: [
      "RLL2SRV_P",
      "RLL2SRV_I",
      "RLL2SRV_D",
      "RLL2SRV_FF",
      "RLL2SRV_IMAX",
      "RLL2SRV_TCONST",
      "PTCH2SRV_P",
      "PTCH2SRV_I",
      "PTCH2SRV_D",
      "PTCH2SRV_FF",
      "PTCH2SRV_IMAX",
      "PTCH2SRV_TCONST",
      "YAW2SRV_DAMP",
      "YAW2SRV_INT",
      "YAW2SRV_RLL",
    ],
  },
  {
    id: "speed",
    title: "Speed configuration",
    description: "Cruise-speed and airspeed guardrails stay together instead of blending into unrelated raw parameter groups.",
    names: [
      "ARSPD_FBW_MIN",
      "ARSPD_FBW_MAX",
      "TRIM_THROTTLE",
      "TRIM_ARSPD_CM",
    ],
  },
  {
    id: "filters",
    title: "Shared filters",
    description: "Shared sensor filtering remains editable here when the plane snapshot exposes the rows truthfully.",
    names: [
      "INS_GYRO_FILTER",
      "INS_ACCEL_FILTER",
      "INS_HNTCH_ENABLE",
      "INS_HNTCH_MODE",
      "INS_HNTCH_FREQ",
      "INS_HNTCH_BW",
      "INS_HNTCH_REF",
    ],
  },
];

const QUADPLANE_GROUP_DEFINITIONS: ReadonlyArray<{
  id: string;
  title: string;
  description: string;
  names: string[];
}> = [
  {
    id: "vtol-rate",
    title: "VTOL hover rate controllers",
    description: "QuadPlane hover tuning stays bound to the Q_A_* family and never falls back to fixed-wing servo cards.",
    names: [
      "Q_A_RAT_RLL_P",
      "Q_A_RAT_RLL_I",
      "Q_A_RAT_RLL_D",
      "Q_A_RAT_RLL_FF",
      "Q_A_RAT_RLL_FLTD",
      "Q_A_RAT_RLL_FLTE",
      "Q_A_RAT_RLL_FLTT",
      "Q_A_RAT_PIT_P",
      "Q_A_RAT_PIT_I",
      "Q_A_RAT_PIT_D",
      "Q_A_RAT_PIT_FF",
      "Q_A_RAT_PIT_FLTD",
      "Q_A_RAT_PIT_FLTE",
      "Q_A_RAT_PIT_FLTT",
      "Q_A_RAT_YAW_P",
      "Q_A_RAT_YAW_I",
      "Q_A_RAT_YAW_D",
      "Q_A_RAT_YAW_FF",
      "Q_A_RAT_YAW_FLTD",
      "Q_A_RAT_YAW_FLTE",
      "Q_A_RAT_YAW_FLTT",
      "Q_A_ACCEL_P_MAX",
      "Q_A_ACCEL_R_MAX",
      "Q_A_ACCEL_Y_MAX",
      "Q_A_THR_MIX_MAN",
    ],
  },
  {
    id: "vtol-motor",
    title: "Lift-motor response",
    description: "Lift-thrust response and compensation remain tied to Q_M_* instead of falling through to generic multirotor rows.",
    names: [
      "Q_M_THST_EXPO",
      "Q_M_THST_HOVER",
      "Q_M_BAT_VOLT_MAX",
      "Q_M_BAT_VOLT_MIN",
    ],
  },
  {
    id: "filters",
    title: "Shared filters",
    description: "Shared sensor filters remain visible when the VTOL snapshot exposes them truthfully.",
    names: [
      "INS_GYRO_FILTER",
      "INS_ACCEL_FILTER",
      "INS_HNTCH_ENABLE",
      "INS_HNTCH_MODE",
      "INS_HNTCH_FREQ",
      "INS_HNTCH_BW",
      "INS_HNTCH_REF",
    ],
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
const sessionStore = getSessionStoreContext();
const paramsState = fromStore(paramsStore);
const sessionState = fromStore(sessionStore);

let params = $derived(paramsState.current);
let session = $derived(sessionState.current);
let actionsBlocked = $derived(view.checkpoint.blocksActions || section.availability === "blocked");
let rowReadiness = $derived(actionsBlocked ? "degraded" : view.readiness);
let docsUrl = $derived(resolveDocsUrl("tuning"));
let vehicleType = $derived(session.sessionDomain.value?.vehicle_state?.vehicle_type ?? null);
let profile = $derived(deriveVehicleProfile(vehicleType, {
  paramStore: params.paramStore,
  stagedEdits: params.stagedEdits,
}));
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
let curated = $derived(buildCuratedView());

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
      ?? "Metadata is incomplete for this row, so the purposeful PID surface keeps it visible but read-only.",
    readOnly: true,
  } satisfies ParameterExpertRow;
}

function buildGroups(
  definitions: ReadonlyArray<{ id: string; title: string; description: string; names: string[] }>,
): CuratedPidGroup[] {
  return definitions
    .map((definition) => ({
      id: definition.id,
      title: definition.title,
      description: definition.description,
      rows: definition.names
        .map((name) => rowIndex.get(name) ?? null)
        .filter((row): row is ParameterExpertRow => row !== null),
    }))
    .filter((group) => group.rows.length > 0);
}

function buildCuratedView(): CuratedPidView {
  const metadataFallbackCount = [...rowIndex.values()].filter((row) => row.readOnly === true).length;
  const banners: CuratedPidView["banners"] = [];
  const recoveryReasons: string[] = [];

  if (profile.isPlane && profile.quadPlaneEnabled && profile.planeVtolState !== "vtol-ready") {
    recoveryReasons.push(
      "QuadPlane hover tuning stays blocked until the current scope exposes the VTOL-specific Q_A_* and Q_M_* parameter families truthfully.",
    );
    return {
      familyStateText: "QuadPlane refresh required",
      familyDetailText:
        "The vehicle reports Plane firmware with VTOL enabled, but the VTOL tuning families are still partial. This section refuses to fall back to fixed-wing tuning cards while the hover truth is incomplete.",
      groups: [],
      banners: [
        {
          id: "quadplane-refresh",
          text: "Awaiting truthful Q_A_* and Q_M_* VTOL tuning rows after the QuadPlane refresh. Use Full Parameters only as an explicit recovery path.",
          tone: "warning",
        },
      ],
      recoveryReasons,
      metadataFallbackCount,
    };
  }

  let familyStateText = "Unsupported vehicle family";
  let familyDetailText = "This PID section only exposes purposeful copter, fixed-wing, and fully refreshed QuadPlane tuning surfaces.";
  let groups: CuratedPidGroup[] = [];

  if (profile.isCopter) {
    familyStateText = "Multirotor rate and hold tuning";
    familyDetailText = "Copter PID work stays grouped by rate, outer-loop hold, and filters instead of sending you into a raw-parameter-first view.";
    groups = buildGroups(COPTER_GROUP_DEFINITIONS);
  } else if (profile.isPlane && profile.planeVtolState === "vtol-ready") {
    familyStateText = "QuadPlane VTOL tuning";
    familyDetailText = "VTOL hover and lift-motor tuning stay scoped to the Q_A_* and Q_M_* families, with shared filters separated below.";
    groups = buildGroups(QUADPLANE_GROUP_DEFINITIONS);

    const missingFamilies = [
      groups.some((group) => group.id === "vtol-rate") ? null : "Q_A_* hover rate tuning",
      groups.some((group) => group.id === "vtol-motor") ? null : "Q_M_* lift-motor tuning",
    ].filter((value): value is string => value !== null);

    if (missingFamilies.length > 0) {
      banners.push({
        id: "quadplane-gap",
        text: `Missing VTOL families stay explicit here instead of falling back to fixed-wing cards: ${missingFamilies.join(" and ")}.`,
        tone: "warning",
      });
      recoveryReasons.push(`Missing VTOL tuning families: ${missingFamilies.join(", ")}.`);
    }
  } else if (profile.isPlane) {
    familyStateText = "Fixed-wing servo and speed tuning";
    familyDetailText = "Plane tuning stays grouped by servo response, cruise-speed configuration, and shared filters rather than raw prefixes.";
    groups = buildGroups(PLANE_GROUP_DEFINITIONS);
  } else if (profile.isRover) {
    familyStateText = "Rover PID surface unavailable";
    familyDetailText = "Rover tuning is intentionally not modeled by this purposeful PID surface yet.";
    recoveryReasons.push("Rover PID tuning is not yet implemented in the setup workspace.");
  } else {
    recoveryReasons.push("The current vehicle family is ambiguous, so PID tuning stays fail-closed instead of guessing which control families should be edited.");
  }

  if (metadataFallbackCount > 0) {
    banners.push({
      id: "metadata",
      text: `${metadataFallbackCount} row${metadataFallbackCount === 1 ? "" : "s"} stay visible with raw-name fallback because their metadata is incomplete. Those rows are intentionally read-only here.`,
      tone: "muted",
    });
  }

  if (groups.length === 0 && recoveryReasons.length === 0) {
    recoveryReasons.push("No purposeful PID groups are available for the current parameter snapshot.");
  }

  return {
    familyStateText,
    familyDetailText,
    groups,
    banners,
    recoveryReasons,
    metadataFallbackCount,
  };
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
  title="Vehicle-aware PID surfaces without a raw-parameter fallback"
  description="PID tuning stays shaped around the current vehicle family. Copter, fixed-wing, and fully refreshed QuadPlane scopes each get a purposeful expert-row surface, while partial VTOL truth stays explicit and fail-closed."
  testId={setupWorkspaceTestIds.pidTuningSection}
>
  {#snippet actions()}
    {#if docsUrl}
      <a
        class="rounded-md border border-border bg-bg-primary/80 px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent"
        data-testid={setupWorkspaceTestIds.pidTuningDocsLink}
        href={docsUrl}
        rel="noreferrer"
        target="_blank"
      >
        Tuning docs
      </a>
    {/if}
  {/snippet}

  {#snippet body()}
      <div
        class="grid gap-3 rounded-lg border border-border bg-bg-primary/80 p-3 md:grid-cols-3"
        data-testid={setupWorkspaceTestIds.pidTuningSummary}
      >
    <div>
      <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">Family state</p>
      <p class="mt-2 text-sm font-semibold text-text-primary" data-testid={setupWorkspaceTestIds.pidTuningFamilyState}>
        {curated.familyStateText}
      </p>
      <p class="mt-1 text-sm text-text-secondary">{curated.familyDetailText}</p>
    </div>
    <div>
      <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">Visible groups</p>
      <p class="mt-2 text-sm font-semibold text-text-primary">{curated.groups.length}</p>
      <p class="mt-1 text-sm text-text-secondary">
        Purpose-built groups stay mounted only when the current snapshot exposes truthful family-specific rows.
      </p>
    </div>
    <div>
      <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">Metadata fallback</p>
      <p class="mt-2 text-sm font-semibold text-text-primary">{curated.metadataFallbackCount} locked row{curated.metadataFallbackCount === 1 ? "" : "s"}</p>
      <p class="mt-1 text-sm text-text-secondary">
        Incomplete enum or label metadata downgrades affected expert rows to raw-name, read-only visibility here.
      </p>
    </div>
  </div>

  {#each curated.banners as banner (banner.id)}
    <div
      class={`rounded-lg border px-4 py-4 text-sm leading-6 ${banner.tone === "warning" ? "border-warning/40 bg-warning/10 text-warning" : "border-border bg-bg-primary/80 text-text-secondary"}`}
      data-testid={`${setupWorkspaceTestIds.pidTuningBannerPrefix}-${banner.id}`}
    >
      {banner.text}
    </div>
  {/each}

  {#if curated.groups.length > 0}
    <div class="space-y-4">
      {#each curated.groups as group (group.id)}
        <section
          class="rounded-lg border border-border bg-bg-primary/70 p-3"
          data-testid={`${setupWorkspaceTestIds.pidTuningGroupPrefix}-${group.id}`}
        >
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">Curated group</p>
              <h4 class="mt-2 text-lg font-semibold text-text-primary">{group.title}</h4>
              <p class="mt-2 text-sm text-text-secondary">{group.description}</p>
            </div>
            <span class="rounded-full border border-border bg-bg-secondary px-3 py-1 text-xs font-semibold uppercase tracking-widest text-text-secondary">
              {group.rows.length} row{group.rows.length === 1 ? "" : "s"}
            </span>
          </div>

          <div class="mt-4 space-y-3">
            {#each group.rows as row (row.renderId)}
              <ParameterExpertRowComponent
                envelopeKey={envelopeKey()}
                onDiscard={discardItem}
                onStage={stageItem}
                readiness={rowReadiness}
                {row}
              />
            {/each}
          </div>
        </section>
      {/each}
    </div>
  {/if}

  {#if curated.recoveryReasons.length > 0}
    <div
      class="rounded-lg border border-warning/40 bg-warning/10 px-4 py-4 text-sm leading-6 text-warning"
      data-testid={setupWorkspaceTestIds.pidTuningRecovery}
    >
      <p class="font-semibold text-text-primary">PID recovery is active.</p>
      <ul class="mt-2 list-disc space-y-1 pl-5">
        {#each curated.recoveryReasons as reason (reason)}
          <li>{reason}</li>
        {/each}
      </ul>
      <button
        class="mt-4 rounded-md border border-warning/50 bg-bg-primary/80 px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent"
        onclick={onSelectRecovery}
        type="button"
      >
        Open Full Parameters recovery
      </button>
    </div>
  {/if}
  {/snippet}
</SetupSectionShell>
