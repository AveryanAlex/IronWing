<script lang="ts">
import { parseLatitude, parseLongitude } from "../../../lib/mission-coordinates";
import type { TypedDraftItem } from "../../../lib/mission-draft-typed";
import { geoPoint3dAltitude, geoPoint3dLatLon, type GeoPoint3d } from "../../../lib/mavkit-types";
import type { MissionPlannerRallySelection } from "../../../lib/stores/mission-planner";
import { Alert, Badge, Card, EmptyState, Eyebrow, Field, HelperText, MonoValue, NativeSelect, NumberInput } from "../../../components/ui";
import { missionWorkspaceTestIds } from "../mission-workspace-test-ids";

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

<Card.Root as="section" density="compact" testId={missionWorkspaceTestIds.rallyInspector}>
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div>
      <Eyebrow>Rally inspector</Eyebrow>
      <h3 class="mt-1 text-sm font-semibold text-text-primary">Selected rally detail</h3>
    </div>

    <Badge variant="muted" size="sm" case="normal" shape="rounded" testId={missionWorkspaceTestIds.rallyInspectorSelectionKind}>
      {selectionLabel}
    </Badge>
  </div>

  {#if selection.kind === "none"}
    <EmptyState
      class="mt-4"
      testId={missionWorkspaceTestIds.rallyInspectorEmpty}
      title="No rally selection"
      description="Select a rally point from the list or map to edit coordinates and altitude-frame truth here without leaking those controls into mission or fence mode."
    />
  {:else if !item || !point || !coords || !altitude}
    <Alert
      class="mt-4"
      density="comfortable"
      variant="warning"
      title="Rally selection unavailable"
      description="The selected rally point could not be resolved from the active planner state, so the inspector stayed fail-closed instead of rendering broken controls."
    />
  {:else}
    <div class="mt-4 space-y-4">
      <Card.Root density="compact" surface="muted">
        <Eyebrow>Rally point {item.index + 1}</Eyebrow>
        <h4 class="mt-1 text-base font-semibold text-text-primary">Emergency / diversion target</h4>
        <HelperText class="mt-1" size="xs">
          Edit latitude, longitude, altitude, and frame here. IronWing preserves MSL, Rel Home, and Terrain locally, but .plan export will warn when QGroundControl forces non-RelHome rally frames into a lossy relative-alt bucket.
        </HelperText>
      </Card.Root>

      {#if readOnly}
        <Alert
          density="compact"
          variant="warning"
          description="Rally editing is read-only in the current planner attachment state. The point stays visible for truthful inspection, but edits stay blocked until you return to an editable scope."
        />
      {/if}

      <div class="mission-rally-coordinate-grid grid gap-3">
        <Card.Root density="compact" surface="muted">
          <Field.Root>
          <Field.Label class="text-xs font-medium text-text-muted">Latitude</Field.Label>
          <NumberInput
            testId={missionWorkspaceTestIds.rallyLatitude}
            disabled={readOnly}
            inputmode="decimal"
            onchange={(event) => commitLatitude((event.currentTarget as HTMLInputElement).value)}
            value={coords.latitude_deg}
          />
          </Field.Root>
        </Card.Root>

        <Card.Root density="compact" surface="muted">
          <Field.Root>
          <Field.Label class="text-xs font-medium text-text-muted">Longitude</Field.Label>
          <NumberInput
            testId={missionWorkspaceTestIds.rallyLongitude}
            disabled={readOnly}
            inputmode="decimal"
            onchange={(event) => commitLongitude((event.currentTarget as HTMLInputElement).value)}
            value={coords.longitude_deg}
          />
          </Field.Root>
        </Card.Root>

        <Card.Root density="compact" surface="muted">
          <Field.Root>
          <Field.Label class="text-xs font-medium text-text-muted">Altitude (m)</Field.Label>
          <NumberInput
            testId={missionWorkspaceTestIds.rallyAltitude}
            disabled={readOnly}
            inputmode="decimal"
            onchange={(event) => commitAltitude((event.currentTarget as HTMLInputElement).value)}
            value={altitude.value}
          />
          </Field.Root>
        </Card.Root>
      </div>

      <Field.Root>
        <Field.Label class="text-xs font-medium text-text-muted">Altitude frame</Field.Label>
        <NativeSelect
          testId={missionWorkspaceTestIds.rallyAltitudeFrame}
          disabled={readOnly}
          onchange={(event) => {
            validationMessage = null;
            onUpdateAltitudeFrame(item.uiId, (event.currentTarget as HTMLSelectElement).value);
          }}
          options={[{ value: "msl", label: altitudeFrameLabel("msl") }, { value: "rel_home", label: altitudeFrameLabel("rel_home") }, { value: "terrain", label: altitudeFrameLabel("terrain") }]}
          value={altitude.frame}
        />
      </Field.Root>

      <Card.Root density="compact" surface="muted">
        <HelperText size="xs">
          The active frame is <MonoValue class="font-semibold" size="xs">{altitudeFrameLabel(altitude.frame)}</MonoValue>. Switching frames keeps latitude and longitude intact and resets altitude to a safe zero baseline so terrain/home conversions never silently lie.
        </HelperText>
      </Card.Root>
    </div>
  {/if}

  {#if validationMessage}
    <HelperText class="mt-3" size="xs" tone="warning" testId={missionWorkspaceTestIds.rallyInspectorValidation}>{validationMessage}</HelperText>
  {/if}
</Card.Root>

<style>
  .mission-rally-coordinate-grid {
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
  }
</style>
