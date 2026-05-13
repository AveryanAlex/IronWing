<script lang="ts">
import { parseLatitude, parseLongitude } from "../../lib/mission-coordinates";
import type { TypedDraftItem } from "../../lib/mission-draft-typed";
import { geoPoint3dAltitude, geoPoint3dLatLon, type GeoPoint3d } from "../../lib/mavkit-types";
import type { MissionPlannerRallySelection } from "../../lib/stores/mission-planner";
import { missionWorkspaceTestIds } from "./mission-workspace-test-ids";

type Props = {
  selection: MissionPlannerRallySelection;
  item: TypedDraftItem | null;
  readOnly: boolean;
  onUpdateLatitude: (uiId: number, latitudeDeg: number) => void;
  onUpdateLongitude: (uiId: number, longitudeDeg: number) => void;
  onUpdateAltitude: (uiId: number, altitudeM: number) => void;
  onUpdateAltitudeFrame: (uiId: number, frame: "msl" | "rel_home" | "terrain" | string) => void;
};

let {
  selection,
  item,
  readOnly,
  onUpdateLatitude,
  onUpdateLongitude,
  onUpdateAltitude,
  onUpdateAltitudeFrame,
}: Props = $props();

let validationMessage = $state<string | null>(null);

let point = $derived(item ? item.document as GeoPoint3d : null);
let coords = $derived(point ? geoPoint3dLatLon(point) : null);
let altitude = $derived(point ? geoPoint3dAltitude(point) : null);
let selectionLabel = $derived(selection.kind === "point" ? "rally-point" : "none");

function altitudeFrameLabel(frame: "msl" | "rel_home" | "terrain"): string {
  switch (frame) {
    case "msl":
      return "MSL";
    case "terrain":
      return "Terrain";
    case "rel_home":
    default:
      return "Rel Home";
  }
}

function commitLatitude(rawValue: string) {
  if (!item) {
    return;
  }

  const parsed = parseLatitude(rawValue);
  if (!parsed.ok) {
    validationMessage = "Enter a valid latitude before committing this rally edit.";
    return;
  }

  validationMessage = null;
  onUpdateLatitude(item.uiId, parsed.value);
}

function commitLongitude(rawValue: string) {
  if (!item) {
    return;
  }

  const parsed = parseLongitude(rawValue);
  if (!parsed.ok) {
    validationMessage = "Enter a valid longitude before committing this rally edit.";
    return;
  }

  validationMessage = null;
  onUpdateLongitude(item.uiId, parsed.value);
}

function commitAltitude(rawValue: string) {
  if (!item) {
    return;
  }

  const nextValue = Number(rawValue);
  if (!Number.isFinite(nextValue)) {
    validationMessage = "Enter a finite altitude before committing this rally edit.";
    return;
  }

  validationMessage = null;
  onUpdateAltitude(item.uiId, nextValue);
}
</script>

