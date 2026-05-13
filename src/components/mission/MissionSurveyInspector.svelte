<script lang="ts">
import { localXYToLatLon } from "../../lib/mission-coordinates";
import {
  commandDisplayName,
  commandPosition,
  geoPoint3dAltitude,
  geoPoint3dLatLon,
  withCommandField,
  withGeoPoint3dAltitude,
  withGeoPoint3dPosition,
  type GeoPoint2d,
  type MissionItem,
} from "../../lib/mavkit-types";
import {
  estimateSurveyFlightTime,
  formatSurveyStats,
  type FormattedSurveyStats,
} from "../../lib/survey-preview";
import {
  resolveSurveyGenerationBlockedReason,
} from "../../lib/mission-survey-authoring";
import type { MissionPlannerSurveyPromptView } from "../../lib/stores/mission-planner-view";
import type { CatalogCamera } from "../../lib/survey-camera-catalog";
import type { SurveyRegion } from "../../lib/survey-region";
import MissionSurveyCameraPicker from "./MissionSurveyCameraPicker.svelte";
import { missionWorkspaceTestIds } from "./mission-workspace-test-ids";

type LocalMessageTone = "warning" | "info";
type LocalMessage = {
  tone: LocalMessageTone;
  text: string;
};

type Props = {
  region: SurveyRegion;
  cruiseSpeed: number;
  surveyPrompt: MissionPlannerSurveyPromptView | null;
  onUpdateRegion: (regionId: string, updater: (region: SurveyRegion) => SurveyRegion) => void;
  onGenerateRegion: (regionId: string) => Promise<unknown> | unknown;
  onPromptDissolveRegion: (regionId: string) => void;
  onDeleteRegion: (regionId: string) => void;
  onConfirmSurveyPrompt: () => Promise<unknown> | unknown;
  onDismissSurveyPrompt: () => void;
  onMarkGeneratedItemEdited: (regionId: string, localIndex: number, editedItem: MissionItem) => void;
};

const DEFAULT_ORIGIN: GeoPoint2d = {
  latitude_deg: 47.397742,
  longitude_deg: 8.545594,
};

let {
  region,
  cruiseSpeed,
  surveyPrompt,
  onUpdateRegion,
  onGenerateRegion,
  onPromptDissolveRegion,
  onDeleteRegion,
  onConfirmSurveyPrompt,
  onDismissSurveyPrompt,
  onMarkGeneratedItemEdited,
}: Props = $props();

let selectedGeneratedIndex = $state(0);
let localMessage = $state<LocalMessage | null>(null);

let pointCountMinimum = $derived(region.patternType === "corridor" ? 2 : 3);
let geometryLabel = $derived(region.patternType === "corridor" ? "Corridor centerline" : "Survey polygon");
let geometryPoints = $derived(region.patternType === "corridor" ? region.polyline : region.polygon);
let blockedReason = $derived(resolveSurveyGenerationBlockedReason(region));
let promptForRegion = $derived(surveyPrompt?.regionId === region.id ? surveyPrompt : null);
let generatedEntries = $derived.by(() =>
  region.generatedItems.map((generatedItem, index) => {
    const effectiveItem = region.manualEdits.get(index) ?? generatedItem;
    const position = commandPosition(effectiveItem.command);
    return {
      index,
      item: effectiveItem,
      edited: region.manualEdits.has(index),
      position,
      summary: generatedItemSummary(effectiveItem),
    };
  }),
);
let activeGeneratedEntry = $derived.by(() => {
  if (generatedEntries.length === 0) {
    return null;
  }

  const index = Math.min(selectedGeneratedIndex, generatedEntries.length - 1);
  return generatedEntries[index] ?? null;
});
let activeGeneratedPosition = $derived(activeGeneratedEntry?.position ?? null);
let activeGeneratedLatLon = $derived(activeGeneratedPosition ? geoPoint3dLatLon(activeGeneratedPosition) : null);
let activeGeneratedAltitude = $derived(activeGeneratedPosition ? geoPoint3dAltitude(activeGeneratedPosition).value : null);
let formattedStats = $derived.by<FormattedSurveyStats | null>(() => {
  if (!region.generatedStats) {
    return null;
  }

	const flightTime = "estimatedFlightTime_s" in region.generatedStats
		? region.generatedStats.estimatedFlightTime_s
		: estimateSurveyFlightTime(region.generatedItems, cruiseSpeed);
	const normalizedFlightTime = typeof flightTime === "number" && Number.isFinite(flightTime) ? flightTime : null;

	return formatSurveyStats(region.generatedStats, normalizedFlightTime);
});
let regionWarnings = $derived.by(() => {
  const warnings = [...(region.importWarnings ?? [])];

  if (blockedReason?.message) {
    warnings.push(blockedReason.message);
  }

  if (region.generationMessage && region.generationMessage !== blockedReason?.message) {
    warnings.push(region.generationMessage);
  }

  if (region.manualEdits.size > 0) {
    warnings.push(`${region.manualEdits.size} generated item manual edit${region.manualEdits.size === 1 ? " stays" : "s stay"} subordinate to this survey region until you regenerate or dissolve it.`);
  }

  return [...new Set(warnings)];
});
let generateDisabled = $derived(region.generationState === "generating" || blockedReason !== null);
let generateButtonLabel = $derived(region.generatedItems.length > 0 ? "Regenerate survey" : "Generate survey");

