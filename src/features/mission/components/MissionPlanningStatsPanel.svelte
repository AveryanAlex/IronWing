<script lang="ts">
import type { FenceRegion, GeoPoint3d } from "../../../lib/mavkit-types";
import type { TypedDraftItem } from "../../../lib/mission-draft-typed";
import type { MissionPlannerMode } from "../../../lib/stores/mission-planner";
import { computeFenceStats } from "../../../lib/fence-statistics";
import {
  computeMissionStatistics,
  type MissionStatisticsIndeterminateReason,
} from "../../../lib/mission-statistics";
import { computeRallyStats } from "../../../lib/rally-statistics";
import { Alert, Badge, Card, Eyebrow, FactTile, Field, HelperText, Input } from "../../../components/ui";
import { missionWorkspaceTestIds } from "../mission-workspace-test-ids";

type HomeReference = {
  latitude_deg: number;
  longitude_deg: number;
  altitude_m: number;
};

type Props = {
  mode?: MissionPlannerMode;
  home: HomeReference | null;
  missionItems: TypedDraftItem[];
  fenceRegions: FenceRegion[];
  rallyPoints: GeoPoint3d[];
  cruiseSpeed: number;
  hoverSpeed: number;
  confirmedCruiseSpeed: number;
  confirmedHoverSpeed: number;
  readOnly: boolean;
  onSetPlanningSpeeds: (args: { cruiseSpeed?: number; hoverSpeed?: number }) => void;
  onPersistPlanningSpeeds: (args: { cruiseSpeed?: number; hoverSpeed?: number }) => void;
};

type StatEntry = {
  testId: string;
  label: string;
  value: string;
  hint: string;
  tone?: "default" | "success" | "warning" | "danger";
};

let {
  mode = "mission",
  home,
  missionItems,
  fenceRegions,
  rallyPoints,
  cruiseSpeed,
  hoverSpeed,
  confirmedCruiseSpeed,
  confirmedHoverSpeed,
  readOnly,
  onSetPlanningSpeeds,
  onPersistPlanningSpeeds,
}: Props = $props();

let missionStats = $derived(computeMissionStatistics(home, missionItems, {
  cruiseSpeedMps: cruiseSpeed,
  hoverSpeedMps: hoverSpeed,
}));
let fenceStats = $derived(computeFenceStats(fenceRegions));
let rallyStats = $derived(computeRallyStats(
  rallyPoints,
  home ? { latitude_deg: home.latitude_deg, longitude_deg: home.longitude_deg } : null,
));