<section class="rounded-lg border border-border bg-bg-primary p-3" data-testid={missionWorkspaceTestIds.rallyInspector}>
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div>
      <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">Rally inspector</p>
      <h3 class="mt-1 text-sm font-semibold text-text-primary">Selected rally detail</h3>
    </div>

    <span
      class="rounded-full border border-border bg-bg-secondary px-3 py-1 text-xs font-semibold uppercase tracking-wide text-text-secondary"
      data-testid={missionWorkspaceTestIds.rallyInspectorSelectionKind}
    >
      {selectionLabel}
    </span>
  </div>

  {#if selection.kind === "none"}
    <div class="mt-4 rounded-lg border border-dashed border-border bg-bg-secondary/60 px-4 py-5 text-sm text-text-secondary" data-testid={missionWorkspaceTestIds.rallyInspectorEmpty}>
      Select a rally point from the list or map to edit coordinates and altitude-frame truth here without leaking those controls into mission or fence mode.
    </div>
  {:else if !item || !point || !coords || !altitude}
    <div class="mt-4 rounded-lg border border-warning/40 bg-warning/10 px-4 py-5 text-sm text-warning">
      <p class="font-semibold">Rally selection unavailable</p>
      <p class="mt-2 text-xs text-warning/90">The selected rally point could not be resolved from the active planner state, so the inspector stayed fail-closed instead of rendering broken controls.</p>
    </div>
  {:else}
    <div class="mt-4 space-y-4">
      <div class="rounded-lg border border-border bg-bg-secondary/60 p-3">
        <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">Rally point {item.index + 1}</p>
        <h4 class="mt-1 text-base font-semibold text-text-primary">Emergency / diversion target</h4>
        <p class="mt-1 text-xs text-text-secondary">
          Edit latitude, longitude, altitude, and frame here. IronWing preserves MSL, Rel Home, and Terrain locally, but .plan export will warn when QGroundControl forces non-RelHome rally frames into a lossy relative-alt bucket.
        </p>
      </div>

      {#if readOnly}
        <div class="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
          Rally editing is read-only in the current planner attachment state. The point stays visible for truthful inspection, but edits stay blocked until you return to an editable scope.
        </div>
      {/if}

      <div class="grid gap-3 md:grid-cols-3">
        <label class="space-y-1 rounded-lg border border-border bg-bg-secondary/60 p-3">
          <span class="text-xs font-medium text-text-muted">Latitude</span>
          <input
            class="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary disabled:cursor-not-allowed disabled:opacity-70"
            data-testid={missionWorkspaceTestIds.rallyLatitude}
            disabled={readOnly}
            inputmode="decimal"
            onchange={(event) => commitLatitude((event.currentTarget as HTMLInputElement).value)}
            type="number"
            value={coords.latitude_deg}
          />
        </label>

        <label class="space-y-1 rounded-lg border border-border bg-bg-secondary/60 p-3">
          <span class="text-xs font-medium text-text-muted">Longitude</span>
          <input
            class="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary disabled:cursor-not-allowed disabled:opacity-70"
            data-testid={missionWorkspaceTestIds.rallyLongitude}
            disabled={readOnly}
            inputmode="decimal"
            onchange={(event) => commitLongitude((event.currentTarget as HTMLInputElement).value)}
            type="number"
            value={coords.longitude_deg}
          />
        </label>

        <label class="space-y-1 rounded-lg border border-border bg-bg-secondary/60 p-3">
          <span class="text-xs font-medium text-text-muted">Altitude (m)</span>
          <input
            class="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary disabled:cursor-not-allowed disabled:opacity-70"
            data-testid={missionWorkspaceTestIds.rallyAltitude}
            disabled={readOnly}
            inputmode="decimal"
            onchange={(event) => commitAltitude((event.currentTarget as HTMLInputElement).value)}
            type="number"
            value={altitude.value}
          />
        </label>
      </div>

      <label class="space-y-1">
        <span class="text-xs font-medium text-text-muted">Altitude frame</span>
        <select
          class="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary disabled:cursor-not-allowed disabled:opacity-70"
          data-testid={missionWorkspaceTestIds.rallyAltitudeFrame}
          disabled={readOnly}
          onchange={(event) => {
            validationMessage = null;
            onUpdateAltitudeFrame(item.uiId, (event.currentTarget as HTMLSelectElement).value);
          }}
          value={altitude.frame}
        >
          <option value="msl">{altitudeFrameLabel("msl")}</option>
          <option value="rel_home">{altitudeFrameLabel("rel_home")}</option>
          <option value="terrain">{altitudeFrameLabel("terrain")}</option>
        </select>
      </label>

      <div class="rounded-lg border border-border bg-bg-secondary/60 px-4 py-3 text-xs text-text-secondary">
        The active frame is <span class="font-semibold text-text-primary">{altitudeFrameLabel(altitude.frame)}</span>. Switching frames keeps latitude and longitude intact and resets altitude to a safe zero baseline so terrain/home conversions never silently lie.
      </div>
    </div>
  {/if}

  {#if validationMessage}
    <p class="mt-3 text-xs text-warning" data-testid={missionWorkspaceTestIds.rallyInspectorValidation}>{validationMessage}</p>
  {/if}
</section>
