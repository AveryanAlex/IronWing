<script lang="ts">
import { localXYToLatLon } from "../../../lib/mission-coordinates";
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
} from "../../../lib/mavkit-types";
import {
  estimateSurveyFlightTime,
  formatSurveyStats,
  type FormattedSurveyStats,
} from "../../../lib/survey-preview";
import {
  resolveSurveyGenerationBlockedReason,
} from "../../../lib/mission-survey-authoring";
import type { MissionPlannerSurveyPromptView } from "../../../lib/stores/mission-planner-view";
import type { CatalogCamera } from "../../../lib/survey-camera-catalog";
import type { SurveyRegion } from "../../../lib/survey-region";
import MissionSurveyCameraPicker from "./MissionSurveyCameraPicker.svelte";
import { ActionRow, Alert, Badge, Button, Card, EmptyState, Eyebrow, FactTile, Field, HelperText, NativeSelect, NumberInput, SelectableCard, Switch } from "../../../components/ui";
import { missionWorkspaceTestIds } from "../mission-workspace-test-ids";

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

function coordinateInputValue(value: number): number {
  return Number(value.toFixed(7));
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

</script>

<section class="mt-4 space-y-4" data-testid={missionWorkspaceTestIds.inspectorSurvey}>
  <Card.Root density="compact" surface="muted">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <Eyebrow>Survey region</Eyebrow>
        <h4 class="mt-1 text-base font-semibold text-text-primary">
          {titleCase(region.patternType)} region · {geometryPoints.length} {region.patternType === "corridor" ? "centerline points" : "vertices"}
        </h4>
      </div>

      <div class="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide">
        <Badge variant="muted" surface="primary">
          {region.generatedItems.length} generated item{region.generatedItems.length === 1 ? "" : "s"}
        </Badge>
        <Badge variant={region.generationState === "generating" ? "accent" : blockedReason || region.generationMessage ? "warning" : "success"}>
          {region.generationState === "generating"
            ? "generating"
            : blockedReason || region.generationMessage
              ? "attention"
              : "ready"}
        </Badge>
      </div>
    </div>

    {#if regionWarnings.length > 0}
      <ul class="mt-3 list-inside list-disc space-y-1 text-xs text-warning">
        {#each regionWarnings as warning (warning)}
          <li>{warning}</li>
        {/each}
      </ul>
    {/if}
  </Card.Root>

  {#if promptForRegion}
    <Alert density="default" layout="stacked" variant="warning" testId={missionWorkspaceTestIds.surveyPrompt}>
      <Eyebrow tone="warning" testId={missionWorkspaceTestIds.surveyPromptKind}>
        {promptForRegion.kind}
      </Eyebrow>
      <p class="mt-2 text-sm text-text-primary">{promptForRegion.message}</p>
      <ActionRow align="start" class="mt-3">
        <Button
          testId={missionWorkspaceTestIds.surveyPromptConfirm}
          onclick={handleConfirmPrompt}
          tone="warning"
          variant="soft"
        >
          Confirm
        </Button>
        <Button
          testId={missionWorkspaceTestIds.surveyPromptDismiss}
          onclick={onDismissSurveyPrompt}
          variant="secondary"
        >
          Keep current region
        </Button>
      </ActionRow>
    </Alert>
  {/if}

  {#if localMessage}
    <Alert density="compact" description={localMessage.text} variant={localMessage.tone === "warning" ? "warning" : "info"} />
  {/if}

  <div class="grid min-w-0 gap-4">
    <div class="min-w-0 space-y-4">
      <MissionSurveyCameraPicker {region} onSelectCamera={handleSelectCamera} />

      <Card.Root as="section" density="compact">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Eyebrow>Geometry</Eyebrow>
            <h5 class="mt-1 text-sm font-semibold text-text-primary">{geometryLabel}</h5>
          </div>

          <Button
            size="sm"
            testId={missionWorkspaceTestIds.surveyPointAddInitial}
            onclick={addInitialGeometryPoint}
            variant="secondary"
          >
            Add point
          </Button>
        </div>

        {#if geometryPoints.length === 0}
          <EmptyState
            class="mt-4"
            description="Add points here now or use the planner map draw controls to author the region directly on the shared workspace surface."
            title={`This ${region.patternType} region has no editable geometry yet.`}
          />
        {:else}
          <div class="mt-4 space-y-3">
            {#each geometryPoints as point, index (`${region.id}-point-${index}`)}
              <Card.Root density="compact" surface="muted-soft">
                <div class="grid min-w-0 gap-3">
                  <Field.Root>
                    <Field.Label class="text-xs font-medium text-text-muted">Latitude</Field.Label>
                    <NumberInput
                      testId={`${missionWorkspaceTestIds.surveyPointPrefix}-${index}-latitude`}
                      inputmode="decimal"
                      onchange={(event) => updateGeometryPoint(index, "latitude_deg", (event.currentTarget as HTMLInputElement).value)}
                      value={coordinateInputValue(point.latitude_deg)}
                    />
                  </Field.Root>
                  <Field.Root>
                    <Field.Label class="text-xs font-medium text-text-muted">Longitude</Field.Label>
                    <NumberInput
                      testId={`${missionWorkspaceTestIds.surveyPointPrefix}-${index}-longitude`}
                      inputmode="decimal"
                      onchange={(event) => updateGeometryPoint(index, "longitude_deg", (event.currentTarget as HTMLInputElement).value)}
                      value={coordinateInputValue(point.longitude_deg)}
                    />
                  </Field.Root>
                  <div class="flex flex-wrap items-end gap-2">
                    <Button
                      size="sm"
                      testId={`${missionWorkspaceTestIds.surveyPointAddPrefix}-${index}`}
                      onclick={() => addGeometryPoint(index)}
                      variant="outline"
                    >
                      Add after
                    </Button>
                    <Button
                      size="sm"
                      testId={`${missionWorkspaceTestIds.surveyPointDeletePrefix}-${index}`}
                      onclick={() => removeGeometryPoint(index)}
                      tone="danger"
                      variant="soft"
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              </Card.Root>
            {/each}
          </div>
        {/if}
      </Card.Root>
    </div>

    <div class="min-w-0 space-y-4">
      <Card.Root as="section" density="compact">
        <Eyebrow>Parameters</Eyebrow>
        <div class="mt-4 grid min-w-0 gap-3">
          <Field.Root><Field.Label class="text-xs font-medium text-text-muted">Altitude (m)</Field.Label><NumberInput testId={`${missionWorkspaceTestIds.surveyParamPrefix}-altitude_m`} inputmode="decimal" onchange={(event) => updateNumericParam("altitude_m", (event.currentTarget as HTMLInputElement).value)} value={region.params.altitude_m} /></Field.Root>
          <Field.Root><Field.Label class="text-xs font-medium text-text-muted">Orientation</Field.Label><NativeSelect testId={`${missionWorkspaceTestIds.surveyParamPrefix}-orientation`} onchange={(event) => updateStringParam("orientation", (event.currentTarget as HTMLSelectElement).value)} options={[{ value: "landscape", label: "Landscape" }, { value: "portrait", label: "Portrait" }]} value={region.params.orientation} /></Field.Root>
          <Field.Root><Field.Label class="text-xs font-medium text-text-muted">Side overlap (%)</Field.Label><NumberInput testId={`${missionWorkspaceTestIds.surveyParamPrefix}-sideOverlap_pct`} inputmode="decimal" onchange={(event) => updateNumericParam("sideOverlap_pct", (event.currentTarget as HTMLInputElement).value)} value={region.params.sideOverlap_pct} /></Field.Root>
          <Field.Root><Field.Label class="text-xs font-medium text-text-muted">Front overlap (%)</Field.Label><NumberInput testId={`${missionWorkspaceTestIds.surveyParamPrefix}-frontOverlap_pct`} inputmode="decimal" onchange={(event) => updateNumericParam("frontOverlap_pct", (event.currentTarget as HTMLInputElement).value)} value={region.params.frontOverlap_pct} /></Field.Root>
          <Field.Root><Field.Label class="text-xs font-medium text-text-muted">Capture mode</Field.Label><NativeSelect testId={`${missionWorkspaceTestIds.surveyParamPrefix}-captureMode`} onchange={(event) => updateStringParam("captureMode", (event.currentTarget as HTMLSelectElement).value)} options={[{ value: "distance", label: "Distance" }, { value: "hover", label: "Hover" }]} value={region.params.captureMode} /></Field.Root>
          <Card.Root density="compact" justify="center" surface="muted">
            <Switch checked={region.params.terrainFollow} label="Terrain follow" onCheckedChange={(checked) => updateBooleanParam("terrainFollow", checked)} testId={`${missionWorkspaceTestIds.surveyParamPrefix}-terrainFollow`} />
          </Card.Root>

          {#if region.patternType === "grid"}
            <Field.Root><Field.Label class="text-xs font-medium text-text-muted">Track angle (deg)</Field.Label><NumberInput testId={`${missionWorkspaceTestIds.surveyParamPrefix}-trackAngle_deg`} inputmode="decimal" onchange={(event) => updateNumericParam("trackAngle_deg", (event.currentTarget as HTMLInputElement).value)} value={region.params.trackAngle_deg} /></Field.Root>
            <Field.Root><Field.Label class="text-xs font-medium text-text-muted">Start corner</Field.Label><NativeSelect testId={`${missionWorkspaceTestIds.surveyParamPrefix}-startCorner`} onchange={(event) => updateStringParam("startCorner", (event.currentTarget as HTMLSelectElement).value)} options={[{ value: "bottom_left", label: "Bottom left" }, { value: "bottom_right", label: "Bottom right" }, { value: "top_left", label: "Top left" }, { value: "top_right", label: "Top right" }]} value={region.params.startCorner} /></Field.Root>
            <Field.Root><Field.Label class="text-xs font-medium text-text-muted">Turn direction</Field.Label><NativeSelect testId={`${missionWorkspaceTestIds.surveyParamPrefix}-turnDirection`} onchange={(event) => updateStringParam("turnDirection", (event.currentTarget as HTMLSelectElement).value)} options={[{ value: "clockwise", label: "Clockwise" }, { value: "counter_clockwise", label: "Counter clockwise" }]} value={region.params.turnDirection} /></Field.Root>
            <Field.Root><Field.Label class="text-xs font-medium text-text-muted">Turnaround distance (m)</Field.Label><NumberInput testId={`${missionWorkspaceTestIds.surveyParamPrefix}-turnaroundDistance_m`} inputmode="decimal" onchange={(event) => updateNumericParam("turnaroundDistance_m", (event.currentTarget as HTMLInputElement).value)} value={region.params.turnaroundDistance_m} /></Field.Root>
            <Card.Root density="compact" justify="center" surface="muted"><Switch checked={region.params.crosshatch} label="Crosshatch" onCheckedChange={(checked) => updateBooleanParam("crosshatch", checked)} testId={`${missionWorkspaceTestIds.surveyParamPrefix}-crosshatch`} /></Card.Root>
          {:else if region.patternType === "corridor"}
            <Field.Root><Field.Label class="text-xs font-medium text-text-muted">Left width (m)</Field.Label><NumberInput testId={`${missionWorkspaceTestIds.surveyParamPrefix}-leftWidth_m`} inputmode="decimal" onchange={(event) => updateNumericParam("leftWidth_m", (event.currentTarget as HTMLInputElement).value)} value={region.params.leftWidth_m} /></Field.Root>
            <Field.Root><Field.Label class="text-xs font-medium text-text-muted">Right width (m)</Field.Label><NumberInput testId={`${missionWorkspaceTestIds.surveyParamPrefix}-rightWidth_m`} inputmode="decimal" onchange={(event) => updateNumericParam("rightWidth_m", (event.currentTarget as HTMLInputElement).value)} value={region.params.rightWidth_m} /></Field.Root>
            <Field.Root><Field.Label class="text-xs font-medium text-text-muted">Turnaround distance (m)</Field.Label><NumberInput testId={`${missionWorkspaceTestIds.surveyParamPrefix}-turnaroundDistance_m`} inputmode="decimal" onchange={(event) => updateNumericParam("turnaroundDistance_m", (event.currentTarget as HTMLInputElement).value)} value={region.params.turnaroundDistance_m} /></Field.Root>
          {:else}
            <Field.Root><Field.Label class="text-xs font-medium text-text-muted">Structure height (m)</Field.Label><NumberInput testId={`${missionWorkspaceTestIds.surveyParamPrefix}-structureHeight_m`} inputmode="decimal" onchange={(event) => updateNumericParam("structureHeight_m", (event.currentTarget as HTMLInputElement).value)} value={region.params.structureHeight_m} /></Field.Root>
            <Field.Root><Field.Label class="text-xs font-medium text-text-muted">Scan distance (m)</Field.Label><NumberInput testId={`${missionWorkspaceTestIds.surveyParamPrefix}-scanDistance_m`} inputmode="decimal" onchange={(event) => updateNumericParam("scanDistance_m", (event.currentTarget as HTMLInputElement).value)} value={region.params.scanDistance_m} /></Field.Root>
            <Field.Root><Field.Label class="text-xs font-medium text-text-muted">Layer count</Field.Label><NumberInput testId={`${missionWorkspaceTestIds.surveyParamPrefix}-layerCount`} inputmode="numeric" onchange={(event) => updateNumericParam("layerCount", (event.currentTarget as HTMLInputElement).value)} value={region.params.layerCount} /></Field.Root>
            <Field.Root><Field.Label class="text-xs font-medium text-text-muted">Layer order</Field.Label><NativeSelect testId={`${missionWorkspaceTestIds.surveyParamPrefix}-layerOrder`} onchange={(event) => updateStringParam("layerOrder", (event.currentTarget as HTMLSelectElement).value)} options={[{ value: "bottom_to_top", label: "Bottom to top" }, { value: "top_to_bottom", label: "Top to bottom" }]} value={region.params.layerOrder} /></Field.Root>
          {/if}
        </div>
      </Card.Root>

      <Card.Root as="section" density="compact">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Eyebrow>Generated review</Eyebrow>
            <h5 class="mt-1 text-sm font-semibold text-text-primary">Nested generated items stay subordinate here</h5>
          </div>

          <ActionRow align="stretch" direction="column" class="min-w-0">
            <Button
              testId={missionWorkspaceTestIds.surveyGenerate}
              disabled={generateDisabled}
              onclick={handleGenerate}
              tone="accent"
              variant="soft"
            >
              {region.generationState === "generating" ? "Generating…" : generateButtonLabel}
            </Button>
            <Button
              testId={missionWorkspaceTestIds.surveyDissolve}
              disabled={region.generationState === "generating"}
              onclick={handlePromptDissolve}
              tone="warning"
              variant="soft"
            >
              Dissolve to manual items
            </Button>
            <Button
              testId={missionWorkspaceTestIds.surveyDelete}
              disabled={region.generationState === "generating"}
              onclick={handleDelete}
              tone="danger"
              variant="soft"
            >
              Delete region
            </Button>
          </ActionRow>
        </div>

        {#if formattedStats}
          <dl class="mt-4 grid min-w-0 gap-2 text-xs">
            <FactTile label="GSD" value={formattedStats.gsd} />
            <FactTile label="Photos" value={formattedStats.photoCount} />
            <FactTile label="Flight time" value={formattedStats.flightTime} />
            <FactTile label="Trigger distance" value={formattedStats.triggerDistance} />
            {#if region.patternType === "structure"}
              <FactTile label="Layers" unavailable={formattedStats.layerCount == null} value={formattedStats.layerCount ?? null} />
              <FactTile label="Photos per layer" unavailable={formattedStats.photosPerLayer == null} value={formattedStats.photosPerLayer ?? null} />
            {:else}
              <FactTile label="Lane spacing" value={formattedStats.laneSpacing} />
              <FactTile label="Lane count" value={formattedStats.laneCount} />
            {/if}
          </dl>
        {/if}

        {#if generatedEntries.length === 0}
          <EmptyState
            class="mt-4"
            description="Existing geometry and parameter changes stay local until you explicitly regenerate."
            title="Generated mission items will appear here after a successful generate."
          />
        {:else}
          <div class="mt-4 grid min-w-0 gap-3">
            <div class="min-w-0 space-y-2">
              {#each generatedEntries as entry (`${region.id}-generated-${entry.index}`)}
                <SelectableCard
                  class={activeGeneratedEntry?.index === entry.index ? "hover:border-accent/40" : "bg-bg-secondary/60 hover:border-accent/40"}
                  density="compact"
                  selected={activeGeneratedEntry?.index === entry.index}
                  testId={`${missionWorkspaceTestIds.surveyGeneratedItemPrefix}-${entry.index}`}
                  onSelect={() => {
                    selectedGeneratedIndex = entry.index;
                    localMessage = null;
                  }}
                >
                  <div class="flex min-w-0 flex-wrap items-center justify-between gap-2">
                    <Eyebrow as="span">Item {entry.index + 1}</Eyebrow>
                    {#if entry.edited}
                      <Badge variant="warning" testId={`${missionWorkspaceTestIds.surveyGeneratedEditedPrefix}-${entry.index}`}>
                        Manual edit
                      </Badge>
                    {/if}
                  </div>
                  <h6 class="mt-1 min-w-0 text-sm font-semibold text-text-primary">{commandDisplayName(entry.item.command)}</h6>
                  <HelperText class="mt-1" size="xs">{entry.summary}</HelperText>
                </SelectableCard>
              {/each}
            </div>

            {#if activeGeneratedEntry}
              <Card.Root surface="muted-soft">
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Eyebrow>Selected generated item</Eyebrow>
                    <h6 class="mt-1 text-sm font-semibold text-text-primary">{commandDisplayName(activeGeneratedEntry.item.command)}</h6>
                  </div>

                  {#if activeGeneratedEntry.edited}
                    <Button
                      size="sm"
                      testId={missionWorkspaceTestIds.surveyGeneratedReset}
                      onclick={() => resetGeneratedItemEdit(activeGeneratedEntry.index)}
                      variant="outline"
                    >
                      Reset manual edit
                    </Button>
                  {/if}
                </div>

                {#if activeGeneratedLatLon && activeGeneratedAltitude !== null}
                  <div class="mt-4 grid min-w-0 gap-3">
                    <Field.Root><Field.Label class="text-xs font-medium text-text-muted">Latitude</Field.Label><NumberInput testId={missionWorkspaceTestIds.surveyGeneratedLatitude} inputmode="decimal" onchange={(event) => updateGeneratedItemCoordinate("latitude", (event.currentTarget as HTMLInputElement).value)} value={coordinateInputValue(activeGeneratedLatLon.latitude_deg)} /></Field.Root>
                    <Field.Root><Field.Label class="text-xs font-medium text-text-muted">Longitude</Field.Label><NumberInput testId={missionWorkspaceTestIds.surveyGeneratedLongitude} inputmode="decimal" onchange={(event) => updateGeneratedItemCoordinate("longitude", (event.currentTarget as HTMLInputElement).value)} value={coordinateInputValue(activeGeneratedLatLon.longitude_deg)} /></Field.Root>
                    <Field.Root><Field.Label class="text-xs font-medium text-text-muted">Altitude</Field.Label><NumberInput testId={missionWorkspaceTestIds.surveyGeneratedAltitude} inputmode="decimal" onchange={(event) => updateGeneratedItemCoordinate("altitude", (event.currentTarget as HTMLInputElement).value)} value={activeGeneratedAltitude} /></Field.Root>
                  </div>
                {:else}
                  <EmptyState
                    class="mt-4 bg-bg-primary"
                    description="It remains visible here without pretending to be a draggable top-level mission row."
                    title="This generated command does not expose a position payload."
                  />
                {/if}
              </Card.Root>
            {/if}
          </div>
        {/if}
      </Card.Root>
    </div>
  </div>
</section>