let missionDistanceHint = $derived.by(() => {
  if (missionItems.length === 0) {
    return "Add mission items to turn this into a real route estimate.";
  }

  const parts = [`Cruise path ${formatDistance(missionStats.travelDistanceM)}`];
  if (missionStats.orbitDistanceM > 0) {
    parts.push(`Orbit work ${formatDistance(missionStats.orbitDistanceM)}`);
  }
  if (missionStats.nonTravelTimeSec > 0) {
    parts.push(`${Math.round(missionStats.nonTravelTimeSec)} s fixed-time overhead`);
  }
  return parts.join(" · ");
});
let missionTimeHint = $derived.by(() => {
  if (missionStats.isTimeIndeterminate) {
    return "IronWing keeps the estimate fail-closed until every blocking condition clears.";
  }

  if (missionItems.length === 0) {
    return "No ETA until the active draft contains mission work.";
  }

  return `${Math.round(missionStats.nonTravelTimeSec)} s fixed-time overhead · cruise ${formatSpeed(cruiseSpeed)} · hover ${formatSpeed(hoverSpeed)}`;
});
let missionStatsEntries = $derived<StatEntry[]>([
  {
    testId: missionWorkspaceTestIds.planningStatsMissionDistance,
    label: "Total distance",
    value: formatDistance(missionStats.totalDistanceM),
    hint: missionDistanceHint,
    tone: missionStats.totalDistanceM > 0 ? "success" : "default",
  },
  {
    testId: missionWorkspaceTestIds.planningStatsMissionTime,
    label: "Estimated time",
    value: formatEstimatedTime(missionStats.estimatedTimeSec),
    hint: missionTimeHint,
    tone: missionStats.isTimeIndeterminate ? "warning" : missionStats.estimatedTimeSec !== null ? "success" : "default",
  },
  {
    testId: missionWorkspaceTestIds.planningStatsMissionMaxAltitude,
    label: "Max altitude",
    value: missionStats.maxAltitudeM === null ? "—" : formatAltitude(missionStats.maxAltitudeM),
    hint: missionStats.maxAltitudeM === null
      ? "No positional mission commands expose altitude yet."
      : "Highest positional mission altitude in the active draft.",
  },
  {
    testId: missionWorkspaceTestIds.planningStatsMissionAvgAltitude,
    label: "Avg altitude",
    value: missionStats.avgAltitudeM === null ? "—" : formatAltitude(missionStats.avgAltitudeM),
    hint: missionStats.avgAltitudeM === null
      ? "Average altitude appears once the draft has positional work."
      : "Mean altitude across positional mission commands.",
  },
]);
let fenceStatsEntries = $derived<StatEntry[]>([
  {
    testId: missionWorkspaceTestIds.planningStatsFenceRegions,
    label: "Regions",
    value: String(fenceStats.regionCount),
    hint: fenceStats.regionCount === 0
      ? "No fence regions are staged in this planner draft."
      : `${fenceStats.regionCount} inclusion/exclusion region${fenceStats.regionCount === 1 ? "" : "s"} staged in the draft.`,
    tone: fenceStats.regionCount > 0 ? "success" : "default",
  },
  {
    testId: missionWorkspaceTestIds.planningStatsFencePerimeter,
    label: "Perimeter",
    value: formatDistance(fenceStats.totalPerimeterM),
    hint: fenceStats.regionCount === 0
      ? "Boundary distance appears once a fence region is present."
      : "Summed boundary length across every staged fence region.",
  },
  {
    testId: missionWorkspaceTestIds.planningStatsFenceArea,
    label: "Area",
    value: formatArea(fenceStats.totalAreaM2),
    hint: fenceStats.regionCount === 0
      ? "Enclosed area stays empty until the draft has usable fence geometry."
      : "Total enclosed area across inclusion and exclusion geometry.",
  },
]);
let rallyStatsEntries = $derived<StatEntry[]>([
  {
    testId: missionWorkspaceTestIds.planningStatsRallyCount,
    label: "Rally points",
    value: String(rallyStats.pointCount),
    hint: rallyStats.pointCount === 0
      ? "No rally diversion points are staged in this draft."
      : `${rallyStats.pointCount} rally diversion point${rallyStats.pointCount === 1 ? "" : "s"} staged in the draft.`,
    tone: rallyStats.pointCount > 0 ? "success" : "default",
  },
  {
    testId: missionWorkspaceTestIds.planningStatsRallyMaxDistance,
    label: "Max distance from home",
    value: rallyStats.maxDistanceFromHomeM === null ? "Unavailable" : formatDistance(rallyStats.maxDistanceFromHomeM),
    hint: rallyStats.pointCount === 0
      ? "Distance from home appears once rally points are staged."
      : home === null
        ? "Set Home before IronWing can measure rally diversion distance."
        : "Furthest rally point from the active Home position.",
    tone: rallyStats.maxDistanceFromHomeM === null && rallyStats.pointCount > 0 ? "warning" : "default",
  },
]);
let missionReasonEntries = $derived(missionStats.indeterminateReasons.map((reason) => ({
  reason,
  label: describeIndeterminateReason(reason),
})));
let blockingItemsLabel = $derived(
  missionStats.indeterminateItemIndexes.length > 0
    ? missionStats.indeterminateItemIndexes.map((index) => `#${index + 1}`).join(", ")
    : "Speed/profile constraints only",
);
let draftOverridesDefaults = $derived(
  !numbersEqual(cruiseSpeed, confirmedCruiseSpeed) || !numbersEqual(hoverSpeed, confirmedHoverSpeed),
);
let speedStatusTone: "default" | "success" | "warning" | "danger" = $derived(
	readOnly ? "default" : draftOverridesDefaults ? "warning" : "success",
);
let speedStatusMessage = $derived.by(() => {
  if (readOnly) {
    return "Speed defaults stay visible here, but this attachment is read-only so edits are blocked.";
  }

  if (draftOverridesDefaults) {
    return `Draft speeds currently override saved defaults. Saved defaults · Cruise ${formatSpeed(confirmedCruiseSpeed)} · Hover ${formatSpeed(confirmedHoverSpeed)}.`;
  }

  return `Saved defaults are in sync with this draft · Cruise ${formatSpeed(confirmedCruiseSpeed)} · Hover ${formatSpeed(confirmedHoverSpeed)}.`;
});