function titleCase(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function parseFiniteNumber(raw: string): number | null {
  const normalized = raw.trim();
  if (normalized.length === 0) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePositiveInteger(raw: string): number | null {
  const parsed = parseFiniteNumber(raw);
  if (parsed === null) {
    return null;
  }

  const normalized = Math.trunc(parsed);
  return normalized > 0 ? normalized : null;
}

function buildGeneratedPoint(anchor: GeoPoint2d, x_m: number, y_m: number): GeoPoint2d {
  const { lat, lon } = localXYToLatLon(anchor, x_m, y_m);
  return {
    latitude_deg: lat,
    longitude_deg: lon,
  };
}

function midpoint(left: GeoPoint2d, right: GeoPoint2d): GeoPoint2d {
  return {
    latitude_deg: (left.latitude_deg + right.latitude_deg) / 2,
    longitude_deg: (left.longitude_deg + right.longitude_deg) / 2,
  };
}

function buildAdditionalGeometryPoint(points: GeoPoint2d[], afterIndex: number, patternType: SurveyRegion["patternType"]): GeoPoint2d {
  const current = points[afterIndex] ?? points[points.length - 1] ?? DEFAULT_ORIGIN;
  const next = points[afterIndex + 1] ?? null;

  if (current && next) {
    return midpoint(current, next);
  }

  if (patternType === "corridor") {
    return buildGeneratedPoint(current, 35, points.length % 2 === 0 ? 0 : 15);
  }

  const offsetIndex = Math.max(0, points.length % 4);
  const offsets = [
    { x_m: 25, y_m: 0 },
    { x_m: 0, y_m: 25 },
    { x_m: -25, y_m: 0 },
    { x_m: 0, y_m: -25 },
  ];
  const offset = offsets[offsetIndex] ?? offsets[0]!;
  return buildGeneratedPoint(current, offset.x_m, offset.y_m);
}

function updateGeometryPoint(index: number, key: keyof GeoPoint2d, raw: string) {
  const parsed = parseFiniteNumber(raw);
  if (parsed === null) {
    localMessage = {
      tone: "warning",
      text: `Ignored the invalid ${key === "latitude_deg" ? "latitude" : "longitude"} edit. Enter a finite number to keep survey geometry truthful.`,
    };
    return;
  }

  onUpdateRegion(region.id, (current) => {
    const points = current.patternType === "corridor" ? [...current.polyline] : [...current.polygon];
    const point = points[index];
    if (!point) {
      return current;
    }

    points[index] = {
      ...point,
      [key]: parsed,
    };

    return current.patternType === "corridor"
      ? { ...current, polyline: points }
      : { ...current, polygon: points };
  });
  localMessage = null;
}

function addGeometryPoint(afterIndex: number) {
  onUpdateRegion(region.id, (current) => {
    const points = current.patternType === "corridor" ? [...current.polyline] : [...current.polygon];
    points.splice(afterIndex + 1, 0, buildAdditionalGeometryPoint(points, afterIndex, current.patternType));

    return current.patternType === "corridor"
      ? { ...current, polyline: points }
      : { ...current, polygon: points };
  });
  localMessage = null;
}

function addInitialGeometryPoint() {
  onUpdateRegion(region.id, (current) => {
    const points = current.patternType === "corridor" ? [...current.polyline] : [...current.polygon];
    points.push(buildAdditionalGeometryPoint(points, 0, current.patternType));

    return current.patternType === "corridor"
      ? { ...current, polyline: points }
      : { ...current, polygon: points };
  });
  localMessage = null;
}

function removeGeometryPoint(index: number) {
  if (geometryPoints.length <= pointCountMinimum) {
    localMessage = {
      tone: "warning",
      text: `${titleCase(region.patternType)} surveys need at least ${pointCountMinimum} ${region.patternType === "corridor" ? "centerline points" : "polygon vertices"}.`,
    };
    return;
  }

  onUpdateRegion(region.id, (current) => {
    const points = current.patternType === "corridor" ? [...current.polyline] : [...current.polygon];
    points.splice(index, 1);

    return current.patternType === "corridor"
      ? { ...current, polyline: points }
      : { ...current, polygon: points };
  });
  localMessage = null;
}

function updateNumericParam(key: keyof SurveyRegion["params"], raw: string) {
  const parsed = key === "layerCount" ? parsePositiveInteger(raw) : parseFiniteNumber(raw);
  if (parsed === null) {
    localMessage = {
      tone: "warning",
      text: `Ignored the invalid ${titleCase(String(key))} edit. Enter a finite number to keep survey parameters truthful.`,
    };
    return;
  }

  onUpdateRegion(region.id, (current) => ({
    ...current,
    params: {
      ...current.params,
      [key]: parsed,
    },
  }));
  localMessage = null;
}

function updateBooleanParam(key: keyof SurveyRegion["params"], value: boolean) {
  onUpdateRegion(region.id, (current) => ({
    ...current,
    params: {
      ...current.params,
      [key]: value,
    },
  }));
  localMessage = null;
}

function updateStringParam(key: keyof SurveyRegion["params"], value: string) {
  onUpdateRegion(region.id, (current) => ({
    ...current,
    params: {
      ...current.params,
      [key]: value,
    },
  }));
  localMessage = null;
}

function handleSelectCamera(camera: CatalogCamera) {
  onUpdateRegion(region.id, (current) => ({
    ...current,
    cameraId: camera.canonicalName,
    camera: { ...camera },
  }));
  localMessage = null;
}

async function handleGenerate() {
  localMessage = null;
  await onGenerateRegion(region.id);
}

function handleDelete() {
  localMessage = null;
  onDeleteRegion(region.id);
}

function handlePromptDissolve() {
  localMessage = null;
  onPromptDissolveRegion(region.id);
}

async function handleConfirmPrompt() {
  localMessage = null;
  await onConfirmSurveyPrompt();
}

function generatedItemSummary(item: MissionItem): string {
  const position = commandPosition(item.command);
  if (!position) {
    return "No coordinate payload";
  }

  const coords = geoPoint3dLatLon(position);
  const altitude = geoPoint3dAltitude(position);
  return `${coords.latitude_deg.toFixed(5)}, ${coords.longitude_deg.toFixed(5)} · ${altitude.value.toFixed(1)} m`;
}

function updateGeneratedItemCoordinate(kind: "latitude" | "longitude" | "altitude", raw: string) {
  const parsed = parseFiniteNumber(raw);
  if (parsed === null || !activeGeneratedEntry || !activeGeneratedPosition || !activeGeneratedLatLon) {
    localMessage = {
      tone: "warning",
      text: "Ignored the invalid generated-item edit. Enter a finite number to preserve truthful subordinate manual edits.",
    };
    return;
  }

  const position = commandPosition(activeGeneratedEntry.item.command);
  if (!position) {
    return;
  }

  const nextPosition = kind === "altitude"
    ? withGeoPoint3dAltitude(position, parsed)
    : withGeoPoint3dPosition(
      position,
      kind === "latitude" ? parsed : activeGeneratedLatLon.latitude_deg,
      kind === "longitude" ? parsed : activeGeneratedLatLon.longitude_deg,
    );

  onMarkGeneratedItemEdited(
    region.id,
    activeGeneratedEntry.index,
    {
      ...activeGeneratedEntry.item,
      command: withCommandField(activeGeneratedEntry.item.command, "position", nextPosition),
    },
  );
  localMessage = null;
}

function resetGeneratedItemEdit(index: number) {
  onUpdateRegion(region.id, (current) => {
    const nextManualEdits = new Map(current.manualEdits);
    nextManualEdits.delete(index);
    return {
      ...current,
      manualEdits: nextManualEdits,
    };
  });
  localMessage = null;
}

function localMessageClass(tone: LocalMessageTone): string {
  return tone === "warning"
    ? "border-warning/40 bg-warning/10 text-warning"
    : "border-accent/30 bg-accent/10 text-text-primary";
}
</script>

<section class="mt-4 space-y-4" data-testid={missionWorkspaceTestIds.inspectorSurvey}>
  <div class="rounded-lg border border-border bg-bg-secondary/60 p-3">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">Survey region</p>
        <h4 class="mt-1 text-base font-semibold text-text-primary">
          {titleCase(region.patternType)} region · {geometryPoints.length} {region.patternType === "corridor" ? "centerline points" : "vertices"}
        </h4>
      </div>

      <div class="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide">
        <span class="rounded-full border border-border bg-bg-primary px-3 py-1 text-text-secondary">
          {region.generatedItems.length} generated item{region.generatedItems.length === 1 ? "" : "s"}
        </span>
        <span class={`rounded-full border px-3 py-1 ${region.generationState === "generating"
          ? "border-accent/30 bg-accent/10 text-accent"
          : blockedReason || region.generationMessage
            ? "border-warning/40 bg-warning/10 text-warning"
            : "border-success/30 bg-success/10 text-success"}`}>
          {region.generationState === "generating"
            ? "generating"
            : blockedReason || region.generationMessage
              ? "attention"
              : "ready"}
        </span>
      </div>
    </div>

    {#if regionWarnings.length > 0}
      <ul class="mt-3 list-inside list-disc space-y-1 text-xs text-warning">
        {#each regionWarnings as warning (warning)}
          <li>{warning}</li>
        {/each}
      </ul>
    {/if}
  </div>

  {#if promptForRegion}
    <section
      class="rounded-lg border border-warning/40 bg-warning/10 px-4 py-4 text-sm text-warning"
      data-testid={missionWorkspaceTestIds.surveyPrompt}
    >
      <p class="text-xs font-semibold uppercase tracking-wide text-warning/80" data-testid={missionWorkspaceTestIds.surveyPromptKind}>
        {promptForRegion.kind}
      </p>
      <p class="mt-2 text-text-primary">{promptForRegion.message}</p>
      <div class="mt-3 flex flex-wrap gap-2">
        <button
          class="rounded-md border border-warning/40 bg-bg-primary px-4 py-2 text-sm font-semibold text-warning transition hover:brightness-105"
          data-testid={missionWorkspaceTestIds.surveyPromptConfirm}
          onclick={handleConfirmPrompt}
          type="button"
        >
          Confirm
        </button>
        <button
          class="rounded-md border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent"
          data-testid={missionWorkspaceTestIds.surveyPromptDismiss}
          onclick={onDismissSurveyPrompt}
          type="button"
        >
          Keep current region
        </button>
      </div>
    </section>
  {/if}

  {#if localMessage}
    <div class={`rounded-lg border px-4 py-3 text-sm ${localMessageClass(localMessage.tone)}`}>
      {localMessage.text}
    </div>
  {/if}

  <div class="grid gap-4 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
    <div class="space-y-4">
      <MissionSurveyCameraPicker {region} onSelectCamera={handleSelectCamera} />

      <section class="rounded-lg border border-border bg-bg-primary p-3">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">Geometry</p>
            <h5 class="mt-1 text-sm font-semibold text-text-primary">{geometryLabel}</h5>
          </div>

          <button
            class="rounded-md border border-border bg-bg-secondary px-3 py-2 text-xs font-semibold text-text-primary transition hover:border-accent hover:text-accent"
            data-testid={missionWorkspaceTestIds.surveyPointAddInitial}
            onclick={addInitialGeometryPoint}
            type="button"
          >
            Add point
          </button>
        </div>

        {#if geometryPoints.length === 0}
          <div class="mt-4 rounded-lg border border-dashed border-border bg-bg-secondary/60 px-4 py-4 text-sm text-text-secondary">
            This {region.patternType} region has no editable geometry yet. Add points here now or use the planner map draw controls to author the region directly on the shared workspace surface.
          </div>
        {:else}
          <div class="mt-4 space-y-3">
            {#each geometryPoints as point, index (`${region.id}-point-${index}`)}
              <div class="rounded-lg border border-border/70 bg-bg-secondary/60 p-3">
                <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                  <label class="space-y-1">
                    <span class="text-xs font-medium text-text-muted">Latitude</span>
                    <input
                       class="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary"
                      data-testid={`${missionWorkspaceTestIds.surveyPointPrefix}-${index}-latitude`}
                      inputmode="decimal"
                      onchange={(event) => updateGeometryPoint(index, "latitude_deg", (event.currentTarget as HTMLInputElement).value)}
                      type="number"
                      value={point.latitude_deg}
                    />
                  </label>
                  <label class="space-y-1">
                    <span class="text-xs font-medium text-text-muted">Longitude</span>
                    <input
                       class="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary"
                      data-testid={`${missionWorkspaceTestIds.surveyPointPrefix}-${index}-longitude`}
                      inputmode="decimal"
                      onchange={(event) => updateGeometryPoint(index, "longitude_deg", (event.currentTarget as HTMLInputElement).value)}
                      type="number"
                      value={point.longitude_deg}
                    />
                  </label>
                  <div class="flex flex-wrap items-end gap-2">
                    <button
                      class="rounded-md border border-border bg-bg-primary px-3 py-2 text-xs font-semibold text-text-primary transition hover:border-accent hover:text-accent"
                      data-testid={`${missionWorkspaceTestIds.surveyPointAddPrefix}-${index}`}
                      onclick={() => addGeometryPoint(index)}
                      type="button"
                    >
                      Add after
                    </button>
                    <button
                      class="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs font-semibold text-danger transition hover:brightness-105"
                      data-testid={`${missionWorkspaceTestIds.surveyPointDeletePrefix}-${index}`}
                      onclick={() => removeGeometryPoint(index)}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </section>
    </div>

    <div class="space-y-4">
      <section class="rounded-lg border border-border bg-bg-primary p-3">
        <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">Parameters</p>
        <div class="mt-4 grid gap-3 md:grid-cols-2">
          <label class="space-y-1">
            <span class="text-xs font-medium text-text-muted">Altitude (m)</span>
            <input class="w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary" data-testid={`${missionWorkspaceTestIds.surveyParamPrefix}-altitude_m`} inputmode="decimal" onchange={(event) => updateNumericParam("altitude_m", (event.currentTarget as HTMLInputElement).value)} type="number" value={region.params.altitude_m} />
          </label>
          <label class="space-y-1">
            <span class="text-xs font-medium text-text-muted">Orientation</span>
            <select class="w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary" data-testid={`${missionWorkspaceTestIds.surveyParamPrefix}-orientation`} onchange={(event) => updateStringParam("orientation", (event.currentTarget as HTMLSelectElement).value)} value={region.params.orientation}>
              <option value="landscape">Landscape</option>
              <option value="portrait">Portrait</option>
            </select>
          </label>
          <label class="space-y-1">
            <span class="text-xs font-medium text-text-muted">Side overlap (%)</span>
            <input class="w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary" data-testid={`${missionWorkspaceTestIds.surveyParamPrefix}-sideOverlap_pct`} inputmode="decimal" onchange={(event) => updateNumericParam("sideOverlap_pct", (event.currentTarget as HTMLInputElement).value)} type="number" value={region.params.sideOverlap_pct} />
          </label>
          <label class="space-y-1">
            <span class="text-xs font-medium text-text-muted">Front overlap (%)</span>
            <input class="w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary" data-testid={`${missionWorkspaceTestIds.surveyParamPrefix}-frontOverlap_pct`} inputmode="decimal" onchange={(event) => updateNumericParam("frontOverlap_pct", (event.currentTarget as HTMLInputElement).value)} type="number" value={region.params.frontOverlap_pct} />
          </label>
          <label class="space-y-1">
            <span class="text-xs font-medium text-text-muted">Capture mode</span>
            <select class="w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary" data-testid={`${missionWorkspaceTestIds.surveyParamPrefix}-captureMode`} onchange={(event) => updateStringParam("captureMode", (event.currentTarget as HTMLSelectElement).value)} value={region.params.captureMode}>
              <option value="distance">Distance</option>
              <option value="hover">Hover</option>
            </select>
          </label>
          <label class="flex items-center gap-2 rounded-lg border border-border bg-bg-secondary/60 px-3 py-2 text-sm text-text-primary md:mt-6">
            <input checked={region.params.terrainFollow} data-testid={`${missionWorkspaceTestIds.surveyParamPrefix}-terrainFollow`} onchange={(event) => updateBooleanParam("terrainFollow", (event.currentTarget as HTMLInputElement).checked)} type="checkbox" />
            Terrain follow
          </label>

          {#if region.patternType === "grid"}
            <label class="space-y-1">
              <span class="text-xs font-medium text-text-muted">Track angle (deg)</span>
              <input class="w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary" data-testid={`${missionWorkspaceTestIds.surveyParamPrefix}-trackAngle_deg`} inputmode="decimal" onchange={(event) => updateNumericParam("trackAngle_deg", (event.currentTarget as HTMLInputElement).value)} type="number" value={region.params.trackAngle_deg} />
            </label>
            <label class="space-y-1">
              <span class="text-xs font-medium text-text-muted">Start corner</span>
              <select class="w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary" data-testid={`${missionWorkspaceTestIds.surveyParamPrefix}-startCorner`} onchange={(event) => updateStringParam("startCorner", (event.currentTarget as HTMLSelectElement).value)} value={region.params.startCorner}>
                <option value="bottom_left">Bottom left</option>
                <option value="bottom_right">Bottom right</option>
                <option value="top_left">Top left</option>
                <option value="top_right">Top right</option>
              </select>
            </label>
            <label class="space-y-1">
              <span class="text-xs font-medium text-text-muted">Turn direction</span>
              <select class="w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary" data-testid={`${missionWorkspaceTestIds.surveyParamPrefix}-turnDirection`} onchange={(event) => updateStringParam("turnDirection", (event.currentTarget as HTMLSelectElement).value)} value={region.params.turnDirection}>
                <option value="clockwise">Clockwise</option>
                <option value="counter_clockwise">Counter clockwise</option>
              </select>
            </label>
            <label class="space-y-1">
              <span class="text-xs font-medium text-text-muted">Turnaround distance (m)</span>
              <input class="w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary" data-testid={`${missionWorkspaceTestIds.surveyParamPrefix}-turnaroundDistance_m`} inputmode="decimal" onchange={(event) => updateNumericParam("turnaroundDistance_m", (event.currentTarget as HTMLInputElement).value)} type="number" value={region.params.turnaroundDistance_m} />
            </label>
            <label class="flex items-center gap-2 rounded-lg border border-border bg-bg-secondary/60 px-3 py-2 text-sm text-text-primary md:mt-6">
              <input checked={region.params.crosshatch} data-testid={`${missionWorkspaceTestIds.surveyParamPrefix}-crosshatch`} onchange={(event) => updateBooleanParam("crosshatch", (event.currentTarget as HTMLInputElement).checked)} type="checkbox" />
              Crosshatch
            </label>
          {:else if region.patternType === "corridor"}
            <label class="space-y-1">
              <span class="text-xs font-medium text-text-muted">Left width (m)</span>
              <input class="w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary" data-testid={`${missionWorkspaceTestIds.surveyParamPrefix}-leftWidth_m`} inputmode="decimal" onchange={(event) => updateNumericParam("leftWidth_m", (event.currentTarget as HTMLInputElement).value)} type="number" value={region.params.leftWidth_m} />
            </label>
            <label class="space-y-1">
              <span class="text-xs font-medium text-text-muted">Right width (m)</span>
              <input class="w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary" data-testid={`${missionWorkspaceTestIds.surveyParamPrefix}-rightWidth_m`} inputmode="decimal" onchange={(event) => updateNumericParam("rightWidth_m", (event.currentTarget as HTMLInputElement).value)} type="number" value={region.params.rightWidth_m} />
            </label>
            <label class="space-y-1">
              <span class="text-xs font-medium text-text-muted">Turnaround distance (m)</span>
              <input class="w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary" data-testid={`${missionWorkspaceTestIds.surveyParamPrefix}-turnaroundDistance_m`} inputmode="decimal" onchange={(event) => updateNumericParam("turnaroundDistance_m", (event.currentTarget as HTMLInputElement).value)} type="number" value={region.params.turnaroundDistance_m} />
            </label>
          {:else}
            <label class="space-y-1">
              <span class="text-xs font-medium text-text-muted">Structure height (m)</span>
              <input class="w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary" data-testid={`${missionWorkspaceTestIds.surveyParamPrefix}-structureHeight_m`} inputmode="decimal" onchange={(event) => updateNumericParam("structureHeight_m", (event.currentTarget as HTMLInputElement).value)} type="number" value={region.params.structureHeight_m} />
            </label>
            <label class="space-y-1">
              <span class="text-xs font-medium text-text-muted">Scan distance (m)</span>
              <input class="w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary" data-testid={`${missionWorkspaceTestIds.surveyParamPrefix}-scanDistance_m`} inputmode="decimal" onchange={(event) => updateNumericParam("scanDistance_m", (event.currentTarget as HTMLInputElement).value)} type="number" value={region.params.scanDistance_m} />
            </label>
            <label class="space-y-1">
              <span class="text-xs font-medium text-text-muted">Layer count</span>
              <input class="w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary" data-testid={`${missionWorkspaceTestIds.surveyParamPrefix}-layerCount`} inputmode="numeric" onchange={(event) => updateNumericParam("layerCount", (event.currentTarget as HTMLInputElement).value)} type="number" value={region.params.layerCount} />
            </label>
            <label class="space-y-1">
              <span class="text-xs font-medium text-text-muted">Layer order</span>
              <select class="w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary" data-testid={`${missionWorkspaceTestIds.surveyParamPrefix}-layerOrder`} onchange={(event) => updateStringParam("layerOrder", (event.currentTarget as HTMLSelectElement).value)} value={region.params.layerOrder}>
                <option value="bottom_to_top">Bottom to top</option>
                <option value="top_to_bottom">Top to bottom</option>
              </select>
            </label>
          {/if}
        </div>
      </section>

      <section class="rounded-lg border border-border bg-bg-primary p-3">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">Generated review</p>
            <h5 class="mt-1 text-sm font-semibold text-text-primary">Nested generated items stay subordinate here</h5>
          </div>

          <div class="flex flex-wrap gap-2">
            <button
              class="rounded-md border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
              data-testid={missionWorkspaceTestIds.surveyGenerate}
              disabled={generateDisabled}
              onclick={handleGenerate}
              type="button"
            >
              {region.generationState === "generating" ? "Generating…" : generateButtonLabel}
            </button>
            <button
              class="rounded-md border border-warning/40 bg-warning/10 px-4 py-2 text-sm font-semibold text-warning transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
              data-testid={missionWorkspaceTestIds.surveyDissolve}
              disabled={region.generationState === "generating"}
              onclick={handlePromptDissolve}
              type="button"
            >
              Dissolve to manual items
            </button>
            <button
              class="rounded-md border border-danger/40 bg-danger/10 px-4 py-2 text-sm font-semibold text-danger transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
              data-testid={missionWorkspaceTestIds.surveyDelete}
              disabled={region.generationState === "generating"}
              onclick={handleDelete}
              type="button"
            >
              Delete region
            </button>
          </div>
        </div>

        {#if formattedStats}
          <div class="mt-4 grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-3">
            <div class="rounded-lg border border-border/70 bg-bg-secondary px-3 py-2"><dt class="text-text-muted">GSD</dt><dd class="mt-1 font-medium text-text-primary">{formattedStats.gsd}</dd></div>
            <div class="rounded-lg border border-border/70 bg-bg-secondary px-3 py-2"><dt class="text-text-muted">Photos</dt><dd class="mt-1 font-medium text-text-primary">{formattedStats.photoCount}</dd></div>
            <div class="rounded-lg border border-border/70 bg-bg-secondary px-3 py-2"><dt class="text-text-muted">Flight time</dt><dd class="mt-1 font-medium text-text-primary">{formattedStats.flightTime}</dd></div>
            <div class="rounded-lg border border-border/70 bg-bg-secondary px-3 py-2"><dt class="text-text-muted">Trigger distance</dt><dd class="mt-1 font-medium text-text-primary">{formattedStats.triggerDistance}</dd></div>
            {#if region.patternType === "structure"}
              <div class="rounded-lg border border-border/70 bg-bg-secondary px-3 py-2"><dt class="text-text-muted">Layers</dt><dd class="mt-1 font-medium text-text-primary">{formattedStats.layerCount ?? "—"}</dd></div>
              <div class="rounded-lg border border-border/70 bg-bg-secondary px-3 py-2"><dt class="text-text-muted">Photos per layer</dt><dd class="mt-1 font-medium text-text-primary">{formattedStats.photosPerLayer ?? "—"}</dd></div>
            {:else}
              <div class="rounded-lg border border-border/70 bg-bg-secondary px-3 py-2"><dt class="text-text-muted">Lane spacing</dt><dd class="mt-1 font-medium text-text-primary">{formattedStats.laneSpacing}</dd></div>
              <div class="rounded-lg border border-border/70 bg-bg-secondary px-3 py-2"><dt class="text-text-muted">Lane count</dt><dd class="mt-1 font-medium text-text-primary">{formattedStats.laneCount}</dd></div>
            {/if}
          </div>
        {/if}

        {#if generatedEntries.length === 0}
          <div class="mt-4 rounded-lg border border-dashed border-border bg-bg-secondary/60 px-4 py-4 text-sm text-text-secondary">
            Generated mission items will appear here after a successful generate. Existing geometry and parameter changes stay local until you explicitly regenerate.
          </div>
        {:else}
          <div class="mt-4 grid gap-3 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div class="space-y-2">
              {#each generatedEntries as entry (`${region.id}-generated-${entry.index}`)}
                <button
                  class={`w-full rounded-lg border px-3 py-3 text-left transition ${activeGeneratedEntry?.index === entry.index
                    ? "border-accent/40 bg-accent/10 text-text-primary"
                    : "border-border bg-bg-secondary/60 text-text-primary hover:border-accent/40"}`}
                  data-testid={`${missionWorkspaceTestIds.surveyGeneratedItemPrefix}-${entry.index}`}
                  onclick={() => {
                    selectedGeneratedIndex = entry.index;
                    localMessage = null;
                  }}
                  type="button"
                >
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <span class="text-xs font-semibold uppercase tracking-wide text-text-muted">Item {entry.index + 1}</span>
                    {#if entry.edited}
                      <span class="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-warning" data-testid={`${missionWorkspaceTestIds.surveyGeneratedEditedPrefix}-${entry.index}`}>
                        Manual edit
                      </span>
                    {/if}
                  </div>
                  <h6 class="mt-1 text-sm font-semibold text-text-primary">{commandDisplayName(entry.item.command)}</h6>
                  <p class="mt-1 text-xs text-text-secondary">{entry.summary}</p>
                </button>
              {/each}
            </div>

            {#if activeGeneratedEntry}
              <div class="rounded-lg border border-border/70 bg-bg-secondary/60 p-4">
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">Selected generated item</p>
                    <h6 class="mt-1 text-sm font-semibold text-text-primary">{commandDisplayName(activeGeneratedEntry.item.command)}</h6>
                  </div>

                  {#if activeGeneratedEntry.edited}
                    <button
                      class="rounded-md border border-border bg-bg-primary px-3 py-2 text-xs font-semibold text-text-primary transition hover:border-accent hover:text-accent"
                      data-testid={missionWorkspaceTestIds.surveyGeneratedReset}
                      onclick={() => resetGeneratedItemEdit(activeGeneratedEntry.index)}
                      type="button"
                    >
                      Reset manual edit
                    </button>
                  {/if}
                </div>

                {#if activeGeneratedLatLon && activeGeneratedAltitude !== null}
                  <div class="mt-4 grid gap-3 md:grid-cols-3">
                    <label class="space-y-1">
                      <span class="text-xs font-medium text-text-muted">Latitude</span>
                      <input class="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary" data-testid={missionWorkspaceTestIds.surveyGeneratedLatitude} inputmode="decimal" onchange={(event) => updateGeneratedItemCoordinate("latitude", (event.currentTarget as HTMLInputElement).value)} type="number" value={activeGeneratedLatLon.latitude_deg} />
                    </label>
                    <label class="space-y-1">
                      <span class="text-xs font-medium text-text-muted">Longitude</span>
                      <input class="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary" data-testid={missionWorkspaceTestIds.surveyGeneratedLongitude} inputmode="decimal" onchange={(event) => updateGeneratedItemCoordinate("longitude", (event.currentTarget as HTMLInputElement).value)} type="number" value={activeGeneratedLatLon.longitude_deg} />
                    </label>
                    <label class="space-y-1">
                      <span class="text-xs font-medium text-text-muted">Altitude</span>
                      <input class="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary" data-testid={missionWorkspaceTestIds.surveyGeneratedAltitude} inputmode="decimal" onchange={(event) => updateGeneratedItemCoordinate("altitude", (event.currentTarget as HTMLInputElement).value)} type="number" value={activeGeneratedAltitude} />
                    </label>
                  </div>
                {:else}
                  <div class="mt-4 rounded-lg border border-dashed border-border bg-bg-primary px-4 py-4 text-sm text-text-secondary">
                    This generated command does not expose a position payload, so it remains visible here without pretending to be a draggable top-level mission row.
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {/if}
      </section>
    </div>
  </div>
</section>