let syncedCruiseDraft = "";
let syncedHoverDraft = "";
let cruiseDraft = $state("");
let hoverDraft = $state("");

$effect(() => {
  const next = stringifyEditableNumber(cruiseSpeed);
  if (next !== syncedCruiseDraft) {
    syncedCruiseDraft = next;
    cruiseDraft = next;
  }
});

$effect(() => {
  const next = stringifyEditableNumber(hoverSpeed);
  if (next !== syncedHoverDraft) {
    syncedHoverDraft = next;
    hoverDraft = next;
  }
});

let cruiseValidation = $derived(readOnly ? null : validatePlanningSpeedDraft(cruiseDraft, cruiseSpeed, "Cruise"));
let hoverValidation = $derived(readOnly ? null : validatePlanningSpeedDraft(hoverDraft, hoverSpeed, "Hover"));

function commitPlanningSpeed(kind: "cruise" | "hover") {
  if (readOnly) {
    return;
  }

  const rawValue = kind === "cruise" ? cruiseDraft : hoverDraft;
  const parsed = parsePlanningSpeed(rawValue);
  if (parsed === null) {
    return;
  }

  const currentValue = kind === "cruise" ? cruiseSpeed : hoverSpeed;
  if (numbersEqual(parsed, currentValue)) {
    return;
  }

  const patch = kind === "cruise" ? { cruiseSpeed: parsed } : { hoverSpeed: parsed };
  onSetPlanningSpeeds(patch);
  onPersistPlanningSpeeds(patch);
}

function formatDistance(distanceM: number): string {
  if (distanceM >= 1000) {
    const precision = distanceM >= 10_000 ? 1 : 2;
    return `${(distanceM / 1000).toFixed(precision)} km`;
  }

  return `${Math.round(distanceM)} m`;
}

function formatEstimatedTime(estimatedTimeSec: number | null): string {
  if (estimatedTimeSec === null) {
    return "Indeterminate";
  }

  const roundedSeconds = Math.max(0, Math.round(estimatedTimeSec));
  if (roundedSeconds >= 3600) {
    const hours = Math.floor(roundedSeconds / 3600);
    const minutes = Math.floor((roundedSeconds % 3600) / 60);
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  }

  const minutes = Math.floor(roundedSeconds / 60);
  const seconds = roundedSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatAltitude(altitudeM: number): string {
  return `${Math.round(altitudeM)} m`;
}

function formatArea(areaM2: number): string {
  if (areaM2 >= 1_000_000) {
    return `${(areaM2 / 1_000_000).toFixed(3)} km²`;
  }

  return `${Math.round(areaM2)} m²`;
}

function formatSpeed(speedMps: number): string {
  return `${trimTrailingZeros(speedMps)} m/s`;
}

function trimTrailingZeros(value: number): string {
  return value.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

function stringifyEditableNumber(value: number): string {
  return trimTrailingZeros(value);
}

function parsePlanningSpeed(rawValue: string): number | null {
  if (rawValue.trim().length === 0) {
    return null;
  }

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function validatePlanningSpeedDraft(rawValue: string, currentValue: number, label: string): string | null {
  if (rawValue.trim().length === 0) {
    return `${label} speed is blank. Estimates continue using ${formatSpeed(currentValue)} until you confirm a valid edit.`;
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return `${label} speed must be greater than 0 m/s. Estimates continue using ${formatSpeed(currentValue)} until you confirm a valid edit.`;
  }

  return null;
}

function describeIndeterminateReason(reason: MissionStatisticsIndeterminateReason): string {
  switch (reason) {
    case "negative_nav_delay":
      return "Negative NAV delay values are invalid, so IronWing refuses to fabricate an ETA.";
    case "loiter_unlimited":
      return "Loiter-unlimited commands never finish on their own, so the total time stays indeterminate.";
    case "altitude_wait":
      return "Altitude-wait commands depend on external climb/descent completion, so the ETA stays fail-closed.";
    case "pause_continue":
      return "Pause/continue commands wait for operator input, so the ETA cannot be resolved automatically.";
    case "invalid_cruise_speed":
      return "Cruise speed must stay above 0 m/s before IronWing can compute travel time.";
    case "invalid_hover_speed":
      return "Hover speed must stay above 0 m/s before IronWing can compute orbit work.";
    default:
      return reason;
  }
}

function factTone(tone: "default" | "success" | "warning" | "danger"): "neutral" | "success" | "warning" | "danger" {
  switch (tone) {
    case "success":
      return "success";
    case "warning":
      return "warning";
    case "danger":
      return "danger";
    default:
      return "neutral";
  }
}

function numbersEqual(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.000_001;
}
</script>

<Card.Root as="section" density="compact" surface="panel" testId={missionWorkspaceTestIds.planningStatsPanel}>
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div>
      <Eyebrow>Planning support</Eyebrow>
      <h3 class="mt-1 text-sm font-semibold text-text-primary">
        {mode === "mission" ? "Mission estimates" : mode === "fence" ? "Fence support stats" : "Rally support stats"}
      </h3>
    </div>

    {#if mode === "mission"}
      <Badge variant={speedStatusTone === "warning" ? "warning" : speedStatusTone === "success" ? "success" : "muted"} testId={missionWorkspaceTestIds.planningStatsSpeedStatus}>
        {readOnly ? "Read-only" : draftOverridesDefaults ? "Draft override" : "Defaults synced"}
      </Badge>
    {/if}
  </div>

  <div class="mt-4 grid gap-4">
    {#if mode === "mission"}
    <Card.Root as="article" density="compact" surface="secondary" testId={missionWorkspaceTestIds.planningStatsMissionCard}>
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Eyebrow>Mission envelope</Eyebrow>
          <h4 class="mt-1 text-sm font-semibold text-text-primary">Mission estimates</h4>
        </div>

        <Badge variant={missionStats.isTimeIndeterminate ? "warning" : "success"} testId={missionWorkspaceTestIds.planningStatsMissionState}>
          {missionStats.isTimeIndeterminate ? "Indeterminate" : "Finite estimate"}
        </Badge>
      </div>

      <div class="mt-4 grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-3">
        {#each missionStatsEntries as stat (stat.testId)}
          <FactTile density="default" detail={stat.hint} label={stat.label} testId={stat.testId} tone={factTone(stat.tone ?? "default")} value={stat.value} />
        {/each}
      </div>

      {#if missionStats.isTimeIndeterminate}
        <Alert class="mt-4" density="compact" layout="stacked" variant="warning" testId={missionWorkspaceTestIds.planningStatsIndeterminate}>
          <p class="text-sm font-semibold">Estimated time stays indeterminate.</p>
          <p class="mt-1 text-xs text-warning/90">Blocking items · {blockingItemsLabel}</p>
          <ul class="mt-3 list-inside list-disc space-y-1 text-xs text-warning/90">
            {#each missionReasonEntries as entry (entry.reason)}
              <li>{entry.label}</li>
            {/each}
          </ul>
        </Alert>
      {/if}

      <div class="mt-4 grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-3">
        <Card.Root density="compact" surface="primary">
          <Field.Root invalid={Boolean(cruiseValidation)}>
          <Field.Label class="text-xs font-medium text-text-muted">Cruise speed (m/s)</Field.Label>
          <Input
            testId={missionWorkspaceTestIds.planningStatsCruiseInput}
            disabled={readOnly}
            inputmode="decimal"
            invalid={Boolean(cruiseValidation)}
            onblur={() => commitPlanningSpeed("cruise")}
            onchange={() => commitPlanningSpeed("cruise")}
            oninput={(event) => {
              cruiseDraft = (event.currentTarget as HTMLInputElement).value;
            }}
            step="any"
            type="number"
            value={cruiseDraft}
          />
          {#if cruiseValidation}
            <Field.Error class="text-xs text-warning" data-testid={missionWorkspaceTestIds.planningStatsCruiseValidation}>{cruiseValidation}</Field.Error>
          {/if}
          </Field.Root>
        </Card.Root>

        <Card.Root density="compact" surface="primary">
          <Field.Root invalid={Boolean(hoverValidation)}>
          <Field.Label class="text-xs font-medium text-text-muted">Hover speed (m/s)</Field.Label>
          <Input
            testId={missionWorkspaceTestIds.planningStatsHoverInput}
            disabled={readOnly}
            inputmode="decimal"
            invalid={Boolean(hoverValidation)}
            onchange={() => commitPlanningSpeed("hover")}
            oninput={(event) => {
              hoverDraft = (event.currentTarget as HTMLInputElement).value;
            }}
            step="any"
            type="number"
            value={hoverDraft}
          />
          {#if hoverValidation}
            <Field.Error class="text-xs text-warning" data-testid={missionWorkspaceTestIds.planningStatsHoverValidation}>{hoverValidation}</Field.Error>
          {/if}
          </Field.Root>
        </Card.Root>
      </div>

      <HelperText class="mt-3" size="xs">{speedStatusMessage}</HelperText>
    </Card.Root>
    {/if}

    {#if mode === "fence"}
    <Card.Root as="article" density="compact" surface="secondary" testId={missionWorkspaceTestIds.planningStatsFenceCard}>
      <Eyebrow>Fence continuity</Eyebrow>
      <h4 class="mt-1 text-sm font-semibold text-text-primary">Fence support stats</h4>
      <HelperText class="mt-1" size="xs">
        Fence perimeter and area stay visible even when the active editor is focused on Mission or Rally work.
      </HelperText>

      <div class="mt-4 grid gap-3">
        {#each fenceStatsEntries as stat (stat.testId)}
          <FactTile density="default" detail={stat.hint} label={stat.label} testId={stat.testId} tone={factTone(stat.tone ?? "default")} value={stat.value} />
        {/each}
      </div>
    </Card.Root>
    {/if}

    {#if mode === "rally"}
    <Card.Root as="article" density="compact" surface="secondary" testId={missionWorkspaceTestIds.planningStatsRallyCard}>
      <Eyebrow>Rally continuity</Eyebrow>
      <h4 class="mt-1 text-sm font-semibold text-text-primary">Rally support stats</h4>
      <HelperText class="mt-1" size="xs">
        Rally distance stays explicit about missing Home truth instead of collapsing to a fake zero-distance answer.
      </HelperText>

      <div class="mt-4 grid gap-3">
        {#each rallyStatsEntries as stat (stat.testId)}
          <FactTile density="default" detail={stat.hint} label={stat.label} testId={stat.testId} tone={factTone(stat.tone ?? "default")} value={stat.value} />
        {/each}
      </div>
    </Card.Root>
    {/if}
  </div>
</Card.Root>
